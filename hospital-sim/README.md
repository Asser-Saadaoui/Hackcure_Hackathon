# Sahhanito hospital simulator

One [OpenHospital Sim](https://github.com/theqasimkhan/openhospital-sim) SimPy engine (vendored in `ohsim/`, MIT, see `ohsim/LICENSE`) per active hospital of `data/hospitals.grand-tunis.json`.

```sh
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/uvicorn service:app --port 8200
curl -s localhost:8200/hospitals
```

- Capacity profile per hospital type (CHU, military, regional, specialized institute); 12 simulated hours of warm-up so hospitals start non-empty.
- `bedsAvailable` = ED beds minus every ED patient (waiting + in treatment) minus beds held for Sahhanito patients (`POST /hospitals/{key}/incoming`, 4 simulated hours).
- `icuAvailable` from the ICU resource; `ICU` is listed in `equipmentDown` when it is full.
- Random CT / MRI / cath lab / dialysis outages (90–360 simulated minutes).
- `waitMinutes` from the queue per doctor on shift, with a staff-shortage penalty, capped at 4 h.
- Clock: `SIM_SPEED` simulated minutes per real minute (default 6), advanced every `SIM_TICK_SECONDS` (default 15).

Every value is **simulated** (`simulated: true`). ED staff overrides from the dashboard are applied by the backend and win over these values.

## Simulator dashboard (OpenHospital Sim)

`dashboard/` is the original OpenHospital Sim Next.js dashboard (MIT, see `dashboard/LICENSE`), connected to these engines by `compat.py` (`/api/v1/*`):

```sh
cd dashboard && npm install
npm run dev -- -p 3100          # http://localhost:3100 (proxies /api/v1 to SIM_URL, default http://localhost:8200)
```

- **Hospital selector** (top bar): every page shows one Grand Tunis hospital (`?hospital=<key>`): Dashboard, Simulation, Agents, Forecasting, Optimization, Replay. The 7 agents, the forecasts and the optimizers are the original ones (vendored in `ohsim/agents`, `ohsim/forecasting`, `ohsim/optimization`), one agent registry per hospital.
- **Simulation › Apply configuration**: rebuilds the selected hospital's engine with your beds, ICU, doctors, nurses, arrival interval and seed. **Step** advances the whole network (one clock), **Reset** returns the hospital to its default profile.
- **Simulation › Grand Tunis scenario**: network clock (pause, speed), random outages, presets, and custom events (surge, staff shortage, equipment outage, closure, beds occupied) for the selected hospital or the whole network.

Every change hits the engines the Sahhanito backend reads, so referrals, the staff dashboard and the patient app react. Beds and doctors shown are the values Sahhanito uses (ED trolleys, held beds, scenario shortage). The service has no authentication: keep port 8200 and the dashboard on a private network.
