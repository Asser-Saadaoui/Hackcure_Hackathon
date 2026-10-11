"""Sahhanito IoT simulator: one SIMULATED vital-signs monitor per ambulance carrying a patient.

    python iot_sim.py                      # BACKEND_URL=http://localhost:8100  IOT_KEY=dev-iot-key-change-me

Every IOT_INTERVAL_S seconds (default 5) it asks the backend which ambulances have a patient on board
(GET /api/v1/iot/assignments, gateway token) and sends one signed telemetry message per monitor
(POST /api/v1/iot/telemetry): heart rate, SpO2, respiratory rate, blood pressure, temperature, GPS.

Signals: a baseline chosen from the case (level and triggered rules: breathing, chest, bleeding, trauma, fever...),
a slow random walk around it, measurement noise, and for serious cases an occasional deterioration episode,
so the hospital dashboard shows realistic trends and alerts. Values are invented: never use them clinically.

Security (see backend/app/iot.py): per-device key = HMAC(IOT_KEY, device id), every message signed with it,
timestamp + strictly increasing sequence number (replay protection).
"""
import hashlib
import hmac
import json
import logging
import os
import random
import time

import httpx

BACKEND = os.environ.get('BACKEND_URL', 'http://localhost:8100').rstrip('/')
IOT_KEY = os.environ.get('IOT_KEY', 'dev-iot-key-change-me')
INTERVAL = float(os.environ.get('IOT_INTERVAL_S', '5'))
log = logging.getLogger('iot-sim')

GATEWAY = hmac.new(IOT_KEY.encode(), b'gateway', hashlib.sha256).hexdigest()

# Baselines (heartRate, spo2, respRate, systolic, diastolic, temperature) by what the case is about.
NORMAL = dict(heartRate=82, spo2=97.5, respRate=16, systolic=124, diastolic=78, temperature=36.9)
PROFILES = {
    'CARD': dict(heartRate=104, spo2=94, respRate=21, systolic=142, diastolic=88),
    'RESP': dict(heartRate=112, spo2=89, respRate=27),
    'BLEED': dict(heartRate=118, systolic=98, diastolic=60, respRate=22),
    'TRAUMA': dict(heartRate=106, systolic=132, respRate=20),
    'NEURO': dict(heartRate=88, systolic=168, diastolic=96),
    'INF': dict(heartRate=110, temperature=39.3, respRate=22),        # infection / fever
}
NOISE = dict(heartRate=2.5, spo2=0.6, respRate=1.0, systolic=3.0, diastolic=2.0, temperature=0.05)


def profile_for(rules, level):
    base = dict(NORMAL)
    for rule in rules or []:
        for key, values in PROFILES.items():
            if key in rule.upper():
                base.update(values)
    if level == 'EMERGENCY':
        base['heartRate'] += 6
    return base


class Monitor:
    def __init__(self, a):
        self.device = a['deviceId']
        self.referral = a['referralId']
        self.key = hmac.new(IOT_KEY.encode(), self.device.encode(), hashlib.sha256).digest()
        self.seq = int(time.time() * 1000)     # survives simulator restarts without looking like a replay
        self.base = profile_for(a.get('rules'), a.get('level'))
        self.state = dict(self.base)
        self.serious = a.get('level') == 'EMERGENCY'
        self.episode = 0                        # remaining ticks of a deterioration episode

    def read(self):
        if self.serious and not self.episode and random.random() < 0.02:
            self.episode = random.randint(6, 18)
        drift = 1.0 if not self.episode else 0.0
        target = dict(self.base)
        if self.episode:
            self.episode -= 1
            target.update(heartRate=target['heartRate'] + 30, spo2=target['spo2'] - 7, systolic=target['systolic'] - 25,
                          respRate=target['respRate'] + 8)
        out = {}
        for k, v in self.state.items():
            v += (target[k] - v) * (0.15 if drift else 0.3) + random.gauss(0, NOISE[k] * 0.4)
            self.state[k] = v
            out[k] = v + random.gauss(0, NOISE[k] * 0.5)
        out['spo2'] = min(100.0, out['spo2'])
        out['diastolic'] = min(out['diastolic'], out['systolic'] - 20)
        return {k: round(v, 1) if k == 'temperature' else round(v) for k, v in out.items()}

    def message(self, position):
        self.seq += 1
        msg = dict(deviceId=self.device, referralId=self.referral, seq=self.seq, ts=int(time.time() * 1000),
                   vitals=self.read(), position=position, firmware='sim-1.0')
        body = json.dumps(msg, sort_keys=True, separators=(',', ':')).encode()
        msg['sig'] = hmac.new(self.key, body, hashlib.sha256).hexdigest()
        return msg


def main():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')
    monitors: dict[str, Monitor] = {}
    headers = {'Authorization': f'Bearer {GATEWAY}'}
    log.info('IoT simulator: %s every %.0f s (SIMULATED monitors)', BACKEND, INTERVAL)
    with httpx.Client(timeout=10, headers=headers) as http:
        while True:
            try:
                active = http.get(f'{BACKEND}/api/v1/iot/assignments').raise_for_status().json()
                ids = {a['deviceId'] for a in active}
                for gone in set(monitors) - ids:
                    log.info('%s: patient delivered, monitor off', gone)
                    del monitors[gone]
                for a in active:
                    if a['deviceId'] not in monitors:
                        monitors[a['deviceId']] = Monitor(a)
                        log.info('%s: monitoring referral %s (%s)', a['deviceId'], a['referralId'], a.get('level'))
                    msg = monitors[a['deviceId']].message(a.get('position'))
                    res = http.post(f'{BACKEND}/api/v1/iot/telemetry', json=msg)
                    if res.status_code != 200:
                        log.warning('%s: rejected %s %s', a['deviceId'], res.status_code, res.text[:120])
                    elif res.json().get('alerts'):
                        log.info('%s: ALERT %s', a['deviceId'], ', '.join(res.json()['alerts']))
            except httpx.HTTPError as e:
                log.warning('backend unreachable: %s', e)
            time.sleep(INTERVAL)


if __name__ == '__main__':
    main()
