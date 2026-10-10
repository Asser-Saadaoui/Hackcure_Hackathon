# Sahhanito

AI emergency triage for Grand Tunis: the patient describes the problem in Darija, Arabic, French or English; Sahhanito decides the urgency, sends the case to the most suitable hospital that can take them, and keeps patient and emergency department in direct contact until arrival.

```
 mobile/ (Expo: Android + web)          dashboard/ (React, central-park UI)
            │  HTTPS + SSE                         │  HTTPS + SSE
            └──────────────┬───────────────────────┘
                     backend/ (FastAPI + Postgres)
        cases · matching · referrals · chat · ambulance · reports
              │                          │
      ai/ (FastAPI)                hospital-sim/ (FastAPI)
  NLP model + rule engine          one OpenHospital Sim engine per hospital
  → fusion → decision;             → beds, ICU, staff, wait, outages
  LLM (Gemini) only talks          (staff overrides win, in the backend)
```

| Folder | What |
|---|---|
| `ai/` | Triage: multilingual extraction + NLP ensemble (`p_nlp`), rule engine (`s_rule`), logistic fusion (`p_final`), decision policy; Gemini phrases the questions only. `POST /turn`. |
| `hospital-sim/` | Simulated availability of the 18 hospitals in `data/hospitals.grand-tunis.json` (OpenHospital Sim, MIT). |
| `backend/` | Patient API, staff API, automatic assignment, referral timeouts and reroute, ED chat, simulated ambulance, report + QR page, live events, staff accounts. |
| `dashboard/` | Hospital dashboard: incoming patients, accept / refuse / ask, chat, availability override, network, clinician review. |
| `mobile/` | Patient app (Android APK + web). |
| `docs/` | Specifications and design notes. |

## Run locally

```sh
# AI (Python 3.12)            → :8000
cd ai && uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/uvicorn service:app --port 8000
# Hospital simulator          → :8200   (SIM_SPEED=30 for a lively demo)
cd hospital-sim && uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt
SIM_SPEED=30 .venv/bin/uvicorn service:app --port 8200
# Backend (SQLite by default) → :8100
cd backend && uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python -m app.cli seed-demo           # one account per hospital + a clinician (asks a password)
.venv/bin/uvicorn app.main:app --port 8100
# Dashboard                   → :5173
cd dashboard && npm install && npm run dev
# Patient app (web)           → :8081
cd mobile && npm install && EXPO_PUBLIC_API_URL=http://localhost:8100 npx expo start --web
```

Demo accounts from `seed-demo`: `urgences.<hospital-key>@sahhanito.tn` (e.g. `urgences.charles-nicolle@sahhanito.tn`) and `clinicien@sahhanito.tn`.

## Deploy (Docker Compose, HTTPS)

On a server with Docker and two DNS names pointing to it:

```sh
cp .env.example .env        # domains, Postgres password, Gemini key
docker compose up -d --build
docker compose exec backend python -m app.cli create-staff --email nurse@hospital.tn --name "Name" --role MANAGER --hospital charles-nicolle
```

Caddy obtains the certificates, serves the patient web app on `APP_DOMAIN` and the dashboard on `STAFF_DOMAIN`, and proxies `/api` to the backend. Postgres, AI, simulator and backend are not published.

## Android APK

```sh
cd mobile
# set EXPO_PUBLIC_API_URL in eas.json to https://<APP_DOMAIN>
npx eas-cli login
npx eas-cli build --platform android --profile apk
```

## Safety notes

- Rules, weights and translations are an unvalidated prototype: clinician and native-speaker review is required before real use.
- Hospital availability is **simulated** unless ED staff enter it; the app and dashboard label simulated values.
- ED phone numbers are not shown (none verified); the app always offers 190 (SAMU).
- The LLM never decides urgency; a critical rule always means EMERGENCY.

Credits: central-park (dashboard UI, MIT, see `dashboard/LICENSE.central-park`), [OpenHospital Sim](https://github.com/theqasimkhan/openhospital-sim) (simulation engine, MIT, see `hospital-sim/ohsim/LICENSE`).
