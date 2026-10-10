# Sahhanito · hospital dashboard

React + Vite + Tailwind + shadcn UI, adapted from **central-park** ("Triage Park", MIT, see `LICENSE.central-park`): design tokens, `src/components/ui/*` and the worklist/case-detail layout. Data now comes from the Sahhanito backend instead of IRIS/FHIR.

```sh
npm install
npm run dev          # http://localhost:5173, proxies /api to the backend on :8100
npm run build        # static files in dist/ (served by Caddy in production)
```

Screens:
- **Patients** (ED staff / manager): patients routed to this hospital, live (SSE), urgent first. Case view: red flags with the patient's own words, NLP / rules / fused scores, report, triage transcript, direct chat (questions with answer choices, instructions), actions: accept with simulated ambulance or self-arrival, cannot receive (automatic reroute), escalate, arrived.
- **Disponibilité**: simulated availability (OpenHospital Sim) with a staff override (beds, ICU, wait, equipment down, stop receiving) that wins until it expires.
- **Réseau**: the 18 Grand Tunis hospitals.
- **À vérifier** (clinician): UNCERTAIN cases; the decision is sent to the patient immediately.

Accounts are created with the backend CLI (`python -m app.cli create-staff …`).
