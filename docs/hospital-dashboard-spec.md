# Hospital Dashboard — Specification Book & Task Split

**Project:** HELIOS (HackCure) · **App:** `hospital-dashboard/` (React + Vite) · **As of:** 2026-10-09
**Audience:** me and my teammate. We split the hospital dashboard **by feature, full stack** (§2).
**Reference:** `docs/hackcure-app.md` (§ numbers below point to it).

---

## Table of contents

1. Purpose and scope
2. Who does what (task split)
3. Working agreement (contracts, git, reviews, Definition of Done)
4. Users, roles and permissions
5. Tech stack and project structure
6. Cross-cutting features (auth, layout, live updates, push, i18n, errors, design)
7. Page specifications
   - 7.1 Login & password change
   - 7.2 Board (ED decisions)
   - 7.3 Case drawer (ED view)
   - 7.4 Handoffs
   - 7.5 Arrival, treatment & outcome
   - 7.6 Availability
   - 7.7 Supervision queue + CaseWorkspace (clinicians)
   - 7.8 Admin (managers)
   - 7.9 Metrics
   - 7.10 Settings: my devices & notifications
8. Shared components
9. API contract for the dashboard (types + endpoints)
10. Live events (SSE) contract
11. Mocks (no page waits for an endpoint)
12. Milestones and schedule with owners
13. Test plan and demo checklist
14. Open questions

---

## 1. Purpose and scope

The hospital dashboard is the **web app used inside each Grand Tunis hospital** by:
- **ED staff:** receive incoming patients and decide (Accept / Request more info / Cannot receive / Reroute), follow patients on their way, confirm arrival, record treatment status and outcome, and update availability by hand
- **Clinicians:** supervise the AI continuously: correct the patient's structured state, approve or override the risk level, edit the draft report
- **Managers:** run their own hospital: profile, departments, equipment, on-call schedule, staff accounts, alerts, statistics

**In scope:** every page of `hospital-dashboard/`, its live updates (SSE), its push notifications (Web Push), and the backend endpoints it calls.

**Out of scope:**
- the patient apps (`mobile/`, `patient-dashboard/`) and the AI service (`ai/`)
- doctor assignment, beds and the medical record, which stay in the hospital's own systems

---

## 2. Who does what (task split)

**Principle: we split by feature, not by layer.** Each of us owns some features **end to end**: backend module, endpoints, frontend pages and tests. We share the foundation (contract, shell, auth, live updates), built together on day 1. Both of us write backend **and** frontend code.

**Why this split:** the Board decisions and the clinician supervision are tightly linked to the triage loop, the AI client and matching, which I already build for the patient side. So I take those. The hospital-operations features (availability, arrival and outcome, manager admin, metrics, staff push notifications) are self-contained, so she takes them end to end.

### 2.1 Ownership table

| Feature (full stack) | Backend module(s) | Frontend page(s) | Owner |
|---|---|---|---|
| **Foundation: contract** | `packages/shared` (`api.ts`, `events.ts`, `status.ts`) | — | both (I draft, she reviews) |
| **Foundation: schema & seed** | `prisma/schema.prisma`, `seed.ts` | — | me (she adds her seed data by PR) |
| **Foundation: staff auth** | `auth/` (staff login, cookie, memberships, guards, `AccessService`) | `Login`, change password, `lib/auth.ts` | me (backend) + her (frontend) |
| **Foundation: app shell** | — | Vite setup, routing, role layout, hospital switcher, design system, `lib/api.ts`, i18n | her |
| **Foundation: live updates** | `live/` (`/dashboard/stream`, LiveService) | `lib/sse.ts` (`useLive`), live indicator, sound | me (backend) + her (frontend) |
| **Board & ED decisions** | `dashboard/` (board, accept, request-info, reject, reroute, reroute options, 409), `info-requests/` | `Board`, case drawer, 4 decision dialogs | **me** |
| **Clinician supervision** | `supervision/` (queue, state correction + AI re-run, approve, override, notes, report edit, uncertain timeout) | supervision queue, `CaseWorkspace` | **me** |
| **Risk components** | — | `RiskBadge`, `UncertaintyBar`, `RedFlagList`, `ContributionChart`, `RiskTimeline`, `TranscriptView`, `StateEditor`, `ReportViewer` | **me** (she reuses them) |
| **Live tracking map + simulated ambulance** | `tracking/` module (positions, ETA, geofence, simulator job, purge) | map panel in Handoffs + overview map + ambulance chip | **her** |
| **Data export** | `exports/` module (per case FHIR/PDF/CSV, bulk jobs, audit) | Export menu + Admin → Exports | **her** |
| **Patient live location + ambulance view** | — | location sharing + ambulance screen in the patient apps | **me** |
| **Handoffs + patient ↔ ED chat + raise urgency** | `chat/` module (messages, read receipts, live events), `GET /dashboard/handoffs`, `POST …/raise-urgency` (calls my `CasesService.raiseLevel()`) | `Handoffs` page (list + chat panel + Raise urgency dialog) | **her** |
| **Patient side of the chat** | (same `chat/` endpoints) + AI rule check on patient chat messages | chat screen in `mobile/` and `patient-dashboard/` | **me** |
| **Arrival, treatment, outcome** | `referrals/` arrival + treatment + outcome endpoints, missing outcomes, `feedback/` API | `Arrival` | **her** |
| **Availability** | `availability/` (get, patch department, equipment, confirm, blocks, staleness job) | `Availability` | **her** |
| **Manager admin** | `hospital-admin/` (profile, departments, equipment, on-call, staff accounts, alerts, webhook channels, stats, audit) | `Admin` (all tabs) | **her** |
| **Metrics** | `learning/` metrics endpoint (reading the learning events I write) | `Metrics` | **her** |
| **Staff push notifications** | `notify/` Web Push part (VAPID, `/push/*`, sending, backup alerts, escalation to staff) | `public/sw.js`, `lib/push.ts`, PWA manifest, Settings → My devices | **her** (I reuse `NotifyService` for patients) |
| **Integration & demo** | — | — | both |

**Balance:** her features are about the same size as mine *on the dashboard*. I also own the patient side (triage loop, AI client, matching, reports, `mobile/`, `patient-dashboard/`), which is why the self-contained dashboard features go to her.

### 2.2 Her tasks (hospital operations, full stack)

She owns these features **end to end**: backend module, endpoints, live events, pages, tests. Build them in this order. Each task is "done" when its **Done when** list passes against the real API (and the Definition of Done in §3.4).

#### Overview

| # | Task | Size | Depends on |
|---|---|---|---|
| H0 | App shell & design system | M | contract v1 |
| H1 | Login screens + live-update hook | S | my M2 (auth), M3 (SSE) |
| H2 | Mocks for her pages | S | contract v1 |
| H3 | Handoffs list | S + S | my M4 (referrals) |
| H4 | Patient ↔ ED chat | M + L | H3, my M6b (patient chat screen) |
| H5 | Raise urgency | S + M | H4, my `CasesService.raiseLevel()` |
| H6 | Availability | M + M | H0 |
| H7 | Arrival, treatment status, outcome | M + M | H3 |
| H8 | Staff push notifications | M + M | H0 |
| H9 | Manager admin | L + L | H0 |
| H10 | Metrics | M + M | learning events (my M6) |
| H11 | Hospital feedback API | S | H7 |
| H12 | i18n, RTL and responsive pass | M | all pages |
| H13 | Tests | M | each feature |
| H14 | Live tracking map (+ `tracking/` backend) | M + L | H3, my M6c (patient location sharing) |
| H15 | Simulated ambulance | M + M | H14, my Accept with arrival mode (M4) |
| H16 | Data export (FHIR / PDF / CSV, bulk) | M + M | H7 |

Sizes per side (backend + frontend): S ≈ half a day · M ≈ 1 day · L ≈ 2 days.

---

#### H0 — App shell & design system (frontend)
**Goal:** the skeleton every page (hers and mine) plugs into.
- Vite + React + TypeScript (strict), React Router, TanStack Query, the chosen UI kit, react-i18next (FR default, AR RTL, EN)
- `lib/api.ts`: `credentials: 'include'`, 15 s timeout, error → toast, **409 → "Already handled" + refetch**
- `App.tsx`: routes (§5) + **role-based sidebar** (§4) + hospital switcher (memberships from `GET /me`, choice saved in `localStorage`) + logout
- Shared UI states: `Skeletons`, `EmptyState`, `ErrorState` (Retry), `ConfirmDialog`, toasts, a `Countdown` component
- Theme: risk colors **with text labels**, ≥ 40 px buttons, logical CSS for RTL

**Done when:** each role sees only its menu; switching hospitals reloads the page data; a 409 from any call shows the toast and refetches.

#### H1 — Login screens + live-update hook (frontend)
- `Login` (email, password, errors: wrong credentials / disabled account / 429), `/change-password` when `mustChangePassword`
- `lib/auth.ts`: `GET /me`, redirect to `/login?next=` on 401, "no access" page on 403
- `lib/sse.ts`: `useLive(facilityId, onEvent, reload)`: `EventSource` with `withCredentials`, **reload on every `onopen`**, listeners removed on unmount (§6.3)
- Header: **● Live / ◌ Reconnecting** indicator, "Enable sound" button, `alert.mp3`

**Done when:** a refresh keeps the session; logout closes the stream; unplugging the network for 30 s then reconnecting reloads the page data.

#### H2 — Mocks for her pages (frontend)
- MSW handlers + typed fixtures for her endpoints (§9): handoffs, chat, raise urgency, availability, arrival/outcome, admin, metrics, push
- Fixtures cover every case: a stale department, an accepted patient with unread messages, an arrived patient without outcome, staff of each role, metrics data
- A fake SSE source (`VITE_MOCKS=1`): `chat.message` every 30 s, `availability.updated`, `referral.arrived`

**Done when:** `VITE_MOCKS=1 npm run dev` runs all her pages without a backend.

#### H3 — Handoffs list (backend + frontend)
**Goal:** accepted patients on their way to this hospital.
- **Backend:** `GET /dashboard/handoffs?facilityId=` → referrals in `ACCEPTED` for that hospital, sorted by `etaAt`, with `unreadMessages` and `urgencyRaised`. **Read-only**: status changes stay in my `ReferralsService`. Access: membership of that hospital.
- **Frontend:** the left side of the `Handoffs` split view (§7.4): risk badge, code, headline, ETA countdown, accepted at/by, unread badge, "urgency raised" chip, "patient says arrived" chip. Live: `referral.arrived`, `case.escalated`, `chat.message` (badge).

**Done when:** a patient accepted on the Board appears here in < 2 s; rows are sorted by ETA; a manager sees the list read-only.

#### H4 — Patient ↔ ED chat (backend + frontend)
**Goal:** direct conversation between the ED and the patient, from the moment the case is sent to the hospital (§7.4.1).
- **Backend: `chat/` module**
  - table `ChatMessage` (sender PATIENT / STAFF / SYSTEM, kind TEXT / QUESTION / ANSWER / INSTRUCTION / WORSE / SYSTEM / RED_FLAG, `clientRequestId` unique, `readAt`)
  - `GET /chat/:referralId/messages?after=` · `POST /chat/:referralId/messages` (idempotent) · `POST /chat/:referralId/read`
  - access: the patient of the case, or staff of the referral's hospital; **read-only** once the referral is completed, cancelled or rerouted away (403 on POST)
  - on a staff message: push to the patient's devices (`NotifyService`) + `chat.message` on the patient stream
  - on a patient message: `chat.message` to the hospital stream + push to on-duty ED staff; then call my `CasesService.checkChatMessage()` (the AI safety net, mine)
  - "Request more info" questions (my Board) are also written as QUESTION messages, and answers as ANSWER messages, so everything is in one thread
- **Frontend:** the chat panel on the right of `Handoffs` + the *Chat* tab of the case drawer: `TranscriptView`-style bubbles with `dir="auto"`, staff name and role, quick replies (FR/AR templates), unread separator, mark as read when visible, highlighted `WORSE` / `RED_FLAG` messages with a sound, read-only state after reroute.

**Done when:** messages go both ways in < 2 s (dashboard ↔ patient app); a retried send never duplicates a message; a staff member of another hospital gets 403.

#### H5 — Raise urgency (backend + frontend)
**Goal:** the ED raises awareness when the chat shows something urgent (§7.4.2).
- **Backend:** `POST /dashboard/referrals/:id/raise-urgency { level, reason, instruction?, alertTeam }`
  - checks: ED staff or clinician of that hospital; `level` strictly **higher** than the current level (else 409); reason ≥ 10 chars
  - calls my `CasesService.raiseLevel()`, which writes the `Escalation`, changes the level, notifies the patient (Emergency screen for EMERGENCY), writes the report version, audit and learning event
  - her side: the team alert (push to all ED staff + clinicians of the hospital when `alertTeam`) and the `case.escalated` event to the hospital stream
- **Frontend:** the **Raise urgency** dialog: level picker showing only higher levels, required reason, instruction templates ("Call 190 now", "Don't drive, wait for the ambulance", "Come to entrance B") or free text, "Alert my team" checkbox (on). After success: the row/card turns red, and a system line appears in the chat.

**Done when:** the level can only go up; the patient sees the instruction within seconds; colleagues get a push and see the red row live.

#### H6 — Availability (backend + frontend)
**Goal:** the ED updates beds, specialists, wait and equipment **by hand**; matching uses it (§7.6).
- **Backend: `availability/` module**
  - `GET /hospital/:fid/availability`
  - `PATCH /departments/:id/availability` (status, beds, specialists, estimated wait) → saves author + time + a `CapacitySnapshot` row
  - `PATCH /hospital/:fid/equipment/:code`
  - `POST /hospital/:fid/availability/confirm` ("Nothing changed")
  - `DELETE /dashboard/unavailability/:id` (end a temporary block)
  - **`stale-availability` job** (every 10 min): hospitals not updated or confirmed within `availabilityStaleAfterMin` → `availability.stale` event + push to ED staff and manager
  - `availability.updated` event on every change
- **Frontend:** the `Availability` page: department grid (status buttons + steppers, optimistic updates with rollback), equipment toggles, temporary blocks with "End now", "Last confirmed … by …", stale banner, **Nothing changed ✓**.

**Done when:** a change is visible on a colleague's screen in < 2 s; the stale banner appears after the threshold and disappears after confirming; setting a department to Full makes my matching skip it.

#### H7 — Arrival, treatment status, outcome (backend + frontend)
**Goal:** close the loop for learning (gate 4), without doctor or bed data (§7.5).
- **Backend:**
  - `POST /referrals/:id/arrived`, `PUT /referrals/:id/treatment-status`, `POST /referrals/:id/outcome`, through my `ReferralsService` for the status changes
  - the outcome creates the `Outcome` row, sets the referral COMPLETED and the case CLOSED, closes the chat (read-only), and writes a learning event (stage `outcome`) + a gate-4 review
  - `GET /dashboard/missing-outcomes?facilityId=` (arrived > 48 h without an outcome)
  - `GET /reference/diagnosis-categories`
- **Frontend:** the `Arrival` page: today's accepted/arrived list; a 3-step panel (Arrived, with a "patient-reported" hint → treatment status segmented control → outcome form validated with Zod); a "Missing outcomes" tab.

**Done when:** the outcome takes < 30 s to fill; after saving, the case is closed on every screen; the outcome appears in Metrics.

#### H8 — Staff push notifications (backend + frontend)
**Goal:** staff notice important events on their **computer and phone**, even with the tab closed (§6.4, §26 of the main doc).
- **Backend: `notify/` (staff part)**
  - VAPID keys from env
  - `GET /push/vapid-public-key`, `POST/GET/DELETE /push/subscriptions`, `POST /push/test`, `POST /notifications/:id/opened`
  - tables `PushSubscription` + `Notification`
  - `NotifyService.notifyStaff(facilityId, roles, payload)`: Web Push to every active device; deactivate on 404/410
  - **backup-alert job**: no decision after `alertDelaySec` → critical push to all ED staff + clinicians
  - **escalation job**: critical not opened in 2 min → re-send (max 3), then to the manager
  - I call `notifyStaff` from my features (new referral, supervision queue)
- **Frontend:**
  - `public/sw.js` (show the notification; on click: mark opened + open the URL)
  - `lib/push.ts` (`enablePush()` on a button click)
  - "Enable notifications on this device" banner
  - **Settings → My devices** (list, remove, send test)
  - `manifest.webmanifest` (installable PWA)

**Done when:** with the dashboard tab closed, a new EMERGENCY referral shows a notification on the computer and on a phone; clicking it opens the case; a removed device stops receiving.

#### H9 — Manager admin (backend + frontend)
**Goal:** each hospital runs itself (§7.8).
- **Backend: `hospital-admin/` module.** Every route is guarded by the **MANAGER membership of `:fid`** (403 otherwise), and every change is audited.
  - `GET/PATCH /hospital/:fid`: profile, timeouts, alert delay, staleness threshold
  - departments CRUD, equipment add/remove
  - on-call shifts CRUD, **rejecting overlapping shifts** for the same specialty
  - staff: create (temporary password returned once, `mustChangePassword = true`), change role, deactivate (immediate effect), reset password
  - alerts: backup-alert recipients
  - FHIR webhook channels + "send test"
  - `GET /hospital/:fid/stats` (cases received, decisions by type, refusal reasons, median decision time, outcomes, by day)
  - `GET /hospital/:fid/audit` (paginated, filters)
- **Frontend:** the `Admin` page with tabs **My hospital · Departments & equipment · On-call (week calendar) · Staff · Alerts & integrations · Statistics · Audit**.

**Done when:** a manager creates an ED account, and that person logs in and is forced to change the password; a manager of hospital A gets 403 on hospital B; a deactivated user loses access immediately (including the live stream).

#### H10 — Metrics (backend + frontend)
**Goal:** show how well the AI performs (§7.9).
- **Backend:** `GET /learning/metrics?from&to&facilityId&version`
  - reads the learning events (assessment → review → escalation → outcome)
  - the "truth" is the outcome level when present, else the clinician's final level
  - computes: emergency recall, under-triage rate, precision/F1 per level, override rate (up/down), **escalation rate by the ED**, calibration bins + Brier score, split by language/script and model version
  - cached hourly; a manager only sees their own hospital
- **Frontend:** the `Metrics` page: 4 tiles (recall, under-triage, override rate, Brier) + Recharts: calibration curve with the diagonal, F1 per level, recall per language, overrides and escalations over time; filters for period, hospital and version.

**Done when:** the demo cases produce sensible numbers; changing the filters updates the charts; a manager can't select another hospital.

#### H11 — Hospital feedback API (backend)
- `POST /api/hospital-feedback` with an `x-api-key` header (hashed per hospital) and the case reference code: arrived, treatment status, final level, disposition, diagnosis category
- Checks that the case was referred to **that** hospital; writes the same records as H7 with `source = API` + the raw payload
- **Done when:** a curl call with the right key closes a case; a wrong key or another hospital's case → 401/403.

#### H12 — i18n, RTL and responsive pass (frontend, all pages)
- FR complete; AR and EN keys present; `dir="rtl"` for AR checked on every page; patient text with `dir="auto"`
- Layout checked at 1366×768 and on a 10" tablet (Board, Handoffs + chat, Availability first)
- **Done when:** no truncated buttons or broken layouts in AR; every page is usable on the tablet.

#### H13 — Tests (her features)
- **Backend:** access rules (another hospital → 403, ED → no manager routes), chat read-only after reroute, raise urgency only upward, staleness job, outcome closes the case, push subscription cleanup on 410
- **Frontend:** unit tests for the chat panel (send, idempotent retry, unread), the Raise urgency dialog validation, Availability optimistic rollback, the outcome form
- **E2E (Playwright):** (1) accept on the Board → appears in Handoffs → chat message both ways → Raise urgency → red row; (2) arrival → outcome → case closed; (3) accept with ambulance → simulated unit reaches the patient and returns → ARRIVED
- **Backend extras:** tracking access (patient only posts, other hospital 403), purge after 24 h, export audited + rerouted-away cases excluded

#### H14 — Live tracking map (backend + frontend)
**Goal:** the hospital follows an accepted patient (or its simulated ambulance) in real time on a map (main doc §29.2).
- **Backend: `tracking/` module**
  - `POST /tracking/:referralId/positions` (batch from the patient app; only the case's patient, only while the referral is ACCEPTED)
  - `POST /tracking/:referralId/stop`
  - `GET /tracking/:referralId` (latest position, trail, ETA, ambulance status)
  - `GET /dashboard/tracking?facilityId=` (all patients on their way, for the overview map)
  - table `TrackingPoint`; update `Referral.lastPositionAt` and **recompute `etaAt`** (road routing via OSRM/OpenRouteService when available, otherwise distance ÷ average speed)
  - live events `tracking.position` and `tracking.stale` (no point for 2 min)
  - **geofence**: within 150 m of the hospital → "Patient at the door" event + an "Have you arrived?" prompt to the patient
  - jobs: `tracking-stale` (1 min), `tracking-purge` (deletes points 24 h after close)
  - access: only the referred hospital's staff; tracking stops on arrival / cancel / reroute
- **Frontend:**
  - a **map panel in Handoffs** (Leaflet + OpenStreetMap): hospital marker, patient or ambulance marker with its trail, live ETA, "updated X s ago" (orange after 2 min), "Location sharing stopped"
  - an **overview map** toggle showing all incoming patients
  - the map component is reused in the case drawer

**Done when:** a moving phone shows on the dashboard map within a few seconds; the ETA updates; points stop arriving after arrival; another hospital gets 403.

#### H15 — Simulated ambulance (backend + frontend)
**Goal:** when the hospital chooses "We send an ambulance" on Accept, a **simulated** ambulance drives hospital → patient → hospital (main doc §29.1).
- **Backend:**
  - `tracking.dispatchSimulated(referral)`, called by my Accept endpoint when `arrivalMode = AMBULANCE`
  - creates an `AmbulanceDispatch` (unit name, route polyline from OSRM/OpenRouteService or a straight-line fallback)
  - the **`ambulance-simulator` job** (every 2–3 s) moves the unit along the route at about 40 km/h × `DEMO_SPEED_FACTOR`
  - statuses `DISPATCHED → EN_ROUTE_TO_PATIENT → AT_PATIENT (pause) → TRANSPORTING → ARRIVED`; at `ARRIVED`, my `ReferralsService.markArrived()` is called
  - events `ambulance.status` + `tracking.position` (source `AMBULANCE_SIM`) to the hospital **and** the patient
  - cancelling the referral cancels the dispatch
- **Frontend:**
  - an ambulance marker + a status chip ("En route to patient · ETA 6 min") with a **"SIMULATED"** label on the Handoffs map and the Board card
  - a dispatch timeline in the case drawer

**Done when:** Accept with ambulance → the unit visibly moves to the patient, pauses, comes back, and the referral becomes ARRIVED by itself; the patient app shows the same movement.

#### H16 — Data export (backend + frontend)
**Goal:** the hospital exports case data to load it into the software it already uses (main doc §29.7).
- **Backend: `exports/` module**
  - **per case:** `GET /exports/referrals/:id?format=fhir|pdf|csv`
    - FHIR R4 Bundle: Patient, Encounter, Observation, Condition, RiskAssessment, ServiceRequest, Communication (chat), DocumentReference
    - PDF: report + chat transcript
    - CSV: one row
  - **bulk:** `POST /exports { facilityId, from, to, status?, level?, format: CSV | FHIR_NDJSON | PDF_ZIP }` → an `ExportJob` processed in the background; `GET /exports/:id` (status + a signed download link valid 24 h); `GET /exports?facilityId=` (history)
  - rules: only the referral's hospital; never for cases rerouted away; **every export audited**; files deleted after 24 h; an `export.ready` live event when a bulk file is ready
- **Frontend:**
  - an **Export** menu (FHIR / PDF / CSV) in the case drawer and on the Arrival page
  - an **Admin → Exports** tab: filter form, format choice, a job list with status and Download button, and a note on what each format is for

**Done when:** a FHIR export of a demo case validates at validator.fhir.org (or loads in a FHIR viewer); a CSV of a week of cases opens correctly in Excel (UTF-8 BOM, Arabic readable); the audit shows each export.

### 2.3 My tasks (clinical flow, full stack + foundation backend)

| ID | Task | Backend | Frontend | Unblocks | Size |
|---|---|---|---|---|---|
| M0 | Contract + shared types | `packages/shared` v1 | — | everything | S |
| M1 | Schema + seed | Prisma schema, seed (hospitals, staff per role, cases in every status) | — | everything | M |
| M2 | Staff auth + access | login, cookie, password change, memberships, guards, `AccessService` | — | H1 | M |
| M3 | Live backend | `/dashboard/stream`, LiveService, per-hospital + clinician filtering, heartbeat | — | H1 | S |
| M4 | Board & decisions | `dashboard/` endpoints, conditional updates (409), re-match on reject/timeout/reroute, decision-timeout job, `info-requests/` | `Board`, case drawer, 4 decision dialogs | H3 | L + L |
| M5 | Risk components | — | `RiskBadge`, `UncertaintyBar`, `RedFlagList`, `ContributionChart`, `RiskTimeline`, `TranscriptView`, `StateEditor`, `ReportViewer` | M4, M6, her pages | M |
| M6 | Supervision | `supervision/` endpoints, AI re-run, uncertain timeout, learning events on review | queue + `CaseWorkspace` | H8 data | XL + L |
| M6b | Patient chat + safety net | AI rule check on patient chat messages → automatic escalation on a critical red flag; `CasesService.raiseLevel()` (used by her raise-urgency) | chat screen in the patient apps (`mobile/`, `patient-dashboard/`); "I feel worse" posts to the chat | H3 | M + M |
| M4b | Accept with arrival mode | accept body `{ note?, arrivalMode }`; AMBULANCE → calls her `tracking.dispatchSimulated()`; EMERGENCY pre-selects the ambulance | arrival-mode choice in the Accept dialog | H15 | S + S |
| M6c | Patient live location + ambulance view | — (uses her `tracking/` endpoints) | "Share your live location?" prompt at acceptance, `watchPositionAsync` + optional background task (Android foreground-service notification), "Sharing · Stop" bar, batched sends via the outbox; ambulance-on-the-way screen with map and ETA (`mobile/`, `patient-dashboard/`) | H14 | M + M |
| M8 | Matching hard rules | exclude fresh 0 beds / 0 doctors / Full-Closed / required equipment down (e.g. CT for patients needing a scan) | — | H6 | S |
| M7 | Integration & demo | seed for the demo script | — | — | M |

### 2.4 Rules for sharing the backend

- **Schema:** I own `schema.prisma`. She proposes changes by PR (`schema: …`); I review within the day. The tables for her features (departments' availability, snapshots, outcomes, push subscriptions, notifications) are already in §14 of the main doc.
- **Modules don't reach into each other's tables directly.** They call the owning module's service: e.g. her `referrals` arrival code calls my `ReferralsService.markArrived()` if it touches the status machine, and my supervision code calls her `NotifyService.notifyStaff()`.
- **Shared services and their owners:** `AccessService`, `LiveService` (me); `NotifyService` (her); `AuditService` (me, used by both).
- **Live events:** each of us emits the events of our own features through `LiveService.emit()`; event types stay in `packages/shared/src/events.ts`.

---

## 3. Working agreement

### 3.1 Contract first
1. **Day 1:** I publish `packages/shared/src/api.ts` + `events.ts` (= §9–§10). We review it together for 30 minutes and **freeze v1**.
2. Each of us builds our pages against **MSW mocks** generated from these types while building our endpoints to the same types, so the frontend of one feature never waits for the backend of another.
3. **Contract changes:** a PR titled `contract: …` that edits `packages/shared` + this doc; both must approve. Additive changes (new optional field) are fine; renames and removals need a heads-up.

### 3.2 Git workflow
- Branches: `feat/<feature>` (one branch can hold the backend + frontend of a feature), `schema/<change>`, `contract/<change>`
- Small PRs (< 400 lines when possible), each linked to a task ID (H4, M6…)
- Every PR needs one review from the other person; aim for a < 4 h turnaround
- `main` must always run with `docker compose up` (mocks or real API)

### 3.3 Daily sync (10 min)
Yesterday / today / blocked; list any contract question; decide which page switches from mocks to the real API next.

### 3.4 Definition of Done (per page or feature)
- [ ] Matches its spec section, including **loading, empty, error and 409 states**
- [ ] Works against the mocks **and** the real API
- [ ] Live updates handled (if the page lists events)
- [ ] FR labels complete; AR/EN keys present; no layout break in RTL
- [ ] Usable at 1366×768 and on a 10" tablet; keyboard reachable buttons; risk = color **and** text
- [ ] Role checks: hidden in the UI **and** refused by the API (403)
- [ ] Tests from §13 for that page pass; no console errors
- [ ] Reviewed and merged

---

## 4. Users, roles and permissions

A staff user has one account and one **membership per hospital**, each with a role: `ED_STAFF`, `CLINICIAN` or `MANAGER`. A clinician membership may have `supervisesNetwork = true` (they supervise unreferred cases across the network).

| Capability | ED staff | Clinician | Manager |
|---|---|---|---|
| Board: view | ✓ | ✓ (read) | ✓ (read) |
| Board: Accept / Request info / Cannot receive / Reroute | ✓ | — | — |
| Handoffs, Arrival, treatment status, outcome | ✓ | ✓ (read) | ✓ (read) |
| Availability: update | ✓ | — | ✓ |
| Supervision queue + CaseWorkspace actions | — | ✓ | — |
| Admin pages | — | — | ✓ (own hospital) |
| Metrics | — | ✓ | ✓ (own hospital) |
| My devices / notifications | ✓ | ✓ | ✓ |

**Navigation per role** (sidebar):
- ED staff: Board · Handoffs (chat) · Arrival · Availability
- Clinician: Supervision · Board · Handoffs · Metrics
- Manager: Board · Availability · Admin · Metrics
- Everyone: Settings (My devices), hospital switcher, logout

A person with several memberships sees the union of the menus for the **selected** hospital.

---

## 5. Tech stack and project structure

| Concern | Choice |
|---|---|
| Build | Vite + React 18 + TypeScript (strict) |
| Routing | React Router |
| Server state | TanStack Query (cache, refetch, optimistic updates) |
| UI kit | **shadcn/ui + Tailwind, copied from central-park** (`~/Desktop/central-park/ui/src/components/ui`, MIT — keep the notice); see `docs/central-park-reuse.md` §2 |
| Charts | Recharts |
| Forms | React Hook Form + Zod (schemas mirror `@helios/shared`) |
| i18n | react-i18next (FR default, AR RTL, EN) |
| Live | native `EventSource` (SSE) |
| Push | Service worker + Push API (Web Push) |
| Mocks | MSW (Mock Service Worker) |
| Tests | Vitest + React Testing Library; Playwright for 3 E2E flows |

```
hospital-dashboard/
├── index.html
├── public/
│   ├── sw.js                    # Web Push service worker
│   ├── manifest.webmanifest     # installable PWA
│   └── alert.mp3
└── src/
    ├── main.tsx                 # providers: QueryClient, i18n, Router, MSW (dev)
    ├── App.tsx                  # routes + role-based layout + guards
    ├── lib/
    │   ├── api.ts               # fetch wrapper (credentials: 'include'), errors, 409
    │   ├── sse.ts               # useLive()
    │   ├── auth.ts              # session, memberships, selected hospital
    │   ├── push.ts              # enablePush(), devices
    │   └── format.ts            # dates (Africa/Tunis), durations, countdowns
    ├── mocks/                   # MSW handlers + fixtures + fake SSE
    ├── i18n/                    # fr.json, ar.json, en.json
    ├── pages/                   # Login, Board, CaseWorkspace, Handoffs, Arrival, Availability, Admin, Metrics, Settings
    ├── features/                # page-specific pieces (board/, supervision/, admin/…)
    └── components/              # RiskBadge, UncertaintyBar, RedFlagList, ContributionChart,
                                 # StateEditor, TranscriptView, ReportViewer, Countdown, ConfirmDialog
```

Routes:

| Path | Page | Roles |
|---|---|---|
| `/login`, `/change-password` | Login | public / logged in |
| `/board` and `/board/:referralId` (drawer) | Board | all |
| `/handoffs` | Handoffs | ED, clinician, manager |
| `/arrival` and `/arrival/:referralId` | Arrival | ED (write), others read |
| `/availability` | Availability | ED, manager |
| `/supervision` and `/supervision/:caseId` | Queue + CaseWorkspace | clinician |
| `/admin/{hospital,departments,on-call,staff,alerts,stats,audit}` | Admin | manager |
| `/metrics` | Metrics | clinician, manager |
| `/settings/devices` | My devices | all |

---

## 6. Cross-cutting features

### 6.1 Session & hospital context
- Login sets an **httpOnly cookie** (the frontend never sees the token). `GET /me` returns the user and memberships.
- The selected hospital (`facilityId`) is stored in `localStorage` and sent as a query parameter on hospital-scoped calls.
- On `401` → redirect to `/login?next=…`. On `403` → "You don't have access" page.

### 6.2 API client (`lib/api.ts`)
- `fetch(url, { credentials: 'include' })`, JSON in/out, 15 s timeout
- Errors map to `{ code, message, details }`. Show the message in a toast.
- **409 Conflict** = "already handled / state changed": show "Already handled by <name> — refreshing" and refetch the affected query
- Mutations invalidate the related TanStack Query keys (`['board', fid]`, `['referral', id]`, …)

### 6.3 Live updates (`lib/sse.ts`)
```ts
export function useLive(facilityId: string | null, onEvent: (e: LiveEvent) => void, reload: () => void) {
  useEffect(() => {
    if (!facilityId) return;
    const es = new EventSource(`${API}/dashboard/stream?facilityId=${facilityId}`, { withCredentials: true });
    const handler = (type: LiveEventType) => (m: MessageEvent) => onEvent({ type, data: JSON.parse(m.data) } as LiveEvent);
    const handlers = LIVE_EVENT_TYPES.map((t) => [t, handler(t)] as const);
    handlers.forEach(([t, h]) => es.addEventListener(t, h));
    es.onopen = () => reload();              // first connect AND every reconnect → refetch
    return () => { handlers.forEach(([t, h]) => es.removeEventListener(t, h)); es.close(); };
  }, [facilityId]);
}
```
- **Golden rule:** the DB is the truth; events only trigger a refetch or a small cache update.
- The header shows **● Live / ◌ Reconnecting**.
- Sound: an "Enable sound" button on first load (browsers block audio until the user clicks once). New EMERGENCY card → sound + browser notification + tab title "(2) New — HELIOS".

### 6.4 Web Push (`public/sw.js`, `lib/push.ts`)
- An "Enable notifications on this device" banner appears after login until it's done (or dismissed). It runs `enablePush()` **on click**: register the SW → permission → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → `POST /push/subscriptions`.
- `sw.js`: `push` → `showNotification(title, { body, tag, data, requireInteraction: critical })`; `notificationclick` → `POST /notifications/:id/opened` + `clients.openWindow(data.url)`.
- `manifest.webmanifest` so the dashboard can be installed as an app on the ED PC.

### 6.5 i18n & RTL
- All strings in `i18n/*.json`; FR complete, AR/EN keys present.
- Use logical CSS properties (`margin-inline-start`) so AR (RTL) works; `dir="rtl"` on `<html>` when AR is selected.
- Patient text (transcript) is displayed **as typed**, with `dir="auto"` per message.

### 6.6 Design guidelines
- Risk levels: **EMERGENCY** red, **HIGH** orange, **LOW** green, **UNCERTAIN** purple/grey, always with the **text label**.
- Large click targets (≥ 40 px), dense but readable tables, no modal stacking (one dialog at a time).
- Countdowns: green > 50% left, orange < 50%, red < 20%.
- Every list has: loading skeleton · empty state with a short explanation · error state with a "Retry" button.
- Timezone: display `Africa/Tunis`; relative times ("3 min ago") with an absolute tooltip.

---

## 7. Page specifications

Each page lists: purpose · roles · layout · data · actions · live events · states · acceptance criteria.

### 7.1 Login & password change (her H1 / my M2)

- **Purpose:** staff sign-in.
- **Layout:** centered card: email, password, "Sign in"; language switcher.
- **Actions:**
  - `POST /auth/staff/login { email, password }` → `204` + cookie → `GET /me`
  - If `mustChangePassword` → `/change-password` (new password twice, ≥ 10 chars) → `POST /auth/staff/change-password`
  - Logout: `POST /auth/logout`
- **States:** wrong credentials ("Email or password incorrect"); deactivated account ("Account disabled, contact your manager"); too many attempts (429).
- **Acceptance:** after login the user lands on the first page of their role; refreshing keeps the session; logout clears it everywhere (the SSE stream closes).

### 7.2 Board, ED decisions (my M4)

- **Purpose:** see incoming patients live and decide fast.
- **Roles:** ED (actions), clinician/manager (read).
- **Layout:** four columns, **New · Waiting for patient · Accepted · Arrived**, plus a collapsed row **Refused / rerouted / cancelled today**. Top bar: hospital switcher, search by reference code, sound toggle, live indicator.
- **Card content:** risk badge (color + text) · reference code `HC-…` · headline · sex/age · specialty · **ETA countdown** (`etaAt`) · **decision countdown** (`decisionDueAt`, only in New / Waiting) · origin chip ("Rerouted from La Rabta: no specialist") · clinician review chip (approved / overridden / pending) · "Waiting for patient" timer if there is an open question.
- **Sort:** EMERGENCY first, then by ETA ascending.
- **Data:** `GET /dashboard/referrals?facilityId=&status=&ref=` → `BoardCard[]` (§9).
- **Actions** (buttons on the card for ED; full forms in the drawer, §7.3): Accept · Info · Cannot receive · Reroute.
- **Live events:** `referral.new` (insert the card + sound + browser notification) · `referral.status` / `referral.updated` / `info.answered` / `referral.arrived` (refetch the board or patch the card).
- **States:** empty ("No incoming patients"), loading skeleton columns, error + retry, reconnecting banner.
- **Acceptance:**
  - [ ] a new referral appears in < 2 s without a refresh, with sound if enabled
  - [ ] the countdowns tick every second without re-rendering the whole board
  - [ ] the search finds a case by code within this hospital only
  - [ ] the board reloads after a network drop (onopen → reload)

### 7.3 Case drawer, ED view (my M4)

- **Opens** at `/board/:referralId` over the board.
- **Header:** reference code, risk badge, headline, ETA, distance, origin, status chip.
- **Body tabs:** *Summary* (summary, symptoms ✓ / negatives ✗, history, medications, vitals with source badge, red flags) · *Risk* (`RiskBadge`, `UncertaintyBar`, `RedFlagList`, `ContributionChart` read-only, clinician review status and reason) · *Chat* (the same thread as §7.4.1, available from the moment the case is sent, so staff can ask before deciding) · *Timeline* (report versions, questions asked/answered, level changes, decisions) · *Transcript* (collapsed `TranscriptView`) · *Report* (PDF button, print).
- **Data:** `GET /dashboard/referrals/:id` → `ReferralDetail` (§9).
- **Decision dialogs (ED only, visible in status SENT / INFO_REQUESTED; Reroute also in ACCEPTED):**

| Dialog | Fields | Validation | Call |
|---|---|---|---|
| **Accept** | note to patient (optional, ≤ 200); **arrival mode**: *The patient comes on their own* / *We send an ambulance (simulated)* (EMERGENCY pre-selects the ambulance) | mode required | `POST /dashboard/referrals/:id/accept { note?, arrivalMode: 'SELF' \| 'AMBULANCE' }` |
| **Request more info** | one or more questions; for each: template or free text, `answerType` (YES_NO / CHOICE / TEXT), options if CHOICE | text 5–300 chars; CHOICE ≥ 2 options | `POST …/request-info { questions: [...] }` |
| **Deny** (cannot receive) | reason (required: NO_BEDS, SPECIALIST_UNAVAILABLE, EQUIPMENT_DOWN, ED_SATURATED, OTHER), detail (required if OTHER), optional block: specialty + duration (1 h / 2 h / until time) | reason required | `POST …/reject { reason, detail?, block? }` |
| **Reroute** | target: one of `GET …/reroute-options` (list with ETA + reason) or "best available"; reason (required) | target + reason required | `POST …/reroute { facilityId | 'auto', reason }` |

- **After an action:** close the dialog, toast ("Accepted", "Sent to Charles Nicolle"), refetch the board.
- **409:** "Already handled by <name>" → refetch; the drawer shows the new status.
- **Acceptance:**
  - [ ] every dialog blocks submission until valid
  - [ ] two browsers accepting at once → one succeeds, the other sees the 409 message
  - [ ] after a reroute the drawer becomes a summary (the full report is no longer visible)

### 7.4 Handoffs: patients on their way, live map, direct chat (her H3–H5, H14–H15)

- **Purpose:** follow accepted patients until they arrive, **talk with them directly**, and **raise the urgency** if the conversation shows a problem.
- **Roles:** ED staff and clinicians of the hospital (chat + raise urgency); managers read only.

**Layout:** a split view.
- **Left: the list** of accepted patients on their way, sorted by ETA: risk badge, reference code, headline, ETA countdown, accepted at/by, an **unread messages** badge, and an "urgency raised" chip. A row turns **red** only when a person (or a critical rule, see below) raised the urgency.
- **Right: the selected patient's panel:**
  - header: code, risk badge, ETA, "Open full case" (drawer)
  - **Chat thread** with the patient (§7.4.1)
  - **"Raise urgency"** button (§7.4.2)

#### 7.4.1 Direct chat (patient ↔ ED)

- **One thread per referral**, opened when the case is sent to the hospital (so "Request more info" questions also appear in it), and closed (read-only) when the referral is completed, cancelled or rerouted away.
- **Messages:**
  - free text from both sides
  - the hospital's **structured questions** (from "Request more info", yes/no / choice / text) shown as special bubbles with the answer under them
  - **system lines** ("Accepted by La Rabta ED", "Urgency raised to EMERGENCY")
- **Sender display:** the patient sees "La Rabta ED · Amira (nurse)"; staff see the patient's code and language.
- **Quick replies for staff** (FR/AR templates): "Where are you now?", "Can you breathe normally?", "Is someone with you?", "Come to emergency entrance B", "Don't drive, call 190".
- **Patient language:** messages are shown as written. An optional AI translation can appear under each message (open question §14).
- **Delivery:**
  - sending = `POST` (saved first)
  - receiving = live event `chat.message` on the dashboard; on the patient side, push + patient stream
  - unread counters with `readAt`
  - no typing indicators
- **"I feel worse"** in the patient app now posts a highlighted chat message ("⚠ The patient says they feel worse: …") instead of silently re-scoring. The ED reads it and decides.
- **Safety net:** every patient chat message is also checked by the AI service's **rules** (§21).
  - If a **critical red flag** fires (e.g. "ma najamch nitnaffes", "I can't breathe"), the system raises the urgency automatically: the patient gets the emergency instructions, the ED gets an alert, and the chat shows "Possible red flag detected: breathing difficulty".
  - Otherwise nothing changes automatically; the ED stays in charge.

#### 7.4.2 Raise urgency (ED "raise awareness")

When the ED notices something urgent in the chat (or by phone), a staff member clicks **Raise urgency**:

| Field | Values |
|---|---|
| New level | only **higher** than the current one (e.g. HIGH → EMERGENCY). Lowering is never allowed here (only a clinician can, §7.7) |
| Reason | required (e.g. "Patient reports chest pain spreading to the left arm") |
| Instruction to the patient | optional template or text: "Call 190 now", "Stop, don't drive, wait for the ambulance", "Come directly to emergency entrance B" |
| Alert the team | checked by default: push to all ED staff + clinicians of the hospital |

**Effects (backend, in one transaction):**
1. Raises the case level (`Escalation` row: who, from, to, reason, instruction)
2. Posts a system line + the instruction in the chat
3. Sends a **critical push** to the patient. If the new level is EMERGENCY, the patient app opens the **Emergency screen** with the hospital's instruction on top.
4. Sends a push to the hospital team, turns the Handoffs row and the Board card red, and plays the sound
5. Writes a new report version (UPDATE), an audit entry and a learning event (human escalation)

#### 7.4.3 Live tracking map + simulated ambulance (her H14–H15)

- A **map panel** in the selected patient's view (Leaflet + OpenStreetMap):
  - the hospital
  - the **patient's phone** (mode SELF, if they share it) or the **simulated ambulance** (mode AMBULANCE) with its trail
  - the live ETA, "updated X s ago" (orange after 2 min), "Location sharing stopped", "Patient at the door" (geofence 150 m)
- Ambulance status chip: *Dispatched → En route to patient → At patient → Transporting → Arrived*, always labeled **SIMULATED**.
- An **overview map** toggle: all patients on their way to this hospital.
- **Calls:** `GET /tracking/:referralId`, `GET /dashboard/tracking?facilityId=`. **Live:** `tracking.position`, `tracking.stale`, `ambulance.status`.

- **Calls:**
  - `GET /dashboard/handoffs?facilityId=`
  - `GET /chat/:referralId/messages?after=`
  - `POST /chat/:referralId/messages { text, kind }`
  - `POST /chat/:referralId/read`
  - `POST /dashboard/referrals/:id/raise-urgency { level, reason, instruction?, alertTeam }`
- **Live:** `chat.message`, `chat.read`, `case.escalated`, `referral.arrived`.
- **Acceptance:**
  - [ ] a patient message appears on the dashboard in < 2 s, and an ED message reaches the patient's phone even with the app closed
  - [ ] "Raise urgency" can only go up, requires a reason, and the patient sees the instruction within seconds (Emergency screen for EMERGENCY)
  - [ ] the team gets a push; the row turns red for everyone viewing the hospital
  - [ ] a critical red flag written in the chat triggers the automatic escalation even if nobody is looking at the dashboard
  - [ ] after a reroute, the old hospital's chat becomes read-only

### 7.5 Arrival, treatment & outcome (her H7, H11)

- **Purpose:** close the loop for the feedback (gate 4). No doctor or bed data.
- **Layout:** list of today's ACCEPTED/ARRIVED referrals; detail panel with three steps:
  1. **Arrived**: button (shows "patient-reported" if the patient tapped "I arrived") → `POST /referrals/:id/arrived`
  2. **Treatment status**: segmented control *In treatment · Admitted · Transferred · Discharged · Left without being seen* → `PUT /referrals/:id/treatment-status { status }`
  3. **Outcome form**: final level (4 options), disposition (DISCHARGED/ADMITTED/ICU/TRANSFERRED/DECEASED/LEFT), diagnosis category (select from `GET /reference/diagnosis-categories`), diagnosis text (optional), notes (optional) → `POST /referrals/:id/outcome`
- **Missing outcomes tab:** ARRIVED for more than 48 h without an outcome.
- **Acceptance:** the outcome takes < 30 s to fill; after saving, the referral leaves the list and the case is CLOSED.

### 7.6 Availability (her H6)

The hospital keeps its **services** up to date so routing never sends a patient it can't handle: **scanner (CT) working/down**, **free beds**, **doctors available** (per department; for the ED, ED doctors on duty). Fresh 0 beds, 0 doctors, Full/Closed, or a scanner that is down for a patient who needs a scan → the hospital is **excluded** from routing for that case (main doc §15, §23).


- **Roles:** ED, manager.
- **Layout:** header "Last confirmed <time> by <name>" + a yellow stale banner when needed + **"Nothing changed ✓"** button.
  - Department grid: name · status buttons (Available / Limited / Full / Closed) · steppers: free beds, specialists on duty, estimated wait (min) · "updated 20 min ago by X"
  - Equipment row: toggles working / down
  - Temporary blocks list: specialty, until, reason, "End now"
- **Data/actions:**
  - `GET /hospital/:fid/availability` → `AvailabilityView`
  - `PATCH /departments/:id/availability { status?, bedsAvailable?, specialistsOnDuty?, estimatedWaitMin? }` (optimistic, rollback on error)
  - `PATCH /hospital/:fid/equipment/:code { operational }`
  - `POST /hospital/:fid/availability/confirm`
  - `DELETE /dashboard/unavailability/:id`
- **Live:** `availability.updated` (a colleague changed something → refetch), `availability.stale` (banner + browser notification).
- **Acceptance:** each change persists immediately with author and time; stale banner after the threshold; "Nothing changed" clears it.

### 7.7 Supervision, clinicians (my M6)

#### 7.7.1 Supervision queue
- **Layout:** table: priority, risk badge, reason in queue (EMERGENCY / UNCERTAIN / LOW_CONFIDENCE / DISAGREEMENT / AI_DEGRADED / LEVEL_RAISED), `pFinal`, uncertainty, waiting time, review due countdown (UNCERTAIN), "auto-escalated" tag, scope (network / my hospital).
- **Data:** `GET /supervision/queue?scope=network|facility&facilityId=`.
- **Live:** `supervision.queued` (insert + sound for EMERGENCY), `case.reviewed` (remove).

#### 7.7.2 CaseWorkspace (`/supervision/:caseId`)
- **Layout:** three columns on desktop (stacked on a tablet):
  - **Left: conversation.** `TranscriptView` (timestamps, language/script tags, normalized text on hover), plus a "Message the patient" input (CLINICIAN turn)
  - **Center: clinical state.** `StateEditor` (symptoms present/absent with evidence quote, history, medications, vitals with source, pregnancy, uncertainties, missing info). "Save correction" → re-run
  - **Right: risk & decision.** `RiskBadge`, `UncertaintyBar`, `RedFlagList`, `ContributionChart`, a **risk-over-time** chart (`pFinal` per assessment with level bands; markers for corrections and overrides), the **action panel**, notes, and the `ReportViewer` (draft, editable)
- **Data:** `GET /supervision/cases/:id` → `SupervisionCase`.
- **Actions:**

| Action | Call | Rules |
|---|---|---|
| Save state correction | `PUT /supervision/cases/:id/state { state, note? }` → returns the new assessment | shows a spinner "Re-assessing…" (up to 15 s) |
| Approve | `POST /supervision/cases/:id/approve { assessmentId, note? }` | enabled only when the shown `assessmentId` is current |
| Override | `POST /supervision/cases/:id/override { assessmentId, level, reason }` | reason required (≥ 10 chars); **down from EMERGENCY** → second confirmation + reason ≥ 20 chars |
| Add note | `POST /supervision/cases/:id/notes { text }` | — |
| Message patient | `POST /supervision/cases/:id/messages { text }` | — |
| Edit report | `PUT /supervision/cases/:id/report { report }` | saves a new version (author CLINICIAN) |

- **Live:** `case.turn` (append the message + new assessment point), `case.state_corrected`, `case.reviewed` (someone else acted → banner + refresh).
- **409:** "Risk changed since you opened it — re-check" → reload the assessment.
- **Acceptance:**
  - [ ] the view updates while the patient is typing
  - [ ] a correction creates a new point on the chart; the AI's original state remains visible (version selector)
  - [ ] approve/override on an outdated assessment returns 409 and the UI refreshes
  - [ ] the down-from-EMERGENCY override requires the double confirmation

### 7.8 Admin, managers (her H9)

Sub-pages (tabs) for the selected hospital:

| Tab | Content | Calls |
|---|---|---|
| **My hospital** | name, address, coordinates (map pin), ED phone, decision timeouts (EMERGENCY / HIGH), backup-alert delay, staleness threshold | `GET/PATCH /hospital/:fid` |
| **Departments & equipment** | departments table (specialty, takes emergencies, notes) add/remove; equipment list add/remove | `/hospital/:fid/departments`, `/hospital/:fid/equipment` |
| **On-call** | week calendar per specialty; add shift (specialty, start, end); overlap error | `/hospital/:fid/on-call` |
| **Staff** | table (name, email, role, active, last login); create (email, name, role → temporary password shown once); change role; deactivate; reset password | `/hospital/:fid/staff` |
| **Alerts & integrations** | backup-alert recipients (ED staff / clinicians / manager), FHIR webhook URL + secret + "send test" | `/hospital/:fid/alerts`, `/hospital/:fid/channels` |
| **Statistics** | cases received, accepted / refused / rerouted / timed out, refusal reasons, median decision time, outcomes, by day | `GET /hospital/:fid/stats?from&to` |
| **Audit** | searchable list: time, user, action, entity | `GET /hospital/:fid/audit?…` |

**Acceptance:** a manager of hospital A can't see or edit hospital B (the UI hides it; the API returns 403); a created staff account can log in and is forced to change its password.

### 7.9 Metrics (her H10)

- **Roles:** clinician, manager (own hospital).
- **Filters:** period, hospital (managers: their own), model version.
- **Tiles:** emergency recall · under-triage rate · override rate (up / down) · Brier score.
- **Charts:** calibration curve (10 bins + the diagonal) · precision/F1 per level · recall per language/script · override rate over time.
- **Data:** `GET /learning/metrics?from&to&facilityId&version` → `MetricsView`.

### 7.11 Data export (her H16)

- **Per case:** an "Export" menu in the case drawer and on Arrival: **FHIR R4 JSON**, **PDF** (report + chat), **CSV** (1 row).
- **Bulk (Admin → Exports):** period, status, level, format (**CSV**, **FHIR NDJSON**, **ZIP of PDFs**) → job list (Queued / Running / Ready / Failed) with Download (link valid 24 h). Live: `export.ready`.
- Only the case's hospital can export; every export is audited; nothing is exported for cases rerouted away.
- **Calls:** `GET /exports/referrals/:id?format=`, `POST /exports`, `GET /exports/:id`, `GET /exports?facilityId=`.

### 7.10 Settings: my devices & notifications (her H8)

- "Enable notifications on this device" (status: enabled / blocked / unsupported, with help when the browser blocks it)
- List of my devices (`GET /push/subscriptions`): label, last seen, "Remove" (`DELETE /push/subscriptions/:id`); "Send test notification" (`POST /push/test`)
- Language and sound preferences

---

## 8. Shared components

| Component | Props | Notes |
|---|---|---|
| `RiskBadge` | `level: RiskLevel`, `size?` | color + text; aria-label |
| `UncertaintyBar` | `uncertainty: 'LOW'|'MEDIUM'|'HIGH'`, `pFinal?` | tooltip with the value |
| `RedFlagList` | `rules: TriggeredRule[]` | severity icon; empty → "No red flags" |
| `ContributionChart` | `contributions: { bias, nlp, rules }`, `pFinal` | horizontal bars (log-odds), positive/negative |
| `Countdown` | `to: string`, `total?: number` | 1 s tick via one shared timer; color thresholds |
| `TranscriptView` | `turns: Turn[]`, `highlight?` | `dir="auto"`, timestamps, role colors, language tags |
| `StateEditor` | `state: CaseState`, `onSave(state, note)` | controlled form (React Hook Form + Zod); diff preview before saving |
| `ReportViewer` | `report: StructuredReport`, `editable?`, `onSave?` | sections per field of the structured report |
| `RiskTimeline` | `points: { at, pFinal, level, kind }[]` | Recharts line + level bands + markers |
| `ConfirmDialog` | `title`, `danger?`, `requireText?` | used for overrides and deactivation |
| `EmptyState`, `ErrorState`, `Skeletons` | — | consistent states on every page |

---

## 9. API contract for the dashboard

All types live in `packages/shared/src/api.ts`. **Base path:** `/` (backend on `:3000`). **Auth:** cookie. **Errors:** `{ code: string; message: string; details?: unknown }`, with HTTP 400 (validation), 401, 403, 404, 409 (state changed), 429.

### 9.1 Core types

```ts
export type RiskLevel = 'EMERGENCY' | 'HIGH' | 'LOW' | 'UNCERTAIN';
export type Uncertainty = 'LOW' | 'MEDIUM' | 'HIGH';
export type FacilityRole = 'ED_STAFF' | 'CLINICIAN' | 'MANAGER';
export type ReferralStatus = 'SENT' | 'INFO_REQUESTED' | 'ACCEPTED' | 'REJECTED' | 'REROUTED'
  | 'TIMED_OUT' | 'CANCELLED' | 'ARRIVED' | 'COMPLETED';
export type TreatmentStatus = 'IN_TREATMENT' | 'ADMITTED' | 'TRANSFERRED' | 'DISCHARGED' | 'LEFT_WITHOUT_BEING_SEEN';
export type ReviewStatus = 'NONE' | 'QUEUED' | 'APPROVED' | 'OVERRIDDEN';

export interface Me {
  id: string; name: string; email: string; language: 'fr' | 'ar' | 'en';
  mustChangePassword: boolean;
  memberships: { facilityId: string; facilityName: string; facilityRole: FacilityRole; supervisesNetwork: boolean }[];
}

export interface TriggeredRule { id: string; name: string; severity: 'critical' | 'high' | 'moderate' }

export interface AssessmentSummary {
  id: string; level: RiskLevel; pFinal: number | null; uncertainty: Uncertainty;
  pNlp: number | null; sRule: number | null; triggeredRules: TriggeredRule[];
  contributions: { bias: number; nlp: number; rules: number } | null;
  rationale: string | null; createdAt: string; versions: Record<string, string>;
}

export interface BoardCard {
  id: string;                         // referral id
  caseId: string; referenceCode: string;
  status: ReferralStatus; level: RiskLevel; headline: string;
  patient: { sex: 'M' | 'F' | null; age: number | null; pregnant: boolean | null; language: string };
  specialty: string | null;
  etaAt: string | null; distanceKm: number | null;
  decisionDueAt: string | null;
  origin: 'AUTO_ASSIGN' | 'AUTO_EMERGENCY' | 'AUTO_REMATCH' | 'HOSPITAL_REROUTE' | 'LOCATION_CORRECTED' | 'CLINICIAN_OVERRIDE';
  fromFacility: string | null; fromReason: string | null;
  reviewStatus: ReviewStatus;
  openInfoRequests: number; infoRequestedAt: string | null;
  reportVersion: number; levelRaised: boolean; patientReportedArrival: boolean;
  updatedAt: string;
}

export interface StructuredReport {
  summary: string; chief_complaint: string;
  timeline: { at: string; event: string }[];
  positives: string[]; negatives: string[]; history: string[]; medications: string[];
  vitals: Record<string, { value: number | string | null; source: 'patient' | 'clinician' }>;
  red_flags: string[];
  risk: { level: RiskLevel; p_final: number | null; uncertainty: Uncertainty };
  recommended_actions: string[]; open_questions: string[]; disclaimer: string;
}

export interface Turn { id: string; index: number; role: 'PATIENT' | 'ASSISTANT' | 'SYSTEM' | 'CLINICIAN' | 'HOSPITAL';
  text: string; normalizedText?: string; language?: string; script?: string; createdAt: string }

export interface ChatMessage {
  id: string; referralId: string;
  sender: 'PATIENT' | 'STAFF' | 'SYSTEM'; senderName?: string; senderRole?: 'ED_STAFF' | 'CLINICIAN';
  kind: 'TEXT' | 'QUESTION' | 'ANSWER' | 'INSTRUCTION' | 'WORSE' | 'SYSTEM' | 'RED_FLAG';
  text: string; translation?: string | null;
  infoRequestId?: string | null;          // QUESTION / ANSWER bubbles
  createdAt: string; readAt: string | null;
}

export interface TrackingView {
  referralId: string; arrivalMode: 'SELF' | 'AMBULANCE' | null; sharing: boolean;
  latest: { lat: number; lng: number; accuracyM?: number; recordedAt: string; source: 'PATIENT' | 'AMBULANCE_SIM' } | null;
  trail: { lat: number; lng: number; recordedAt: string }[];
  etaAt: string | null; atDoor: boolean;
  ambulance: { unitName: string; status: 'DISPATCHED' | 'EN_ROUTE_TO_PATIENT' | 'AT_PATIENT' | 'TRANSPORTING' | 'ARRIVED' | 'CANCELLED'; simulated: true } | null;
}

export interface ExportJobDto { id: string; format: 'CSV' | 'FHIR_NDJSON' | 'PDF_ZIP'; status: 'QUEUED' | 'RUNNING' | 'READY' | 'FAILED' | 'EXPIRED';
  filters: { from: string; to: string; status?: string; level?: string }; rowCount?: number; downloadUrl?: string; expiresAt?: string; createdAt: string }

export interface InfoRequestDto { id: string; question: string; answerType: 'YES_NO' | 'CHOICE' | 'TEXT';
  options: string[]; askedBy: string; askedAt: string; answer: string | null; answeredAt: string | null }

export interface ReferralDetail extends BoardCard {
  report: StructuredReport; reportPdfUrl: string;
  assessment: AssessmentSummary;
  review: { status: ReviewStatus; by?: string; at?: string; fromLevel?: RiskLevel; toLevel?: RiskLevel; reason?: string } | null;
  infoRequests: InfoRequestDto[];
  timeline: { at: string; kind: string; text: string }[];
  transcript: Turn[];
  fullAccess: boolean;                // false after a reroute away → summary only
  treatmentStatus: TreatmentStatus | null; arrivedAt: string | null;
}
```

### 9.2 Endpoints

| Method & path | Body | Response | Page |
|---|---|---|---|
| `POST /auth/staff/login` | `{ email, password }` | 204 + cookie | 7.1 |
| `POST /auth/staff/change-password` | `{ current, next }` | 204 | 7.1 |
| `POST /auth/logout` | — | 204 | all |
| `GET /me` | — | `Me` | all |
| `GET /dashboard/referrals?facilityId&status&ref` | — | `BoardCard[]` | 7.2 |
| `GET /dashboard/referrals/:id` | — | `ReferralDetail` | 7.3 |
| `POST /dashboard/referrals/:id/accept` | `{ note?: string }` | `BoardCard` | 7.3 |
| `POST /dashboard/referrals/:id/request-info` | `{ questions: { text, answerType, options? }[] }` | `BoardCard` | 7.3 |
| `POST /dashboard/referrals/:id/reject` | `{ reason, detail?, block?: { specialtyCode \| null, until } }` | `BoardCard` | 7.3 |
| `GET /dashboard/referrals/:id/reroute-options` | — | `{ facilityId, name, etaMinutes, distanceKm, reason, score }[]` | 7.3 |
| `POST /dashboard/referrals/:id/reroute` | `{ facilityId: string \| 'auto', reason }` | `BoardCard` | 7.3 |
| `GET /dashboard/handoffs?facilityId` | — | `BoardCard[]` (+ `unreadMessages`, `urgencyRaised`) | 7.4 |
| `GET /chat/:referralId/messages?after` | — | `ChatMessage[]` | 7.4 |
| `POST /chat/:referralId/messages` | `{ text, kind: 'TEXT' }` (+ `Idempotency-Key`) | `ChatMessage` | 7.4 |
| `POST /chat/:referralId/read` | `{ upToMessageId }` | 204 | 7.4 |
| `GET /tracking/:referralId` | — | `TrackingView` | 7.4.3 |
| `GET /dashboard/tracking?facilityId` | — | `TrackingView[]` | 7.4.3 |
| `GET /exports/referrals/:id?format=fhir\|pdf\|csv` | — | file | 7.11 |
| `POST /exports` | `{ facilityId, from, to, status?, level?, format }` | `ExportJobDto` | 7.11 |
| `GET /exports/:id` · `GET /exports?facilityId` | — | `ExportJobDto` / `ExportJobDto[]` | 7.11 |
| `POST /dashboard/referrals/:id/raise-urgency` | `{ level, reason, instruction?, alertTeam }` | `BoardCard` (409 if the level isn't higher) | 7.4 |
| `GET /dashboard/stream?facilityId` | — | SSE (§10) | all |
| `POST /referrals/:id/arrived` | — | `BoardCard` | 7.5 |
| `PUT /referrals/:id/treatment-status` | `{ status: TreatmentStatus }` | `BoardCard` | 7.5 |
| `POST /referrals/:id/outcome` | `{ finalLevel, disposition, diagnosisCategory, diagnosisText?, notes? }` | 204 | 7.5 |
| `GET /dashboard/missing-outcomes?facilityId` | — | `BoardCard[]` | 7.5 |
| `GET /reference/diagnosis-categories` | — | `{ code, nameFr, nameAr, nameEn }[]` | 7.5 |
| `GET /hospital/:fid/availability` | — | `AvailabilityView` | 7.6 |
| `PATCH /departments/:id/availability` | `{ status?, bedsAvailable?, specialistsOnDuty?, estimatedWaitMin? }` | `DepartmentAvailability` | 7.6 |
| `PATCH /hospital/:fid/equipment/:code` | `{ operational }` | 204 | 7.6 |
| `POST /hospital/:fid/availability/confirm` | — | `{ confirmedAt }` | 7.6 |
| `DELETE /dashboard/unavailability/:id` | — | 204 | 7.6 |
| `GET /supervision/queue?scope&facilityId` | — | `QueueItem[]` | 7.7 |
| `GET /supervision/cases/:id` | — | `SupervisionCase` | 7.7 |
| `PUT /supervision/cases/:id/state` | `{ state: CaseState, note? }` | `{ stateVersion, assessment: AssessmentSummary }` | 7.7 |
| `POST /supervision/cases/:id/approve` | `{ assessmentId, note? }` | 204 | 7.7 |
| `POST /supervision/cases/:id/override` | `{ assessmentId, level, reason }` | 204 | 7.7 |
| `POST /supervision/cases/:id/notes` | `{ text }` | `{ id, createdAt }` | 7.7 |
| `POST /supervision/cases/:id/messages` | `{ text }` | `Turn` | 7.7 |
| `PUT /supervision/cases/:id/report` | `{ report: StructuredReport }` | `{ version }` | 7.7 |
| `GET/PATCH /hospital/:fid` | profile fields | `HospitalProfile` | 7.8 |
| `GET/POST/PATCH/DELETE /hospital/:fid/departments[/:id]` | department fields | `Department` | 7.8 |
| `GET/POST/DELETE /hospital/:fid/equipment[/:code]` | `{ code }` | — | 7.8 |
| `GET/POST/DELETE /hospital/:fid/on-call[/:id]` | `{ specialtyCode, startsAt, endsAt }` | `Shift` | 7.8 |
| `GET/POST/PATCH /hospital/:fid/staff[/:id]` | `{ email, name, facilityRole }` / `{ facilityRole?, active?, resetPassword? }` | `StaffMember` (+ `temporaryPassword` once) | 7.8 |
| `GET/PATCH /hospital/:fid/alerts` | `{ recipients: FacilityRole[] }` | — | 7.8 |
| `GET/POST/DELETE /hospital/:fid/channels`, `POST …/:id/test` | `{ type: 'WEBHOOK_FHIR', target, secret }` | — | 7.8 |
| `GET /hospital/:fid/stats?from&to` | — | `HospitalStats` | 7.8 |
| `GET /hospital/:fid/audit?from&to&user&action` | — | `AuditEntry[]` (paginated) | 7.8 |
| `GET /learning/metrics?from&to&facilityId&version` | — | `MetricsView` | 7.9 |
| `GET /push/vapid-public-key` | — | `{ key }` | 7.10 |
| `POST /push/subscriptions` | `{ kind: 'WEB', subscription, deviceLabel }` | `{ id }` | 7.10 |
| `GET /push/subscriptions` | — | `{ id, deviceLabel, lastSeenAt }[]` | 7.10 |
| `DELETE /push/subscriptions/:id` | — | 204 | 7.10 |
| `POST /push/test` | — | 204 | 7.10 |
| `POST /notifications/:id/opened` | — | 204 | sw.js |

Remaining types (`AvailabilityView`, `DepartmentAvailability`, `QueueItem`, `SupervisionCase`, `HospitalProfile`, `StaffMember`, `HospitalStats`, `AuditEntry`, `MetricsView`) are written in `packages/shared/src/api.ts` during M0, following the fields listed in each page spec above.

---

## 10. Live events (SSE) contract

Stream: `GET /dashboard/stream?facilityId=` (cookie auth). Events are named; `data` is JSON. A `ping` every 25 s.

| Event | Sent to | `data` | Frontend reaction |
|---|---|---|---|
| `referral.new` | ED staff of the hospital | `BoardCard` | insert the card, sound, browser notification |
| `referral.status` | same | `{ id, status, by?: string }` | move/grey the card; close dialogs if affected |
| `referral.updated` | same | `{ id, levelRaised: boolean, level, reportVersion }` | patch the card, highlight, sound if the level rose |
| `info.answered` | same | `{ referralId, infoRequestId, answer }` | show the answer on the card/drawer |
| `referral.arrived` | same | `{ id, patientReported: boolean }` | move to Arrived |
| `chat.message` | ED staff + clinicians of the hospital | `ChatMessage` | append to the thread; unread badge; sound for `WORSE` / `RED_FLAG` |
| `chat.read` | same | `{ referralId, upToMessageId, by }` | update read marks |
| `tracking.position` | staff of the referred hospital | `{ referralId, lat, lng, recordedAt, source, etaAt, atDoor }` | move the marker, update ETA |
| `tracking.stale` | same | `{ referralId, since }` | "no update for 2 min" |
| `ambulance.status` | same | `{ referralId, unitName, status, etaAt }` | status chip + timeline |
| `export.ready` | the requester | `{ exportId }` | enable Download |
| `case.escalated` | same + clinicians in scope | `{ referralId, caseId, fromLevel, toLevel, by, reason, automatic: boolean }` | red row/card, sound, banner in the chat |
| `availability.updated` | ED + managers of the hospital | `{ departmentId?, by }` | refetch Availability |
| `availability.stale` | same | `{ since }` | show the banner + browser notification |
| `supervision.queued` | clinicians in scope | `QueueItem` | insert into the queue (+ sound for EMERGENCY) |
| `case.turn` | clinicians viewing the case | `{ caseId, turn: Turn, assessment: AssessmentSummary }` | append to the transcript + chart |
| `case.state_corrected` | same | `{ caseId, stateVersion, assessment }` | refresh the state + chart |
| `case.reviewed` | clinicians in scope | `{ caseId, decision, by }` | remove from the queue; banner in the workspace |

---

## 11. Mocks (no page waits for an endpoint)

- **MSW** handlers in `src/mocks/handlers.ts` for every endpoint of §9, typed with `@helios/shared`.
- **Fixtures** in `src/mocks/fixtures/`: 3 hospitals, staff per role, 12 referrals covering **every status** (incl. rerouted, timed out, arrived without outcome), 4 supervision cases (EMERGENCY, UNCERTAIN, disagreement, degraded), availability with one stale department, metrics data.
- **Fake SSE:** a dev-only `MockEventSource` that emits a `referral.new` every 45 s, an `info.answered` 20 s after a request-info, and `case.turn` events on the supervision case. `useLive` picks it when `VITE_MOCKS=1`.
- Mutations update the in-memory fixtures, so the flows (accept → card moves) work end to end.
- `VITE_MOCKS=1 npm run dev` = mocks; without the flag = real API.

---

## 12. Milestones and schedule

| Milestone | Her (hospital operations) | Me (clinical flow + foundation) | Joint check |
|---|---|---|---|
| **M0: Contract** (day 1, morning) | review the contract; H0 shell setup | M0 shared types, M1 schema + seed | contract v1 frozen |
| **M1: Foundation** (day 1) | H1 login + `useLive`, H2 mocks | M2 auth, M3 SSE, M5 risk components (first ones) | login + live stream on the real API |
| **M2: Core features** (day 2) | H3 Handoffs, H4 chat, H6 Availability | M4 Board + decisions (full stack), M4b Accept with arrival mode, M6b patient chat screen, M8 matching hard rules | decision flow with 2 browsers; chat both ways; availability "Full" changes matching |
| **M3: Supervision & arrival** (day 2–3) | H5 Raise urgency, H7 Arrival + outcome, H8 staff push, H14 tracking map, H15 simulated ambulance | M6 supervision (full stack), M6c patient live location + ambulance view | correction → re-run → override; arrival → outcome closes the case; push with the tab closed |
| **M4: Manager & metrics** (day 3) | H9 Admin, H10 Metrics, H16 Exports, H11 feedback API | M7 demo seed, help on her backend if needed | manager creates staff → staff logs in; metrics show the demo data |
| **M5: Polish** (day 3 evening) | H12 i18n/responsive, H13 tests | bug fixes, my tests | full demo script twice |

**If time runs short, cut in this order:** Metrics charts beyond the 4 tiles → Admin stats/audit → on-call calendar UI (seed instead) → feedback API → RiskTimeline polish. **Never cut:** Board + decisions, CaseWorkspace approve/override, Arrival/outcome, live updates.

---

## 13. Test plan and demo checklist

### 13.1 Frontend tests (each of us for our own pages)
- **Unit (Vitest + RTL):** `RiskBadge` (label per level), `Countdown` (color thresholds), decision dialogs' validation, `StateEditor` diff + save, the `useLive` reconnect → reload behavior (mock EventSource).
- **E2E (Playwright, against mocks):**
  1. Login → Board → a new card arrives → Accept with a note → the card moves to Accepted
  2. Request info → the fake answer arrives → Cannot receive with a block → the card leaves New
  3. Clinician: open a queued case → correct the state → the new assessment appears → override with a reason

### 13.2 Backend tests (each of us for our own modules)
- 409 on concurrent accept; access rules (ED of A can't read B; ED can't call manager endpoints)
- SSE delivers only the selected hospital's events; reconnect works
- Supervision approve/override on a stale assessment → 409

### 13.3 Joint demo checklist
- [ ] Two hospital windows + one clinician window side by side; events in < 2 s
- [ ] Decision flow incl. reroute to the second hospital
- [ ] Accept with **ambulance**: the simulated unit drives to the patient and back on both the dashboard map and the patient app; the referral becomes ARRIVED
- [ ] Accept with **self**: the patient shares their location; the dashboard map follows them; "Patient at the door" near the hospital
- [ ] Export a case as FHIR + CSV; bulk export of the demo day
- [ ] Set a hospital's scanner to "down": a patient needing a scan is routed elsewhere; set beds to 0: the hospital disappears from the options
- [ ] Chat: patient ↔ ED messages both ways in < 2 s; ED "Raise urgency" → the patient's Emergency screen shows the instruction; a red-flag message escalates automatically
- [ ] Clinician correction + override visible on the board (review chip)
- [ ] Arrival → treatment status → outcome → the case closes
- [ ] Availability "Full" → the next matching skips that hospital
- [ ] Tab closed → a backup alert arrives as a push on the computer and a phone
- [ ] Network off 30 s → reconnect → the board is up to date
- [ ] AR layout check on one page

---

## 14. Open questions

1. Which UI kit (Mantine vs shadcn/ui + Tailwind)? Decide on day 1, owner: teammate.
2. The diagnosis category list for the outcome form: needs the AI team + a clinician.
3. Request-info templates (FR/AR): who writes the first 10? Proposal: teammate drafts, a clinician reviews.
4. Can a clinician also take ED decisions in small hospitals? (Currently no: different roles; a person can hold two memberships.)
5. Board columns for very busy EDs: do we need a compact table view as an alternative?
6. Chat translation: show an AI translation under patient messages (Darija/Arabizi → French) and under staff messages (French → the patient's language)? It needs a `/translate` endpoint in the AI service.
7. Chat hours: who answers the chat when the ED is overwhelmed? Should the patient see "The ED may take a few minutes to answer — call 190 if it gets worse"? (Proposed: yes, always shown.)
