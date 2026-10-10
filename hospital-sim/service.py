"""Sahhanito hospital simulator: one OpenHospital Sim engine per Grand Tunis hospital.

    uvicorn service:app --port 8200

GET  /hospitals                 simulated availability of every active hospital
GET  /hospitals/{key}           one hospital
POST /hospitals/{key}/incoming  the backend announces a patient on the way: holds a bed for a while
GET  /health

The SimPy engines (ohsim/, vendored from OpenHospital Sim, MIT) model arrivals, triage, treatment,
ICU transfers, surges and staff shortages. This service adds what the triage platform needs on top:
capacity profiles per hospital type, equipment outages, an ED wait estimate, and bed holds for
Sahhanito patients. Every value is SIMULATED and labelled as such; ED staff overrides are applied by
the backend, not here.
"""
import asyncio
import json
import os
import random
import threading
import time
import zlib
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from ohsim.config import SimulationConfig
from ohsim.engine import EngineStatus, HospitalSimEngine

DATA = Path(os.environ.get('SAHHANITO_HOSPITALS', Path(__file__).resolve().parent.parent / 'data' / 'hospitals.grand-tunis.json'))
SIM_SPEED = float(os.environ.get('SIM_SPEED', '6'))      # simulated minutes per real minute
TICK_SECONDS = float(os.environ.get('SIM_TICK_SECONDS', '15'))
WARMUP_MINUTES = float(os.environ.get('SIM_WARMUP_MINUTES', '720'))  # start with a realistic, non-empty hospital
HOLD_MINUTES = 240.0     # a bed stays held for a Sahhanito patient for 4 simulated hours
OUTAGE_PER_HOUR = {'CT': 0.012, 'MRI': 0.01, 'CATH_LAB': 0.008, 'DIALYSIS': 0.006}
VERSION = 'hospital-sim-0.1'

# Capacity profiles (ED-oriented, illustrative): icu beds, ED/ward beds, doctors, nurses, mean minutes between arrivals.
PROFILES = {
    'CHU': dict(icu_beds=14, regular_beds=45, num_doctors=12, num_nurses=30, mean_inter_arrival_minutes=7.0),
    'MILITARY': dict(icu_beds=10, regular_beds=35, num_doctors=10, num_nurses=24, mean_inter_arrival_minutes=10.0),
    'REGIONAL': dict(icu_beds=6, regular_beds=28, num_doctors=7, num_nurses=16, mean_inter_arrival_minutes=11.0),
    'SPECIALIZED_INSTITUTE': dict(icu_beds=5, regular_beds=18, num_doctors=5, num_nurses=12, mean_inter_arrival_minutes=16.0),
}


SETTING_KEYS = ('icu_beds', 'regular_beds', 'num_doctors', 'num_nurses', 'mean_inter_arrival_minutes', 'seed')


class Hospital:
    def __init__(self, facility):
        self.key = facility['key']
        self.name = facility['name']
        self.type = facility['type']
        self.equipment = list(facility.get('equipment', []))
        self.defaults = dict(PROFILES.get(self.type, PROFILES['REGIONAL']), seed=zlib.crc32(self.key.encode()))
        self.events = {}    # kind -> {until, ...}: surge, shortage, closed (scenario controls)
        self.start(dict(self.defaults))

    def start(self, settings, warmup=WARMUP_MINUTES):
        """(Re)build the engine with these settings. ED-oriented tuning: ICU stays of ~15 h and fewer critical
        arrivals, otherwise the default 2-day ICU stays keep every ICU permanently full."""
        self.settings = {k: settings[k] for k in SETTING_KEYS}
        self.rng = random.Random(self.settings['seed'])
        self.config = SimulationConfig(max_simulation_time=10 ** 9, icu_treatment_duration_mean=900.0,
                                       prob_critical=0.03, prob_high=0.20, prob_medium=0.45, prob_low=0.32,
                                       prob_icu_transfer=0.04, **self.settings)
        self.engine = HospitalSimEngine()
        self.engine.start(self.config)
        self.engine.step(warmup)
        self.outages = {}   # equipment -> simulated time when it comes back
        self.holds = []     # simulated times when held beds are released
        self.apply_surge()

    def now(self):
        return self.engine.simulation_time

    def apply_surge(self):
        """A surge shortens the time between arrivals while it lasts (the arrival process reads the live config)."""
        surge = self.events.get('surge')
        base = self.settings['mean_inter_arrival_minutes']
        self.config.mean_inter_arrival_minutes = base / surge['factor'] if surge else base

    def add_event(self, kind, minutes, **data):
        until = self.now() + minutes
        if kind == 'outage':
            if data['equipment'] in self.equipment:
                self.outages[data['equipment']] = until
            return
        if kind == 'holds':
            self.holds.extend([until] * data['beds'])
            return
        self.events[kind] = dict(until=until, **data)
        self.apply_surge()

    def clear_events(self):
        self.events.clear()
        self.outages.clear()
        self.holds.clear()
        self.apply_surge()

    def active_events(self):
        now = self.now()
        out = [dict(kind=k, remainingMinutes=round(v['until'] - now), **{x: y for x, y in v.items() if x != 'until'})
               for k, v in self.events.items()]
        out += [dict(kind='outage', equipment=e, remainingMinutes=round(t - now)) for e, t in self.outages.items()]
        if self.holds:
            out.append(dict(kind='holds', beds=len(self.holds), remainingMinutes=round(max(self.holds) - now)))
        return out

    def advance(self, minutes, auto_outages=True):
        if self.engine.status != EngineStatus.ACTIVE:
            self.engine.reset()
            self.engine.start(self.config)
        self.engine.step(minutes)
        now = self.engine.simulation_time
        hours = minutes / 60
        if auto_outages:
            for item, per_hour in OUTAGE_PER_HOUR.items():
                if item in self.equipment and item not in self.outages and self.rng.random() < per_hour * hours:
                    self.outages[item] = now + self.rng.uniform(90, 360)
        self.outages = {k: v for k, v in self.outages.items() if v > now}
        self.holds = [t for t in self.holds if t > now]
        expired = [k for k, v in self.events.items() if v['until'] <= now]
        for k in expired:
            del self.events[k]
        if 'surge' in expired:
            self.apply_surge()

    def hold_bed(self):
        self.holds.append(self.engine.simulation_time + HOLD_MINUTES)

    def view(self):
        s = self.engine.get_state_snapshot()
        statuses = [p['status'] for p in s.active_patients]
        waiting = sum(st in ('waiting', 'in_triage', 'waiting_for_doctor') for st in statuses)
        in_ed = sum(st != 'in_icu' for st in statuses)          # every ED patient takes a bed / trolley
        beds = max(0, s.total_regular_beds - in_ed - len(self.holds))
        icu_free = s.available_icu_beds
        down = sorted(self.outages)
        if 'ICU' in self.equipment and icu_free == 0:
            down.append('ICU')
        # Scenario staff shortage: a share of doctors and nurses is absent.
        short = self.events.get('shortage')
        keep = 1 - short['fraction'] if short else 1.0
        doctors = max(1, round(s.staff.available_doctors * keep))
        nurses = max(1, round(s.staff.available_nurses * keep))
        shortage = s.staff.shortage_active or bool(short)
        # Queue ahead / doctors on shift x mean treatment time, plus a shortage penalty; capped at 4 h.
        per_doctor = waiting / doctors
        wait = min(240, round(10 + per_doctor * self.config.treatment_duration_mean / 2 + (15 if shortage else 0)))
        return dict(
            key=self.key, name=self.name, simulated=True,
            bedsAvailable=beds, bedsTotal=s.total_regular_beds,
            icuAvailable=icu_free, icuTotal=s.total_icu_beds,
            doctorsAvailable=doctors, doctorsTotal=s.staff.total_doctors,
            nursesAvailable=nurses, nursesTotal=s.staff.total_nurses,
            staffShortage=shortage,
            accepting='closed' not in self.events,
            emergencyQueue=s.emergency_queue_length,
            waitingPatients=waiting,
            waitMinutes=wait,
            equipmentDown=down,
            heldBeds=len(self.holds),
            activePatients=len(s.active_patients),
            simulationMinutes=round(s.simulation_time, 1),
            updatedAt=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        )


class Simulator:
    def __init__(self):
        facilities = [f for f in json.loads(DATA.read_text(encoding='utf-8'))['facilities'] if f.get('isActive')]
        self.hospitals = {f['key']: Hospital(f) for f in facilities}
        self.lock = threading.RLock()
        self.speed = SIM_SPEED
        self.paused = False
        self.auto_outages = True
        self.log = []       # recent scenario actions, newest first

    def tick(self, minutes):
        with self.lock:
            for h in self.hospitals.values():
                h.advance(minutes, self.auto_outages)

    def note(self, text):
        self.log.insert(0, dict(at=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), text=text))
        del self.log[30:]

    def targets(self, keys):
        if keys in (None, 'all') or keys == ['all']:
            return list(self.hospitals.values())
        return [self.get(k) for k in keys]

    def views(self):
        with self.lock:
            return [h.view() for h in self.hospitals.values()]

    def get(self, key):
        h = self.hospitals.get(key)
        if h is None:
            raise HTTPException(status_code=404, detail=f'unknown hospital {key!r}')
        return h


sim: Simulator | None = None


async def _clock():
    while True:
        await asyncio.sleep(TICK_SECONDS)
        if not sim.paused:
            await asyncio.to_thread(sim.tick, sim.speed * TICK_SECONDS / 60)


@asynccontextmanager
async def lifespan(_app):
    global sim
    sim = await asyncio.to_thread(Simulator)
    task = asyncio.create_task(_clock())
    yield
    task.cancel()


app = FastAPI(title='Sahhanito hospital simulator', version=VERSION, lifespan=lifespan)


class Incoming(BaseModel):
    count: int = Field(default=1, ge=1, le=20)


@app.get('/hospitals')
def hospitals():
    return dict(simulated=True, speed=SIM_SPEED, hospitals=sim.views())


@app.get('/hospitals/{key}')
def hospital(key: str):
    h = sim.get(key)
    with sim.lock:
        return h.view()


@app.post('/hospitals/{key}/incoming')
def incoming(key: str, body: Incoming):
    h = sim.get(key)
    with sim.lock:
        for _ in range(body.count):
            h.hold_bed()
        return h.view()


# ---- Scenario controls (used by the dashboard's Simulation tab, through the backend) ----------------

EQUIPMENT_EVENTS = ('CT', 'MRI', 'CATH_LAB', 'DIALYSIS')


class GlobalIn(BaseModel):
    speed: float | None = Field(default=None, ge=0.5, le=240)
    paused: bool | None = None
    autoOutages: bool | None = None


class StepIn(BaseModel):
    minutes: float = Field(ge=1, le=7 * 24 * 60)


class SettingsIn(BaseModel):
    icu_beds: int = Field(ge=1, le=200)
    regular_beds: int = Field(ge=1, le=500)
    num_doctors: int = Field(ge=1, le=200)
    num_nurses: int = Field(ge=1, le=500)
    mean_inter_arrival_minutes: float = Field(ge=0.5, le=240)
    seed: int | None = None


class EventIn(BaseModel):
    kind: str = Field(pattern='^(surge|shortage|outage|closed|holds)$')
    hospitals: list[str] | str = 'all'
    minutes: float = Field(default=240, ge=5, le=7 * 24 * 60)
    factor: float = Field(default=3.0, ge=1.2, le=10)           # surge: arrivals x factor
    fraction: float = Field(default=0.4, ge=0.1, le=0.9)       # shortage: share of staff absent
    equipment: str | None = None                                # outage
    beds: int = Field(default=5, ge=1, le=50)                   # holds: beds taken at once


PRESETS = {
    'normal': ('Journée normale', []),
    'mass_casualty': ('Accident grave : afflux massif sur Tunis centre', [
        dict(kind='surge', hospitals=['charles-nicolle', 'la-rabta', 'habib-thameur', 'aziza-othmana'], factor=4, minutes=240),
        dict(kind='holds', hospitals=['charles-nicolle', 'la-rabta'], beds=8, minutes=360)]),
    'strike': ('Grève / sous-effectif dans tout le réseau', [dict(kind='shortage', hospitals='all', fraction=0.5, minutes=480)]),
    'ct_down': ('Panne du scanner à Charles Nicolle', [dict(kind='outage', hospitals=['charles-nicolle'], equipment='CT', minutes=480)]),
    'winter': ('Pic hivernal : affluence dans tout le réseau', [dict(kind='surge', hospitals='all', factor=1.8, minutes=720)]),
}


def scenario_view():
    with sim.lock:
        return dict(speed=sim.speed, paused=sim.paused, autoOutages=sim.auto_outages, tickSeconds=TICK_SECONDS,
                    presets=[dict(id=k, label=v[0]) for k, v in PRESETS.items()], log=sim.log,
                    hospitals=[dict(key=h.key, name=h.name, type=h.type, equipment=h.equipment, settings=h.settings,
                                    defaults=h.defaults, events=h.active_events(), view=h.view()) for h in sim.hospitals.values()])


def apply_event(e: EventIn):
    targets = sim.targets(e.hospitals)
    if e.kind == 'outage' and e.equipment not in EQUIPMENT_EVENTS:
        raise HTTPException(422, f'equipment must be one of {EQUIPMENT_EVENTS}')
    for h in targets:
        h.add_event(e.kind, e.minutes, **({'factor': e.factor} if e.kind == 'surge' else {'fraction': e.fraction} if e.kind == 'shortage'
                                          else {'equipment': e.equipment} if e.kind == 'outage' else {'beds': e.beds} if e.kind == 'holds' else {}))
    where = 'tout le réseau' if e.hospitals in ('all', ['all']) else ', '.join(h.name for h in targets)
    label = {'surge': f'Afflux x{e.factor:g}', 'shortage': f'Sous-effectif {round(e.fraction * 100)} %', 'outage': f'Panne {e.equipment}',
             'closed': 'Fermeture aux nouveaux patients', 'holds': f'{e.beds} lit(s) occupé(s)'}[e.kind]
    sim.note(f'{label} · {where} · {int(e.minutes)} min')


@app.get('/scenario')
def scenario():
    return scenario_view()


@app.put('/scenario')
def set_global(body: GlobalIn):
    with sim.lock:
        if body.speed is not None:
            sim.speed = body.speed
            sim.note(f'Vitesse : x{body.speed:g}')
        if body.paused is not None:
            sim.paused = body.paused
            sim.note('Simulation en pause' if body.paused else 'Simulation relancée')
        if body.autoOutages is not None:
            sim.auto_outages = body.autoOutages
            sim.note('Pannes aléatoires activées' if body.autoOutages else 'Pannes aléatoires désactivées')
    return scenario_view()


@app.post('/scenario/step')
def step(body: StepIn):
    sim.tick(body.minutes)
    with sim.lock:
        sim.note(f'Avance manuelle : +{int(body.minutes)} min')
    return scenario_view()


@app.post('/scenario/reset')
def reset():
    with sim.lock:
        for h in sim.hospitals.values():
            h.events.clear()
            h.start(dict(h.defaults))
        sim.speed, sim.paused, sim.auto_outages = SIM_SPEED, False, True
        sim.note('Réinitialisation de tout le réseau')
    return scenario_view()


@app.put('/hospitals/{key}/settings')
def set_settings(key: str, body: SettingsIn):
    h = sim.get(key)
    with sim.lock:
        settings = body.model_dump()
        settings['seed'] = settings['seed'] if settings['seed'] is not None else h.settings['seed']
        h.start(settings, warmup=360)
        sim.note(f"Paramètres modifiés · {h.name} (lits {body.regular_beds}, réa {body.icu_beds}, médecins {body.num_doctors})")
    return scenario_view()


@app.post('/scenario/events')
def add_event(body: EventIn):
    with sim.lock:
        apply_event(body)
    return scenario_view()


@app.delete('/scenario/events')
def clear_events(hospital: str | None = None):
    with sim.lock:
        for h in sim.targets([hospital] if hospital else 'all'):
            h.clear_events()
        sim.note(f"Événements effacés · {sim.get(hospital).name if hospital else 'tout le réseau'}")
    return scenario_view()


@app.post('/scenario/preset/{preset}')
def preset(preset: str):
    if preset not in PRESETS:
        raise HTTPException(404, 'unknown preset')
    label, events = PRESETS[preset]
    with sim.lock:
        for h in sim.hospitals.values():
            h.clear_events()
        for e in events:
            apply_event(EventIn(**e))
        sim.note(f'Scénario : {label}')
    return scenario_view()


@app.get('/health')
def health():
    return dict(ok=sim is not None, hospitals=len(sim.hospitals) if sim else 0, speed=SIM_SPEED, version=VERSION)
