# Sahhanito — patient app

Expo (SDK 57) + expo-router patient app for Sahhanito, AI emergency triage across Grand Tunis hospitals.
UI languages: French, Arabic, Tunisian Darija and English, with RTL. The clinical extractor supports English, Arabic-script Darija and Arabizi.

The default now connects to the local AI bridge. Start `python serve.py` in `../ai/` first. Read [SAHHANITO.md](SAHHANITO.md) for the actual integration, Hassanito states, tests and limitations. The hospital flows below describe the original **mock mode**, enabled with `EXPO_PUBLIC_API_MODE=mock`; they are not connected services.

## Run (web)

```bash
npm install
npm run web        # http://localhost:8081
```

Add `?lang=fr|ar|darija|en` to the URL to force a language.

## Mock backend

Screens talk to `src/lib/api.ts` (`PatientApi`). It selects `src/lib/ai-api.ts` by default, or the original `src/mock/` implementation when explicitly configured. Mock cases persist to AsyncStorage; local AI cases are memory-only.

Settings → **Test mode**:
- **demo**: the assistant answers every message with a demo reply.
- **triage**: keywords decide the level (red flags such as "douleur thoracique" always open the Emergency screen).

## Flows

- Welcome (consent, language, notifications) → triage chat
- Emergency → automatic hospital assignment (location, capacity, specialty, equipment) → Care → live tracking → report (QR) → direct ED chat
- Urgent → Result → confirm location → Care
- Uncertain → clinician review

Hospitals: `src/mock/data/hospitals.grand-tunis.json` (18 Grand Tunis hospitals). ED phone numbers are `null` on purpose: the app never shows invented numbers and falls back to **190** (SAMU).
