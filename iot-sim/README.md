# Sahhanito IoT simulator (ambulance monitors)

One **simulated** vital-signs monitor per ambulance that has the patient on board. Every 5 s each monitor sends heart rate, SpO2, respiratory rate, blood pressure, temperature and GPS to the backend, which shows them live to the receiving hospital (case file › *Moniteur ambulance*), with alerts.

```sh
../backend/.venv/bin/python iot_sim.py          # or: pip install -r requirements.txt && python iot_sim.py
# BACKEND_URL (default http://localhost:8100), IOT_KEY (must match the backend), IOT_INTERVAL_S (default 5)
```

- **Signals:** baseline from the case (level, triggered rules: cardiac, respiratory, bleeding, trauma, neuro, fever), slow drift, noise, and occasional deterioration episodes for emergencies. Invented values: never clinical.
- **Security:** per-device key `HMAC(IOT_KEY, deviceId)`, every message HMAC-signed, timestamp (60 s) and strictly increasing sequence number (replay protection), device bound to its ambulance, physiological range checks, gateway token for the assignment list. HTTPS in production.
- **Not used by the triage:** readings are displayed and alerted only; they never reach the AI service.
