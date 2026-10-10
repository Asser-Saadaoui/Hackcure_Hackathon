# Sahhanito — patient app

Expo (SDK 57) + expo-router patient app for Sahhanito, AI emergency triage across Grand Tunis hospitals.
Languages: French, Arabic, Tunisian Darija (Arabic script and Arabizi), English, with RTL. Companion: Hassanito.

## Run

The app always talks to the Sahhanito backend (see the repository README to start it).

```bash
npm install
npm run web                                           # http://localhost:8081, backend on http://localhost:8100
EXPO_PUBLIC_API_URL=http://192.168.1.33:8100 npm run web   # another backend address
```

Add `?lang=fr|ar|darija|en` to the URL to force a language.

## Flows

- Welcome (language, consent) → triage chat (questions until enough information)
- Emergency → automatic hospital assignment → Care → follow the (simulated) ambulance → report (QR, PDF) → direct ED chat
- Urgent → result → confirm location → Care
- Uncertain → intake questions → clinician review

ED phone numbers are never invented: the app always offers **190** (SAMU).

## Android APK

See the repository README (`EXPO_PUBLIC_API_URL` must point to an address the phone can reach).
