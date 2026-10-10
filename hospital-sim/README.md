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
