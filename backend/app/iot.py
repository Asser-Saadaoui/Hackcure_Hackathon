"""Simulated IoT: ambulance monitors (iot-sim/) streaming vital signs to the receiving hospital.

Device security (on top of HTTPS):
  - each monitor has its own key: HMAC-SHA256(IOT_KEY, device id); the master key never leaves the server and the
    simulator (a real fleet would provision per-device keys or certificates);
  - every message is signed: sig = HMAC-SHA256(device key, canonical JSON of the message without sig);
  - freshness (60 s) and a strictly increasing sequence number per device: replayed or reordered messages are refused;
  - the device must be the monitor of the ambulance assigned to that referral, and values must be physiological.
The gateway (the simulator) lists the monitors to run with a token derived from the same master key.

The readings are DISPLAYED to the hospital (live, with alerts). They are never sent to the AI service: simulated
data plays no part in detection or classification.
"""
import hashlib
import hmac
import json
import time
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select

from app import config
from app.models import Ambulance, Case, Referral, VitalReading

MONITORED = ('AT_PATIENT', 'TRANSPORTING')     # the monitor is on the patient from pickup to arrival
FRESHNESS_S = 60
# (field, low, high): physiological ranges accepted from a device; anything else is a faulty message.
RANGES = {'heartRate': (20, 250), 'spo2': (50, 100), 'respRate': (4, 60), 'systolic': (50, 250), 'diastolic': (25, 150),
          'temperature': (30, 43)}
# Alert thresholds (adult, prototype values pending clinical review).
ALERTS = [('spo2', lambda v: v < 90, 'SpO2 < 90 %'), ('heartRate', lambda v: v > 130, 'FC > 130/min'),
          ('heartRate', lambda v: v < 45, 'FC < 45/min'), ('systolic', lambda v: v < 90, 'PAS < 90 mmHg'),
          ('respRate', lambda v: v > 28, 'FR > 28/min'), ('temperature', lambda v: v >= 39.5, 'T ≥ 39,5 °C')]
_last_seq: dict[str, int] = {}


def device_key(device_id: str) -> bytes:
    return hmac.new(config.IOT_KEY.encode(), device_id.encode(), hashlib.sha256).digest()


def gateway_token() -> str:
    return hmac.new(config.IOT_KEY.encode(), b'gateway', hashlib.sha256).hexdigest()


def check_gateway(authorization: str | None):
    token = (authorization or '').removeprefix('Bearer ').strip()
    if not hmac.compare_digest(token, gateway_token()):
        raise HTTPException(401, 'Invalid IoT gateway token.')


def canonical(message: dict) -> bytes:
    return json.dumps({k: v for k, v in message.items() if k != 'sig'}, sort_keys=True, separators=(',', ':')).encode()


def device_id_for(amb: Ambulance) -> str:
    return f'MON-{amb.unit_name}'


def assignments(db):
    """Monitors the simulator should run: ambulances that have the patient on board."""
    from app.services import ambulance_view
    out = []
    for amb in db.scalars(select(Ambulance).where(Ambulance.status.not_in(['ARRIVED', 'CANCELLED']))):
        r = db.get(Referral, amb.referral_id)
        view = ambulance_view(amb, r)
        if view['status'] not in MONITORED:
            continue
        case = db.get(Case, amb.case_id)
        rules = [x.get('id', '') for x in (case.decision or {}).get('triggeredRules', [])]
        out.append(dict(deviceId=device_id_for(amb), referralId=r.id, unit=amb.unit_name, level=case.level,
                        rules=rules, position=view['position'], status=view['status']))
    return out


def alerts_for(vitals: dict) -> list[str]:
    return [label for field, test, label in ALERTS if isinstance(vitals.get(field), (int, float)) and test(vitals[field])]


def ingest(db, message: dict):
    """Verify one signed telemetry message, store it and push it to the hospital. Returns the stored reading."""
    device, referral_id = message.get('deviceId'), message.get('referralId')
    if not isinstance(device, str) or not isinstance(referral_id, str):
        raise HTTPException(422, 'deviceId and referralId are required.')
    expected = hmac.new(device_key(device), canonical(message), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, str(message.get('sig', ''))):
        raise HTTPException(403, 'Invalid device signature.')
    ts, seq = message.get('ts'), message.get('seq')
    if not isinstance(ts, (int, float)) or abs(time.time() - ts / 1000) > FRESHNESS_S:
        raise HTTPException(400, 'Stale telemetry.')
    if not isinstance(seq, int) or seq <= _last_seq.get(device, -1):
        raise HTTPException(409, 'Replayed or out-of-order telemetry.')
    amb = db.get(Ambulance, referral_id)
    if amb is None or device_id_for(amb) != device or amb.status in ('ARRIVED', 'CANCELLED'):
        raise HTTPException(403, 'This device is not monitoring this referral.')
    vitals = message.get('vitals') or {}
    clean = {}
    for field, (low, high) in RANGES.items():
        v = vitals.get(field)
        if v is None:
            continue
        if not isinstance(v, (int, float)) or not low <= v <= high:
            raise HTTPException(422, f'{field} out of range.')
        clean[field] = round(float(v), 1)
    _last_seq[device] = seq
    pos = message.get('position')
    reading = VitalReading(referral_id=referral_id, case_id=amb.case_id, device_id=device, seq=seq,
                           measured_at=datetime.fromtimestamp(ts / 1000, timezone.utc), vitals=clean,
                           position=pos if isinstance(pos, dict) else None, alerts=alerts_for(clean))
    db.add(reading)
    db.commit()
    from app.services import publish_hospital
    r = db.get(Referral, referral_id)
    view = reading_view(reading)
    publish_hospital(r.facility_key, dict(type='iot.vitals', referralId=referral_id, reading=view))
    if reading.alerts:
        publish_hospital(r.facility_key, dict(type='iot.alert', referralId=referral_id, alerts=reading.alerts))
    return reading


def reading_view(x: VitalReading) -> dict:
    return dict(seq=x.seq, deviceId=x.device_id, measuredAt=x.measured_at.isoformat() if x.measured_at else None,
                vitals=x.vitals, alerts=x.alerts, position=x.position, simulated=True, signed=True)


def recent(db, referral_id: str, limit: int = 60) -> list[dict]:
    rows = db.scalars(select(VitalReading).where(VitalReading.referral_id == referral_id)
                      .order_by(VitalReading.seq.desc()).limit(limit)).all()
    return [reading_view(x) for x in reversed(rows)]
