"""Settings from environment variables (12-factor). Defaults are for local development only."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _list(name, default):
    return [x.strip() for x in os.environ.get(name, default).split(',') if x.strip()]


DATABASE_URL = os.environ.get('DATABASE_URL', f"sqlite:///{ROOT / 'sahhanito.db'}")
AI_URL = os.environ.get('AI_URL', 'http://localhost:8000').rstrip('/')
SIM_URL = os.environ.get('SIM_URL', 'http://localhost:8200').rstrip('/')
HOSPITALS_FILE = Path(os.environ.get('HOSPITALS_FILE', ROOT.parent / 'data' / 'hospitals.grand-tunis.json'))
PUBLIC_BASE_URL = os.environ.get('PUBLIC_BASE_URL', 'http://localhost:8100').rstrip('/')
CORS_ORIGINS = _list('CORS_ORIGINS', 'http://localhost:8081,http://localhost:5173,http://localhost:8501')

AI_TIMEOUT_S = float(os.environ.get('AI_TIMEOUT_S', '25'))   # > the AI's own LLM budget, so a slow LLM never means 'AI down'
SIM_POLL_S = float(os.environ.get('SIM_POLL_S', '10'))
# A hospital that does not answer in time is skipped and the case goes to the next one.
REFERRAL_TIMEOUT_S = {'EMERGENCY': float(os.environ.get('REFERRAL_TIMEOUT_EMERGENCY_S', '180')),
                      'HIGH': float(os.environ.get('REFERRAL_TIMEOUT_HIGH_S', '600'))}
OVERRIDE_TTL_H = float(os.environ.get('OVERRIDE_TTL_H', '12'))     # staff availability override lifetime
AMBULANCE_TIME_SCALE = float(os.environ.get('AMBULANCE_TIME_SCALE', '1'))  # >1 speeds the simulated ambulance up
STAFF_SESSION_H = float(os.environ.get('STAFF_SESSION_H', '12'))
# Simulated IoT (ambulance monitors, iot-sim/): master key shared with the device simulator. Each device key is
# HMAC(IOT_KEY, device id). Development default only: set IOT_KEY in production.
IOT_KEY = os.environ.get('IOT_KEY', 'dev-iot-key-change-me')
