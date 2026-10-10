# Sahhanito — patient app

Expo (SDK 57) + expo-router patient app for Sahhanito, AI emergency triage across Grand Tunis hospitals.
Languages: French, Arabic, Tunisian Darija (Arabic script and Arabizi), English, with RTL.

## Run (web)

```bash
npm install
npm run web        # http://localhost:8081
```

Add `?lang=fr|ar|darija|en` to the URL to force a language.

## Mock backend

Screens only talk to `src/lib/api.ts` (`PatientApi`). The mock implementation is in `src/mock/` and persists to AsyncStorage, so a reload keeps the case. Switching to the real API is a one-file change.

Settings → **Test mode**:
- **demo**: the assistant answers every message with a demo reply.
- **triage**: keywords decide the level (red flags such as "douleur thoracique" always open the Emergency screen).

## Flows

- Welcome (consent, language, notifications) → triage chat
- Emergency → automatic hospital assignment (location, capacity, specialty, equipment) → Care → live tracking → report (QR) → direct ED chat
- Urgent → Result → confirm location → Care
- Uncertain → clinician review

Hospitals: `src/mock/data/hospitals.grand-tunis.json` (18 Grand Tunis hospitals). ED phone numbers are `null` on purpose: the app never shows invented numbers and falls back to **190** (SAMU).
