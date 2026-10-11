"""OpenHospital Sim dashboard API on top of the Sahhanito simulator.

The original Next.js dashboard (dashboard/, MIT) expects one hospital behind /api/v1. Here every route
takes ?hospital=<key> (default: the first hospital) and answers from that hospital's engine and its
7 agents, in the shapes of dashboard/src/types/index.ts. The clock is the network clock: a manual step
advances every hospital so they stay in sync. /api/v1/network/* exposes the network scenario controls
(presets, speed, pause, surges, outages...) of service.py to the dashboard's Scenario panel.

No authentication: like the rest of this service, keep it on a private network.
"""
import time
import uuid
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query

import service
from ohsim.forecasting.demand_forecaster import DemandForecaster
from ohsim.forecasting.icu_forecaster import ICUForecaster
from ohsim.forecasting.schemas import ForecastRunRequest, OptimizationRunRequest
from ohsim.forecasting.staffing_forecaster import StaffingForecaster, WardUtilizationForecaster
from ohsim.forecasting.surge_detector import SurgeDetector
from ohsim.optimization.base import OptimizerConfig
from ohsim.optimization.genetic_algorithm import GeneticOptimizer
from ohsim.optimization.greedy import GreedyOptimizer
from ohsim.optimization.particle_swarm import ParticleSwarmOptimizer

router = APIRouter(prefix='/api/v1')
STARTED = time.time()
OPTIMIZERS = {'greedy': GreedyOptimizer, 'genetic': GeneticOptimizer, 'pso': ParticleSwarmOptimizer}
_demand, _icu, _ward, _staffing, _surge = DemandForecaster(), ICUForecaster(), WardUtilizationForecaster(), StaffingForecaster(), SurgeDetector()
_forecasts: dict[str, dict] = {}       # hospital key -> latest ForecastBundle
_optimizations: dict[str, dict] = {}   # hospital key -> latest OptimizationResult


def _hospital(key: str | None):
    sim = service.sim
    return sim.get(key) if key else next(iter(sim.hospitals.values()))


def _iso():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def snapshot(h) -> dict[str, Any]:
    """HospitalSnapshot. Beds and doctors are the values Sahhanito uses (ED trolleys, held beds, scenario shortage)."""
    s = h.engine.get_state_snapshot()
    v = h.view()
    return dict(
        simulation_time=round(s.simulation_time), step_number=s.step_count,
        icu_occupancy=s.icu_occupancy, icu_total_beds=s.total_icu_beds, icu_available_beds=v['icuAvailable'],
        regular_bed_occupancy=v['bedsTotal'] - v['bedsAvailable'], regular_total_beds=v['bedsTotal'], regular_available_beds=v['bedsAvailable'],
        emergency_queue_length=s.emergency_queue_length,
        available_doctors=v['doctorsAvailable'], total_doctors=v['doctorsTotal'],
        available_nurses=v['nursesAvailable'], total_nurses=v['nursesTotal'],
        doctor_workload=round(s.doctor_workload, 4), nurse_workload=round(s.nurse_workload, 4),
        patient_throughput=s.patient_throughput, equipment_utilization=round(s.equipment_utilization, 4),
        active_patient_count=len(s.active_patients), discharged_count=s.discharged_count, deceased_count=s.deceased_count,
        status='ACTIVE',     # the engines never stop (the network clock can be paused: /api/v1/network)
        # Sahhanito extras, shown by the dashboard's hospital header
        hospital=dict(key=h.key, name=h.name, type=h.type, accepting=v['accepting'], waitMinutes=v['waitMinutes'],
                      equipmentDown=v['equipmentDown'], heldBeds=v['heldBeds'], events=h.active_events()),
    )


def decision(d: dict) -> dict:
    return dict(d, priority=str(d['priority']).upper())


def agent_state(a: dict) -> dict:
    return dict(agent_id=a['agent_id'], agent_type=a['agent_type'], agent_name=a['name'], status=str(a['status']).upper(),
                events_processed=a['events_processed'], decisions_made=a['decisions_made'],
                last_event_time=a.get('last_sim_time'), reasoning_summary=a.get('reasoning_summary'))


def time_series(h) -> list[dict]:
    return [dict(step=p['step'], simulation_time=p['simulation_time'], arrivals=p['arrivals'], icu_utilization=p['icu_utilization'],
                 ward_utilization=p['ward_utilization'], queue_length=p['emergency_queue'], discharged=p['discharged_total'],
                 deceased=p['deceased_total']) for p in h.agents.get_forecast_time_series()]


# ---- health / hospitals -------------------------------------------------------------------------

@router.get('/health')
def health():
    # The original shows PostgreSQL / Redis latencies; this service has neither (the dashboard hides them).
    return dict(status='healthy' if service.sim else 'unhealthy', services=dict(postgres=dict(status='n/a', latency_ms=0),
                redis=dict(status='n/a', latency_ms=0)), uptime_seconds=round(time.time() - STARTED))


@router.get('/hospitals')
def hospitals():
    with service.sim.lock:
        return [dict(key=h.key, name=h.name, type=h.type) for h in service.sim.hospitals.values()]


# ---- simulation ---------------------------------------------------------------------------------

@router.post('/simulation/start')
def start(body: dict = Body(default={}), hospital: str | None = Query(None)):
    """Restart this hospital's engine with the dashboard's configuration (6 simulated hours of warm-up)."""
    h = _hospital(hospital)
    config = (body or {}).get('config') or {}
    with service.sim.lock:
        settings = dict(h.settings)
        for k in service.SETTING_KEYS:
            if config.get(k) is not None:
                settings[k] = config[k]
        try:
            service.SettingsIn(**settings)
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        h.start(settings, warmup=360)
        service.sim.note(f"Configuration (tableau OpenHospital) · {h.name} (lits {settings['regular_beds']}, réa {settings['icu_beds']}, "
                         f"médecins {settings['num_doctors']}, arrivée toutes les {settings['mean_inter_arrival_minutes']} min)")
        return snapshot(h)


@router.post('/simulation/step')
def step(body: dict = Body(default={}), hospital: str | None = Query(None)):
    minutes = float((body or {}).get('step_minutes') or 60)
    if not 1 <= minutes <= 7 * 24 * 60:
        raise HTTPException(422, 'step_minutes must be between 1 and 10080')
    h = _hospital(hospital)
    service.sim.tick(minutes)      # the whole network, so the hospitals stay on the same clock
    with service.sim.lock:
        service.sim.note(f'Avance manuelle : +{int(minutes)} min (tableau OpenHospital)')
        s = snapshot(h)
        return dict(step_number=s['step_number'], simulation_time=s['simulation_time'], events=list(reversed(h.last_events[-200:])),
                    snapshot=s, agent_decisions=[decision(d) for d in reversed(h.last_decisions[-50:])], events_count=len(h.last_events))


@router.post('/simulation/reset')
def reset(hospital: str | None = Query(None)):
    h = _hospital(hospital)
    with service.sim.lock:
        h.clear_events()
        h.start(dict(h.defaults))
        service.sim.note(f'Réinitialisation · {h.name}')
        return snapshot(h)


@router.get('/simulation/state')
def state(hospital: str | None = Query(None)):
    h = _hospital(hospital)
    with service.sim.lock:
        return dict(status='ok', simulation_time=h.now(), engine_status='active', data=dict(state=snapshot(h)))


@router.get('/simulation/events')
def events(hospital: str | None = Query(None), since_time: float | None = None, since_step: int | None = None,
           event_type: str | None = None, limit: int = Query(200, ge=1, le=5000)):
    h = _hospital(hospital)
    with service.sim.lock:
        out = h.engine.get_events(since_time=since_time, since_step=since_step, event_type=event_type, limit=limit)
    return list(reversed(out))


# ---- agents -------------------------------------------------------------------------------------

@router.get('/agents')
def agents(hospital: str | None = Query(None)):
    h = _hospital(hospital)
    with service.sim.lock:
        return dict(agents=[agent_state(a) for a in h.agents.list_agents()])


@router.get('/agents/registry')
def registry(hospital: str | None = Query(None)):
    h = _hospital(hospital)
    with service.sim.lock:
        info = h.agents.get_registry_info()
        return dict(total_agents=info['agent_count'], total_events_processed=info['total_events_processed'],
                    total_decisions_made=info['total_decisions'], agents=[agent_state(a) for a in h.agents.list_agents()])


@router.get('/agents/decisions/recent')
def recent(hospital: str | None = Query(None), limit: int = Query(50, ge=1, le=1000), agent_id: str | None = None,
           agent_type: str | None = None, priority: str | None = None, since_sim_time: float | None = None):
    h = _hospital(hospital)
    with service.sim.lock:
        out = h.agents.get_recent_decisions(limit=limit, agent_id=agent_id, agent_type=agent_type,
                                            priority=priority.lower() if priority else None, since_sim_time=since_sim_time)
    return [decision(d) for d in reversed(out)]


@router.get('/agents/forecast/timeseries')
def timeseries(hospital: str | None = Query(None)):
    h = _hospital(hospital)
    with service.sim.lock:
        return dict(time_series=time_series(h))


@router.get('/agents/{agent_id}')
def agent(agent_id: str, hospital: str | None = Query(None)):
    h = _hospital(hospital)
    with service.sim.lock:
        a = h.agents.get_agent_state(agent_id)
    if a is None:
        raise HTTPException(404, f'Agent {agent_id!r} not found.')
    return agent_state(a)


@router.get('/agents/{agent_id}/logs')
def agent_logs(agent_id: str, hospital: str | None = Query(None), limit: int = Query(50, ge=1, le=500)):
    h = _hospital(hospital)
    with service.sim.lock:
        logs = h.agents.get_agent_logs(agent_id, limit=limit)
    if logs is None:
        raise HTTPException(404, f'Agent {agent_id!r} not found.')
    return [decision(d) for d in reversed(logs)]


# ---- forecasting --------------------------------------------------------------------------------

def _result(name, fc, step_min) -> dict:
    d = fc.to_dict()
    return dict(forecaster_name=name, metric=d['metric'], horizon_steps=d['horizon_steps'], confidence=d['confidence'],
                trend_direction=d['trend'] if d['trend'] in ('increasing', 'decreasing', 'stable') else 'stable',
                points=[dict(step=p['step_ahead'], simulation_time=p['sim_time_ahead'], value=p['value'],
                             lower_bound=p['lower_ci'], upper_bound=p['upper_ci']) for p in d['points']])


@router.post('/forecasting/run')
def forecast(body: ForecastRunRequest = Body(default_factory=ForecastRunRequest), hospital: str | None = Query(None)):
    h = _hospital(hospital)
    with service.sim.lock:
        series = h.agents.get_forecast_time_series()
        snap = h.engine.get_state_snapshot()
    # One data point per clock tick here (not per hour as in the original): use the real step length.
    step_min = (series[-1]['simulation_time'] - series[0]['simulation_time']) / (len(series) - 1) if len(series) > 1 else body.step_duration_min
    demand = _demand.forecast(series, body.horizon_steps, step_min)
    icu = _icu.forecast(series, body.horizon_steps, step_min)
    ward = _ward.forecast(series, body.horizon_steps, step_min)
    staffing = _staffing.recommend(demand)
    peak = _staffing.peak_staffing(staffing)
    surge = _surge.assess(series, snap).to_dict()
    bundle = dict(
        demand=_result('Holt · demand', demand, step_min),
        icu=dict(_result('Holt · ICU', icu, step_min), steps_to_saturation=_icu.steps_to_saturation(icu),
                 saturation_probability=round(_icu.saturation_probability(icu), 4)),
        ward=_result('Holt · ward', ward, step_min),
        staffing=dict(_result('Demand-derived staffing', demand, step_min), metric='staffing_recommendations',
                      peak_doctors=peak.get('doctors_needed'), peak_nurses=peak.get('nurses_needed')),
        surge_risk=dict(risk_level=surge['risk_level'], composite_score=surge['risk_score'],
                        signals={k: v for k, v in surge['signals'].items() if isinstance(v, (int, float))},
                        recommended_actions=surge['recommended_actions'], assessed_at=surge['simulation_time']),
        generated_at=_iso(), run_id=str(uuid.uuid4()), data_points=len(series), step_duration_min=round(step_min, 2),
    )
    _forecasts[h.key] = bundle
    return bundle


@router.get('/forecasting/latest')
def latest_forecast(hospital: str | None = Query(None)):
    h = _hospital(hospital)
    return _forecasts.get(h.key) or forecast(ForecastRunRequest(), h.key)


@router.get('/forecasting/surge-risk')
def surge_risk(hospital: str | None = Query(None)):
    return latest_forecast(hospital)['surge_risk']


# ---- optimization -------------------------------------------------------------------------------

@router.post('/optimization/run')
def optimize(body: OptimizationRunRequest = Body(default_factory=OptimizationRunRequest), hospital: str | None = Query(None)):
    h = _hospital(hospital)
    with service.sim.lock:
        snap = h.engine.get_state_snapshot()
    r = OPTIMIZERS[body.algorithm](OptimizerConfig(seed=body.seed, max_iterations=body.max_iterations)).optimize(snap).to_dict()
    sol = r['best_solution']
    out = dict(algorithm=r['algorithm'], best_score=r['best_score'], baseline_score=r['baseline_score'],
               improvement_pct=r['improvement_pct'], evaluations=r['evaluations'], wall_time_seconds=r['wall_time_seconds'],
               recommendations=r['recommendations'], generated_at=_iso(),
               convergence_history=[c['best_score'] for c in r['convergence_history']],
               best_solution={k: round(sol.get(k, 0)) for k in ('doctors_on_duty', 'nurses_on_duty', 'icu_beds_active', 'regular_beds_active')})
    _optimizations[h.key] = out
    return out


@router.get('/optimization/results')
def latest_optimization(hospital: str | None = Query(None)):
    h = _hospital(hospital)
    return _optimizations.get(h.key) or optimize(OptimizationRunRequest(), h.key)


# ---- network scenario (the controls the Sahhanito platform reacts to) ---------------------------

@router.get('/network')
def network():
    return service.scenario_view()


@router.put('/network')
def network_set(body: service.GlobalIn):
    return service.set_global(body)


@router.post('/network/step')
def network_step(body: service.StepIn):
    return service.step(body)


@router.post('/network/reset')
def network_reset():
    return service.reset()


@router.post('/network/events')
def network_event(body: service.EventIn):
    return service.add_event(body)


@router.delete('/network/events')
def network_clear(hospital: str | None = None):
    return service.clear_events(hospital)


@router.post('/network/preset/{preset}')
def network_preset(preset: str):
    return service.preset(preset)


@router.put('/network/hospitals/{key}/settings')
def network_settings(key: str, body: service.SettingsIn):
    return service.set_settings(key, body)
