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


class Hospital:
    def __init__(self, facility):
        self.key = facility['key']
        self.name = facility['name']
        self.type = facility['type']
        self.equipment = list(facility.get('equipment', []))
        seed = zlib.crc32(self.key.encode())
        self.rng = random.Random(seed)
        # ED-oriented tuning: ICU stays of ~15 h (step-down after stabilisation) and fewer critical arrivals,
        # otherwise the default 2-day ICU stays keep every ICU permanently full.
        self.config = SimulationConfig(seed=seed, max_simulation_time=10 ** 9, icu_treatment_duration_mean=900.0,
                                       prob_critical=0.03, prob_high=0.20, prob_medium=0.45, prob_low=0.32,
                                       prob_icu_transfer=0.04, **PROFILES.get(self.type, PROFILES['REGIONAL']))
        self.engine = HospitalSimEngine()
        self.engine.start(self.config)
        self.engine.step(WARMUP_MINUTES)
        self.outages = {}   # equipment -> simulated time when it comes back
        self.holds = []     # simulated times when held beds are released

    def advance(self, minutes):
        if self.engine.status != EngineStatus.ACTIVE:
            self.engine.reset()
            self.engine.start(self.config)
        self.engine.step(minutes)
        now = self.engine.simulation_time
        hours = minutes / 60
        for item, per_hour in OUTAGE_PER_HOUR.items():
            if item in self.equipment and item not in self.outages and self.rng.random() < per_hour * hours:
                self.outages[item] = now + self.rng.uniform(90, 360)
        self.outages = {k: v for k, v in self.outages.items() if v > now}
        self.holds = [t for t in self.holds if t > now]

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
        # Queue ahead / doctors on shift x mean treatment time, plus a shortage penalty; capped at 4 h.
        per_doctor = waiting / max(1, s.staff.available_doctors)
        wait = min(240, round(10 + per_doctor * self.config.treatment_duration_mean / 2 + (15 if s.staff.shortage_active else 0)))
        return dict(
            key=self.key, name=self.name, simulated=True,
            bedsAvailable=beds, bedsTotal=s.total_regular_beds,
            icuAvailable=icu_free, icuTotal=s.total_icu_beds,
            doctorsAvailable=s.staff.available_doctors, doctorsTotal=s.staff.total_doctors,
            nursesAvailable=s.staff.available_nurses, nursesTotal=s.staff.total_nurses,
            staffShortage=s.staff.shortage_active,
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
        self.lock = threading.Lock()

    def tick(self, minutes):
        with self.lock:
            for h in self.hospitals.values():
                h.advance(minutes)

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
        await asyncio.to_thread(sim.tick, SIM_SPEED * TICK_SECONDS / 60)


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


@app.get('/health')
def health():
    return dict(ok=sim is not None, hospitals=len(sim.hospitals) if sim else 0, speed=SIM_SPEED, version=VERSION)
