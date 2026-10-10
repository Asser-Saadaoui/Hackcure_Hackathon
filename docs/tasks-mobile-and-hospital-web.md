# Technical Task List — Patient Mobile App & Hospital Web App

As of 2026-10-09. The full reference is `docs/hackcure-app.md`; section numbers below (§) point to it.

**Suggested split:**
- **Track A, patient mobile app** (`mobile/`, Expo)
- **Track B, hospital web app** (`hospital-dashboard/`, React + Vite)

Both tracks depend on **§0** (shared contracts) and consume the backend API (`backend/`). Until an endpoint exists, use the mock described in §0.3.

---

## 0. Shared prerequisites (do first, together)

### 0.1 Contracts and types (`packages/shared`)
- [ ] npm workspaces at the root: `packages/*`, `backend`, `hospital-dashboard`, `patient-dashboard`, `mobile`
- [ ] `case-state.ts`: `CaseState` (symptoms with `present` + `evidence`, history, medications, vitals with `source`, uncertainties, metadata)
- [ ] `assessment.ts`: `RiskLevel = 'EMERGENCY' | 'HIGH' | 'LOW' | 'UNCERTAIN'`, `Uncertainty`, `RiskAssessment` (pNlp, sRule, triggeredRules, pFinal, contributions), `Decision` (level, actions, suggestedSpecialty, rationale)
- [ ] `status.ts`: case and referral status enums + allowed transitions (§13)
- [ ] `events.ts`: SSE event names and payload types (§7.4)
- [ ] `api.ts`: request/response DTO types for the endpoints each app uses (§7.3)
- [ ] Mobile: `metro.config.js` `watchFolders` → repo root so Expo resolves `@sahhanito/shared`

### 0.2 Conventions
- [ ] Base URL from env (`EXPO_PUBLIC_API_URL`, `VITE_API_URL`); on a phone, use the laptop's LAN IP, not `localhost`
- [ ] Error format `{ code, message, details? }`; `409` means "already handled / state changed", so refetch and show a toast
- [ ] Dates in ISO UTC; display in the `Africa/Tunis` timezone
- [ ] i18n keys shared in spirit: `ar` (RTL), `fr`, `en` (+ Darija strings where useful)
- [ ] Risk colors are always **color + text label** (accessibility)

### 0.3 Mocks so both tracks can start before the backend is ready
- [ ] `ai-stub/` running (canned `/turn` and `/report`, §21.3)
- [ ] Optional: MSW (web) / a JSON mock server for the endpoints listed in each track
- [ ] Seed data: hospitals, staff accounts per role, demo cases (§15)

---

## Track A — Patient mobile app (`mobile/`, Expo)

**Stack:** Expo (TypeScript) with a **development build** (push doesn't work in Expo Go on Android), React Navigation (native stack) or Expo Router, `expo-secure-store`, `expo-notifications`, `expo-location`, `react-native-maps` (or MapLibre), `react-native-qrcode-svg`, `expo-file-system` + `expo-sharing`, `@react-native-async-storage/async-storage`, `@react-native-community/netinfo`, `expo-crypto`, `expo-background-fetch` + `expo-task-manager`, `expo-localization`.

### A1. Project setup
- [ ] Expo app in `mobile/`, TypeScript, ESLint/Prettier
- [ ] `eas.json` with a `development` profile; Android `google-services.json` (FCM), iOS push capability
- [ ] `src/lib/api.ts`: fetch wrapper (base URL, Bearer token, JSON, timeout 15 s, `Idempotency-Key` support)
- [ ] `src/i18n/`: `ar` / `fr` / `en`, RTL switch via `I18nManager` (requires a reload) or per-text `writingDirection`
- [ ] Theme + `RiskBadge` component (EMERGENCY / HIGH / LOW / UNCERTAIN, color + label)

### A2. First open: anonymous start (P1)
- [ ] Generate `deviceId` (`Crypto.randomUUID()`), store in SecureStore
- [ ] `POST /auth/anonymous { deviceId }` → JWT (30 days) in SecureStore; silent renewal on 401
- [ ] Language from `expo-localization`, switcher on the welcome screen
- [ ] One-tap consent screen (store `consentVersion` via `PATCH /me`)
- [ ] **No login screen anywhere in the triage path**

### A3. Notification permission + push registration (P1b, §26–27)
- [ ] Explanation screen → `Notifications.requestPermissionsAsync()` **on first open**
- [ ] If granted: `getExpoPushTokenAsync()` → `POST /push/subscriptions { kind: 'EXPO', expoToken, deviceLabel }`; re-register on every app start + `addPushTokenListener`
- [ ] Android channels: `critical` (importance MAX, sound) and `default`
- [ ] If refused: continue; show a "Notifications off — turn on" banner (`Linking.openSettings()`)
- [ ] Notification tap handling, including from a killed app (`getLastNotificationResponseAsync()`) → navigate to `data.url`; call `POST /notifications/:id/opened`
- [ ] One-time battery-optimization tip (Xiaomi/Oppo/Huawei)

### A4. Triage chat (P2–P5)
- [ ] Chat screen: `ChatBubble`, `ChatInput`, typing indicator, auto-scroll, RTL bubbles for Arabic
- [ ] `POST /cases` (first message) then `POST /cases/:id/messages` with `Idempotency-Key`
- [ ] Switch on the response `kind`:
  - `question` → assistant bubble + quick replies
  - `emergency` → **replace** the stack with Emergency
  - `under_review` → "A clinician is reviewing your case" state
  - `result` → Status
  - `degraded` → safe message + call 190 button
- [ ] Retry on network error without losing the typed text

### A5. Emergency screen (P4)
- [ ] Full-screen, high contrast; `Linking.openURL('tel:190')`; first-aid text from the bundle (works **offline**)
- [ ] Shows the hospital the case was sent to + ED phone + directions when available (`GET /cases/:id`)
- [ ] "Wrong place? Change location" → Location screen → re-match
- [ ] Reachable from anywhere when the level becomes EMERGENCY (push or live event)

### A6. Location: permission + confirm/adjust (P6a)
- [ ] Ask **just before the hospital search**: `requestForegroundPermissionsAsync()`
- [ ] `getCurrentPositionAsync({ accuracy: High })` with a 10 s timeout → fallback `getLastKnownPositionAsync()`
- [ ] `reverseGeocodeAsync()` → readable address
- [ ] Map with draggable pin + accuracy circle + address; buttons **Confirm** / **Adjust**
- [ ] Adjust: drag pin · address search (geocoder or Nominatim) · neighborhood/delegation list (static JSON for Grand Tunis)
- [ ] Accuracy > 200 m → open Adjust by default with a warning
- [ ] Permission refused / no fix → manual Adjust (never a dead end)
- [ ] `PUT /cases/:id/location { lat, lng, accuracyM, source, address }`
- [ ] EMERGENCY: don't wait for confirmation; send the first fix, allow change afterwards

### A7. Assigned hospital + referral (P6–P7, P10–P11)
- [ ] **No hospital choice:** after `PUT /cases/:id/location`, wait for the automatic assignment (`referral.status` event / `GET /cases/:id`): show the hospital, the reason ("Cardiology · 2 beds free · 4.2 km"), ETA, "From: <address> · correct"
- [ ] Assigning state ("Finding the right hospital for you…") and re-assignment notice when the hospital refuses
- [ ] `StatusTimeline`: Sent → Accepted (+ note) / Question / Rerouted → Arrived
- [ ] Directions: `https://maps.google.com/?daddr=lat,lng` (no API key needed); "Call ED"
- [ ] **Chat with the ED** (one thread per hospital): list + send (`GET/POST /chat/:referralId/messages`, `Idempotency-Key`), push for new messages, "The ED may take a few minutes — call 190 if it gets worse" notice
- [ ] "I feel worse" → posts a `WORSE` message in the chat (`POST /chat/:referralId/messages { kind: 'WORSE' }`)
- [ ] Escalation by the ED (`case.escalated` / critical push) → show the instruction; EMERGENCY → Emergency screen
- [ ] **Arrival mode** shown after acceptance: *go on your own* (directions) or *an ambulance is coming (simulated)*: map with the ambulance marker, status and ETA (`ambulance.status`, `tracking.position`), "stay where you are"
- [ ] **Live location sharing** (mode SELF, and until pickup for the ambulance): prompt "Share your live location with <hospital> until you arrive?" → `Location.watchPositionAsync({ timeInterval: 15000, distanceInterval: 50 })`; optional background with `requestBackgroundPermissionsAsync()` + `Location.startLocationUpdatesAsync` (Android foreground-service notification); batched `POST /tracking/:referralId/positions` through the outbox; "Sharing · Stop" bar → `POST /tracking/:referralId/stop`; stops automatically on arrival/cancel
- [ ] "Have you arrived?" prompt when the backend detects the geofence
- [ ] "Correct my location" (before acceptance) → `PUT /cases/:id/location` → automatic re-assignment
- [ ] "I arrived" / "I'm not going" → `POST /cases/:id/close`
- [ ] Refresh: on focus, pull-to-refresh, when a push arrives, and polling `GET /cases/:id/sync` every 5 s while on Status (or `react-native-sse`)

### A8. Hospital questions (P16) and reroutes (P17)
- [ ] InfoRequests screen opened from the push: question in the patient's language; yes/no, choice buttons or text field
- [ ] `POST /info-requests/:id/answer` through the outbox (idempotent)
- [ ] Reroute: full-screen notice "Go to <hospital> instead" + new directions + new QR

### A9. Report, QR, reference code (P8, P14)
- [ ] Reference code `HC-…` large and copyable
- [ ] QR of the report link (`react-native-qrcode-svg`)
- [ ] PDF: download to `FileSystem.documentDirectory`, open with `expo-sharing`
- [ ] "Open my case on another device": show the `/p/` link + its QR

### A10. Offline & resilience (P15, §27)
- [ ] Cache the referral JSON (AsyncStorage) + PDF; show the cache first at startup, then refresh
- [ ] Outbox: every action stored with `clientRequestId`, flushed on connect (NetInfo), app start, and background fetch
- [ ] Local check-in reminders: +15 / +30 / +60 min and ETA + 15 min, with action buttons; cancel on close/arrival/change
- [ ] Android sticky notification while REFERRED
- [ ] Call buttons always work offline

### A11. History + optional account (P12, P1c)
- [ ] History list (`GET /cases`): date, level, hospital, status → open the report; hide (`DELETE /cases/:id`)
- [ ] Settings: language, notifications status, my devices, "Link my phone number" (`POST /auth/patient/link-phone`)

### A12. Mobile acceptance checks
- [ ] Usable chat in < 5 s from first open, with no login
- [ ] Refusing notifications and location still allows the full flow
- [ ] EMERGENCY at any turn → Emergency screen immediately, even offline
- [ ] App killed → hospital question arrives as a push; the tap opens the right screen
- [ ] Airplane mode → Status, QR, PDF and call buttons work; "I feel worse" is sent exactly once after reconnecting
- [ ] Arabic layout correct (RTL)

---

## Track B — Hospital web app (`hospital-dashboard/`, React + Vite)

**Stack:** React + Vite (TypeScript), React Router, a data-fetching lib (TanStack Query recommended), a UI kit (e.g. Mantine or shadcn/ui), Recharts (risk over time, metrics, contributions), Leaflet + OpenStreetMap (optional maps), the native `EventSource` (SSE), a service worker for Web Push, `react-i18next` (FR first, AR/EN).

### B1. Project setup
- [ ] Vite app, TypeScript, ESLint/Prettier, `@sahhanito/shared` types
- [ ] `lib/api.ts`: fetch with `credentials: 'include'` (cookie session), error → toast, 409 → "Already handled" + refetch
- [ ] `lib/auth.ts`: current user, memberships `[{ facilityId, facilityRole, supervisesNetwork }]`, selected hospital (persisted in `localStorage`)
- [ ] `App.tsx`: routes + **layout by role** (ED / clinician / manager), route guards (the UI hides things; the backend enforces them)
- [ ] Shared components: `RiskBadge`, `UncertaintyBar`, `RedFlagList`, `ContributionChart`, `TranscriptView`, `StateEditor`, `ReportViewer`, `Countdown`

### B2. Auth + devices (H9b)
- [ ] `Login.tsx`: `POST /auth/staff/login { email, password }`; forced change-password screen if `mustChangePassword`
- [ ] Hospital switcher (memberships), logout
- [ ] **Web Push:** `public/sw.js` (push → `showNotification`, `notificationclick` → open URL + `POST /notifications/:id/opened`), `lib/push.ts` (`enablePush()` from a button click: register SW → permission → `pushManager.subscribe` with the VAPID key → `POST /push/subscriptions`)
- [ ] "Enable notifications on this device" banner + "My devices" list (`GET/DELETE /push/subscriptions`)
- [ ] `manifest.webmanifest` so the dashboard is installable (PWA)

### B3. Live updates (§28.4)
- [ ] `lib/sse.ts`: `useLive(facilityId, onEvent, reload)` with `new EventSource('/dashboard/stream?facilityId=…', { withCredentials: true })`
- [ ] **Reload on every `onopen`** (first connect + reconnects); remove listeners on unmount
- [ ] Events: `referral.new`, `referral.status`, `referral.updated`, `info.answered`, `referral.arrived`, `availability.updated`, `availability.stale`, `supervision.queued`, `case.turn`, `case.state_corrected`, `case.reviewed`
- [ ] "Live / reconnecting" indicator; "Enable sound" button (audio needs a user click first); `alert.mp3`

### B4. Board: ED decisions (H1–H8)
- [ ] `GET /dashboard/referrals?facilityId=&status=&ref=` → columns *New · Waiting for patient · Accepted · Arrived* + collapsed *Refused/rerouted/cancelled*
- [ ] Card: level (color + text), reference code, headline, age/sex, ETA countdown (`etaAt`), decision countdown (`decisionDueAt`), origin ("Rerouted from …")
- [ ] Sort: EMERGENCY first, then ETA; new card → sound + browser notification + tab title count
- [ ] Search by reference code
- [ ] Case drawer (`GET /dashboard/referrals/:id`): summary, symptoms/negatives, red flags, risk + explanation, clinician review badge, timeline, Q&A, transcript (collapsed), PDF / print
- [ ] **Accept** dialog (optional note) → `POST …/accept`
- [ ] **Request more info** dialog (templates FR/AR, free text; type yes/no / choice / text; several questions) → `POST …/request-info`; card shows "Waiting for patient" + timer; the answer appears live
- [ ] **Cannot receive** dialog (reason required; optional "unavailable for <specialty> for 1 h / 2 h / until …") → `POST …/reject`
- [ ] **Reroute** dialog: `GET …/reroute-options` (ranked capable hospitals with ETA + reason) or "best available"; reason required → `POST …/reroute`
- [ ] Handle 409 ("already handled by X") everywhere

### B5. Handoffs + Arrival + outcome (H10, H13–H15, §29)
- [ ] `Handoffs.tsx`: `GET /dashboard/handoffs?facilityId=` (accepted, on the way): ETA countdown, latest report version, highlight when the level rises
- [ ] `Arrival.tsx`: "Arrived" → `POST /referrals/:id/arrived`; treatment status selector → `PUT /referrals/:id/treatment-status`
- [ ] Outcome form (final level, disposition, diagnosis category list, text, notes) → `POST /referrals/:id/outcome`; under 30 s to fill
- [ ] "Missing outcomes" list (arrived > 48 h without an outcome)

### B6. Availability (H11–H12, §28.6)
- [ ] `GET /hospital/:fid/availability` → grid per department: status buttons, steppers for beds / specialists / estimated wait
- [ ] Each change → `PATCH /departments/:id/availability` (optimistic UI, rollback on error)
- [ ] Equipment toggles → `PATCH /hospital/:fid/equipment/:code`
- [ ] Temporary blocks list + "End now" (`DELETE /dashboard/unavailability/:id`)
- [ ] "Nothing changed ✓" → `POST /hospital/:fid/availability/confirm`; stale banner on `availability.stale`

### B7. Clinician supervision: CaseWorkspace (C1–C6, §22)
- [ ] Supervision queue (`GET /supervision/queue`): priority, reason in queue, level, `pFinal`, waiting time, "auto-escalated" tag
- [ ] Workspace (`GET /supervision/cases/:id`) with live `case.turn` updates:
  - `TranscriptView` (timestamps, language/script tags, normalized text on hover)
  - `StateEditor` (symptoms present/absent, history, medications, vitals with source, pregnancy) → `PUT /supervision/cases/:id/state` (shows the re-run result)
  - **Risk over time** chart (`pFinal` per assessment, level bands, markers for corrections/overrides)
  - `RiskBadge`, `UncertaintyBar`, `RedFlagList`, `ContributionChart` (bias / NLP / rules)
  - `ReportViewer` with edit → `PUT /supervision/cases/:id/report`
- [ ] Action panel: **Approve** (`POST …/approve { assessmentId }`), **Override** (level + reason required; down from EMERGENCY needs a second confirmation + ≥ 20 chars), notes, message the patient
- [ ] Disable the actions until the shown `assessmentId` is loaded; 409 "risk changed, re-check" → refresh

### B8. Manager Admin (M1–M6, §28.7)
- [ ] My hospital: profile, decision timeouts, alert delay, staleness threshold (`GET/PATCH /hospital/:fid`)
- [ ] Departments & equipment CRUD
- [ ] On-call schedule: calendar per specialty, overlap validation (`/hospital/:fid/on-call`)
- [ ] Staff: list, create (email + temporary password), role (ED staff / clinician / manager), deactivate, reset (`/hospital/:fid/staff`)
- [ ] Alerts & integrations: backup-alert recipients, optional FHIR webhook + "send test"
- [ ] Statistics (`GET /hospital/:fid/stats`) and audit (`GET /hospital/:fid/audit`)

### B9. Metrics (§31)
- [ ] `GET /learning/metrics?from&to&facilityId` → emergency recall, under-triage rate, precision/F1 per level, override rate (up/down), calibration curve + Brier score, split by language/script and model version
- [ ] Charts with Recharts; period and hospital filters; version comparison

### B10. Hospital web acceptance checks
- [ ] A new case appears on the right hospital's Board within 2 s, never on another hospital's
- [ ] Two staff accept at once → one wins, the other sees "Already handled"
- [ ] Network off 30 s → reconnect → the board reloads with what arrived meanwhile
- [ ] Browser tab closed → a backup alert still arrives as a push on the computer and the staff member's phone
- [ ] ED staff can't open manager pages (and the API returns 403)
- [ ] Clinician correction → new assessment shown; approve on an old assessment → 409
- [ ] Works on a 1366×768 PC and a 10" tablet; FR first, AR labels correct

---

## Backend endpoints each track depends on (for coordination)

| Track | Endpoints |
|---|---|
| A (mobile) | `/auth/anonymous`, `/auth/patient/link-phone`, `/me`, `/push/*`, `/cases`, `/cases/:id/messages`, `/cases/:id/location`, `/chat/:referralId/messages`, `/cases/:id/close`, `/cases/:id/sync`, `/cases/:id/report(.pdf)`, `/info-requests/:id/answer`, `/notifications/:id/opened` |
| B (hospital web) | `/auth/staff/login`, `/auth/logout`, `/push/*`, `/dashboard/*`, `/dashboard/stream`, `/referrals/:id/*`, `/hospital/:fid/*`, `/departments/:id/availability`, `/supervision/*`, `/learning/metrics`, `/notifications/:id/opened` |

**Agree on these first:** the DTOs in `packages/shared/src/api.ts`, the SSE event payloads in `events.ts`, and the error format. Then both tracks can build against mocks in parallel.
