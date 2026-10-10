"""Hospital directory, live availability (simulator + staff overrides) and automatic matching."""
import json
import math
import threading
import time
from datetime import datetime, timezone

import httpx

from app import config

_lock = threading.Lock()
_sim_cache = {'at': 0.0, 'by_key': {}, 'ok': False}


def _load():
    data = json.loads(config.HOSPITALS_FILE.read_text(encoding='utf-8'))
    facilities = {f['key']: f for f in data['facilities'] if f.get('isActive')}
    return data, facilities


DATASET, FACILITIES = _load()


def specialties(f):
    return {d['specialtyCode'] for d in f.get('departments', [])}


def distance_km(a, b):
    r = math.radians
    dlat, dlng = r(b['lat'] - a['lat']), r(b['lng'] - a['lng'])
    h = math.sin(dlat / 2) ** 2 + math.cos(r(a['lat'])) * math.cos(r(b['lat'])) * math.sin(dlng / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def eta_minutes(km, speed_kmh=30):
    return max(3, round(km / speed_kmh * 60))


# ---- simulator ------------------------------------------------------------------

def refresh_sim():
    """Called by the background worker. Keeps the last good values if the simulator is down."""
    try:
        resp = httpx.get(f'{config.SIM_URL}/hospitals', timeout=5)
        resp.raise_for_status()
        by_key = {h['key']: h for h in resp.json()['hospitals']}
        with _lock:
            _sim_cache.update(at=time.time(), by_key=by_key, ok=True)
    except (httpx.HTTPError, KeyError, ValueError):
        with _lock:
            _sim_cache['ok'] = False


def sim_status():
    with _lock:
        return dict(ok=_sim_cache['ok'], updatedAt=_sim_cache['at'] or None, hospitals=len(_sim_cache['by_key']))


def notify_incoming(key):
    try:
        httpx.post(f'{config.SIM_URL}/hospitals/{key}/incoming', json={'count': 1}, timeout=3)
    except httpx.HTTPError:
        pass


# ---- availability = simulator values, then staff overrides ------------------------

def availability(key, override=None):
    """Merged view used by matching, the dashboard and the patient-facing match reason."""
    with _lock:
        sim = dict(_sim_cache['by_key'].get(key) or {})
    view = dict(
        key=key,
        bedsAvailable=sim.get('bedsAvailable'), bedsTotal=sim.get('bedsTotal'),
        icuAvailable=sim.get('icuAvailable'), icuTotal=sim.get('icuTotal'),
        waitMinutes=sim.get('waitMinutes'), equipmentDown=list(sim.get('equipmentDown') or []),
        doctorsAvailable=sim.get('doctorsAvailable'), doctorsTotal=sim.get('doctorsTotal'),
        nursesAvailable=sim.get('nursesAvailable'), nursesTotal=sim.get('nursesTotal'),
        staffShortage=sim.get('staffShortage'), waitingPatients=sim.get('waitingPatients'),
        accepting=True, source='simulator' if sim else 'unknown', simulated=bool(sim), override=None,
        updatedAt=sim.get('updatedAt'),
        simulator=dict(bedsAvailable=sim.get('bedsAvailable'), icuAvailable=sim.get('icuAvailable'),
                       waitMinutes=sim.get('waitMinutes'), equipmentDown=list(sim.get('equipmentDown') or [])) if sim else None,
    )
    if override is not None and override.expires_at.replace(tzinfo=override.expires_at.tzinfo or timezone.utc) > datetime.now(timezone.utc):
        for field, column in (('bedsAvailable', 'beds_available'), ('icuAvailable', 'icu_available'), ('waitMinutes', 'wait_minutes')):
            if getattr(override, column) is not None:
                view[field] = getattr(override, column)
        if override.equipment_down is not None:
            view['equipmentDown'] = list(override.equipment_down)
        view['accepting'] = override.accepting
        view['source'] = 'staff'
        view['override'] = dict(updatedBy=override.updated_by, updatedAt=override.updated_at.isoformat(),
                                expiresAt=override.expires_at.isoformat(), note=override.note)
    return view


def rank(location, level, specialty, equipment, overrides, exclude=()):
    """Hard exclusions, then EMERGENCY by ETA only, others by ETA + wait + specialty.
    Never returns an empty list while a hospital is open: equipment, then specialty, are relaxed."""
    specialty = specialty or 'EMERG'
    equipment = list(equipment or [])
    rows = []
    for key, f in FACILITIES.items():
        if key in exclude:
            continue
        a = availability(key, overrides.get(key))
        if not a['accepting'] or a['bedsAvailable'] == 0:
            continue
        has_ed = f.get('hasGeneralEd') or any(d.get('hasEmergency') for d in f.get('departments', []))
        if not has_ed:
            continue
        rows.append((f, a))

    def capable(f, a, need_equipment, need_specialty):
        if need_equipment and not all(e in f.get('equipment', []) and e not in a['equipmentDown'] for e in equipment):
            return False
        if need_specialty and specialty not in specialties(f) and not f.get('hasGeneralEd'):
            return False
        return True

    pool = ([r for r in rows if capable(*r, True, True)] or [r for r in rows if capable(*r, False, True)] or rows)
    out = []
    for f, a in pool:
        km = distance_km(location, f)
        eta = eta_minutes(km)
        has_specialty = specialty in specialties(f)
        wait = a['waitMinutes'] if a['waitMinutes'] is not None else 45
        unknown_penalty = 10 if a['bedsAvailable'] is None else 0
        score = eta + unknown_penalty if level == 'EMERGENCY' else eta + wait / 2 + (0 if has_specialty else 10) + unknown_penalty
        beds = a['bedsAvailable']
        label = specialty if has_specialty else 'Urgences'
        reason = f"{label} · {'?' if beds is None else beds} lit(s) libre(s) · {km:.1f} km · ~{eta} min"
        if a['simulated'] and a['source'] == 'simulator':
            reason += ' · disponibilité simulée'
        out.append(dict(key=f['key'], name=f['name'], km=round(km, 1), eta=eta, score=score, reason=reason))
    return sorted(out, key=lambda r: r['score'])
