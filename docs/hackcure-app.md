# Sahhanito (HackCure) — Complete Reference

As of 2026-10-09. This follows the **final repository architecture** (§5): `ai/`, `ai-stub/`, `backend/`, `packages/shared/`, `hospital-dashboard/`, `patient-dashboard/` and `mobile/`.

**What it does:** a patient describes their problem in Tunisian Darija, Arabizi, Arabic, French or English. The AI service interviews them, builds a structured clinical state and assesses the risk (an NLP classifier fused with clinical rules). The backend picks the right hospital among all major hospitals of Grand Tunis and sends the case to that hospital's ED with an alert and a report. **Clinicians supervise continuously**: they can correct the state, validate the risk or override it. The ED decides (Accept / Request more info / Deny / Reroute). On Accept it chooses **patient comes alone** or **sends an ambulance (simulated)**, follows the patient **live on a map**, chats with them, then records arrival, treatment status and outcome, and can **export** the case to its own software. Every decision feeds a **learning loop**.

**Who owns what:**
- **AI team:** `ai/`, the NLP, classifier, rules, fusion, safety policy and report generation.
- **My part:** `backend/`, `hospital-dashboard/`, `patient-dashboard/`, `mobile/`, `packages/shared/`, `ai-stub/`, the integration between all of them, and report delivery.

**Stack:** FastAPI (AI) · **Next.js (API only) + PostgreSQL + Prisma** (backend) · **React + Vite** (both dashboards) · Expo (mobile) · SSE for live updates · Docker Compose to run everything.

## Contents

- **Part A — Product:** 1 Ownership · 2 Actors · 3 User stories · 4 Safety rules
- **Part B — Architecture:** 5 Repository & stack · 6 AI service contract · 7 Necessary elements
- **Part C — Database:** 8 Who is in the DB · 9 Overview · 10 Hospital directory · 11 Cases, triage & supervision · 12 Case flow · 13 Lifecycles · 14 Prisma schema · 15 Seed data (Grand Tunis hospitals) · 16 Design notes
- **Part D — Implementation:** 17 Demo script · 18 MVP cut · 19 Local setup · 20 Auth · 21 AI integration & triage loop · 22 Clinician supervision · 23 Matching · 24 Referrals · 25 Reports · 26 Notifications (push only) · 27 Staying connected · 28 Hospital dashboard · 29 Arrival mode, tracking, outcome & export · 30 Patient apps · 31 Learning & metrics · 32 Platform admin · 33 Safety checklist · 34 Tasks · 35 Open questions

The diagrams are Mermaid. They render on GitHub, GitLab and in VS Code (with the "Markdown Preview Mermaid Support" extension).

---

# Part A — Product

## 1. Ownership: who builds which step

| Step (infographic) | Where it lives | Owner |
|---|---|---|
| 1 Patient message | `mobile/`, `patient-dashboard/` → `backend/cases` | me |
| 2 Preprocessing | `ai/preprocess.py`: language/script detection, Darija/Arabizi/French/English normalization, PII scrubbing | AI team |
| 3–4 Clinical NLP + patient state | `ai/interviewer.py` (LLM extracts facts; collects, never decides) + `ai/state.py` (`CaseState`) | AI team |
| 5 Validation & uncertainty | `ai/schemas.py` validation + `ai/fusion.py` uncertainty | AI team |
| 6 Follow-up questions | `ai/interviewer.py` generates the next question; the apps display it | AI team + me |
| 7 Rule-based safety engine | `ai/rules.py` + `ai/rules.yaml` → `sRule` + triggered rules | AI team (rules signed off by a clinician) |
| 8 Classifier | `ai/nlp_classifier.py`: XLM-R, emergency-risk vs no-risk → `pNLP` | AI team |
| 9 Decision policy | `ai/fusion.py` (`pFinal = σ(β0 + β1·pNLP + β2·sRule)`) + `ai/safety.py` (level + actions) | AI team |
| 10 Output & explanation | apps (`RiskBadge`, `RedFlagList`, `ContributionChart`) | me |
| 11 Facility matching | `backend/matching` | me |
| 12 Pre-arrival case | `ai/report.py` (LLM narrative) → `backend/reports` (versions, PDF, FHIR, links) | AI team + me |
| 13 Two-way handoff | `backend/dashboard`, `info-requests`, `hospital-dashboard` Board / Handoffs | me |
| 14 Pre-arrival monitoring | `backend/cases` updates, `jobs`, `notify`, `live` | me |
| 15 Arrival & outcome | `backend/referrals` + `hospital-dashboard` Arrival, `feedback/` API | me |
| 16 Feedback loop | `backend/learning` (events, metrics, export) → `ai/scripts/fit_fusion.py`, `train_classifier.py` | me + AI team |
| Supervision gates 1–4 | `backend/supervision` + `hospital-dashboard` CaseWorkspace (gates 1–2), Board (gate 3), Arrival (gate 4) | me |

**Boundary with the hospital's own systems:** the hospital dashboard tracks arrival, a coarse treatment status (in treatment / admitted / transferred / discharged) and the outcome, for the feedback loop. **Assigning a doctor, beds and the medical record stay in the hospital's own platform.**

---

## 2. Actors

| Actor | App | Main job |
|---|---|---|
| Patient | `mobile/` (Expo) and `patient-dashboard/` (web) | describe symptoms, follow guidance, go to the right hospital, answer the hospital's questions, see status and report |
| **Clinician** | `hospital-dashboard/` (CaseWorkspace, Metrics) | continuous oversight: watch live cases, correct the structured state, validate the risk, approve or override with a reason |
| **ED staff** | `hospital-dashboard/` (Board, Handoffs, Arrival, Availability) | decide on incoming patients, track arrival and treatment status, record outcomes, update availability by hand |
| **Hospital manager** | `hospital-dashboard/` (Admin, Metrics) | manage their own hospital: profile, departments, on-call, staff, notification channels, statistics |
| Platform admin | `backend/admin` (+ Prisma Studio) | onboard hospitals and their first manager, reference lists, system settings |
| Hospital IT system (optional) | `feedback/` API, FHIR webhook | receive reports, send outcomes |

---

## 3. User stories

Format: **ID — As a … I want … so that …** followed by acceptance criteria (AC). The infographic step is in brackets.

### Patient (`mobile/` and `patient-dashboard/`)

**P1 — Open and start immediately (no login).** As a patient in an emergency I want the app to work the moment I open it, so that I don't lose time with an account.
- AC: First launch silently creates an anonymous device identity (`POST /auth/anonymous`). **No login screen, no OTP.** The language follows the phone's settings, with a switcher (Darija, Arabic RTL, French, English). Consent is **one tap** ("Your answers are shared with clinicians and the hospital you go to") stored with its version; emergency instructions are shown even before that tap.

**P1b — Notification permission on first open.** As a patient I want to be asked once, right away, to allow notifications, so that the hospital can reach me later even if I close the app.
- AC: On the very first open, a short explanation screen ("We'll notify you when the hospital answers or asks you something") then the system prompt (iOS / Android 13+). **Refusing never blocks anything**: the chat starts anyway, and the Status screen shows a banner "Notifications off — turn on" that opens the settings. Granted → the device is registered for push (§26.2).

**P1c — Link a phone number later (optional).** As a patient I want to save my history or use another phone, at a calm moment, so that I keep my cases.
- AC: Offered after the case closes or from settings: phone + code. The anonymous cases are linked to the account. Never asked during triage.

**P2 — Describe symptoms [1].** As a patient I want to type my problem in my own words, including Arabizi and mixed French, so that I don't fill out a medical form.
- AC: Text only. A "thinking" state. Retry without losing the text.

**P3 — Answer follow-up questions [6].** As a patient I want only the questions that matter, in my language.
- AC: The interviewer's next question is shown with quick replies when provided. Optional vitals questions ("Do you have a thermometer?") accept "I don't know".

**P4 — Emergency escalation [7, 9].** As a patient at risk I want immediate instructions, so that I don't lose time.
- AC: When the decision level is **EMERGENCY** at any turn, the Emergency screen appears at once (call 190, first aid). The case is sent to the nearest capable ED and flagged for a clinician (gate 2). **The patient never waits** for a clinician or a hospital. It works with the backend down (hard-coded content).

**P5 — Understand my result [10].** As a patient I want my risk level and a plain explanation.
- AC: The level as color + text (Emergency / High / Low / Uncertain), the recommended action and the localized rationale. For **Uncertain**: "A clinician is reviewing your case" plus what to do meanwhile.

**P6a — Location permission and confirmation [11].** As a patient I want the app to find where I am and let me correct it, so that hospitals are ranked from the right place.
- AC: **Just before the hospital search** (not at app open), the app asks for location permission (foreground, "while using the app"), then shows a **map with a pin, an accuracy circle and the address** ("Near Bab Saadoun, Tunis · ±35 m") and two buttons: **Confirm** / **Adjust**.
- Adjust: drag the pin, search an address, or pick a neighborhood / delegation from a list. If the GPS accuracy is worse than **200 m**, the app says "Location not precise, please check" and opens Adjust by default.
- Permission refused or no GPS fix within 10 s → the same Adjust screen (search or pick), never a dead end.
- The confirmed point is saved on the case with its accuracy and source (GPS / adjusted / manual).
- **EMERGENCY does not wait for confirmation:** the case is sent to the nearest capable ED using the first GPS fix (or the last known position), and the Emergency screen shows "Sent to <hospital> based on your location · Wrong place? Change". Changing it re-matches.

**P6 — Get assigned a hospital automatically [11].** As a patient I want the system to send me to the right hospital, so that I don't have to judge which one can treat me.
- AC: **The patient never chooses.** When the case needs a hospital (EMERGENCY or HIGH), the backend assigns one as soon as the location is confirmed, from **location + urgency + live availability** (beds, doctors, scanner, on-call, wait). The Status screen shows the assigned hospital, **why it was chosen** ("Cardiology · 2 beds free · 4.2 km · ~9 min"), ETA and directions. LOW cases get no hospital (self-care advice). If the hospital refuses or doesn't answer, the system re-assigns automatically and tells the patient.

**P7 — Send my case and see the hospital's answer [12, 13].** As a patient I want to know the hospital is expecting me.
- AC: The status timeline reads *Sent → Accepted (+ note, arrival mode)* / *The hospital has a question* / *Rerouted to …* → *Arrived*. If the hospital sends an ambulance, I see "An ambulance is coming · ETA · stay where you are" with it on a map. Updates arrive live (SSE on the web, push on mobile).

**P8 — My report.** As a patient I want my report, a QR code and the PDF, so that reception can see my case in any case.

**P9 — Tell the hospital I feel worse [14].** As a patient on my way I want to tell the ED that I feel worse, so that they react.
- AC: "I feel worse" posts a highlighted message in the chat with the hospital (P18). The ED decides whether to raise the urgency (H17). The message is also checked by the AI rules: a critical red flag escalates automatically (Emergency screen + ED alert).

**P19 — Share my live location on the way.** As a patient going to the hospital on my own, I want to share my location with that hospital until I arrive, so that they know when I'll be there.
- AC: Asked at acceptance; a "Sharing location · Stop" bar is always visible; it works with the app in the background if I allow it (Android shows a notification); it stops automatically on arrival or cancellation (§29.2).

**P20 — See the ambulance coming (simulated).** As a patient for whom the hospital sends an ambulance, I want to see it on a map with an ETA, and be told to stay where I am.

**P18 — Chat directly with the ED [13, 14].** As a patient referred to a hospital I want to write to the ED staff and read their answers, so that I can explain changes and get instructions.
- AC: One chat thread per hospital, open from the moment my case is sent there. I see who answers ("La Rabta ED · Amira, nurse"). The hospital's questions appear as answerable bubbles. New messages arrive by push even with the app closed. A permanent notice says "The ED may take a few minutes to answer. If it gets worse, call 190." 

**P10 — Correct my location.** If my location was wrong, I can correct it while the case is not yet accepted; the system re-assigns from the new location (the old hospital sees "cancelled"). I can't pick a hospital myself.

**P11 — Arrived / close.** I can mark "I arrived" or "I didn't go". Cases auto-close after 24 h.

**P12 — History.** As a patient I want to see my past cases and their reports.
- AC: A list with date, level, hospital and outcome status; opens the report. The patient can delete a past case from their history (soft delete; the anonymized learning event is kept).

**P13 — Stay informed with the app closed.** Push to **all my devices** (phone and computer); critical events are repeated until opened (§26.3).

**P14 — Follow my case on another device.** The app shows my `/p/` link as a button and QR, with the **case reference code** (e.g. `HC-7K4P2Q`), so I can open my case on a computer and enable notifications there too.

**P15 — Act offline.** Cached report, QR and call buttons; an outbox for actions, sent once when back online (§27).

**P16 — Answer the hospital's question [13].** Critical push to all my devices; answer in the app, on the web or on the `/p/` page; shown live on the dashboard.

**P17 — Be told when I'm rerouted [13].** Critical push: the new hospital, directions and a new QR code.

### Clinician (`hospital-dashboard/` CaseWorkspace) — continuous supervision

**C1 — Supervision queue (gates 1–2).** As a clinician I want a live queue of cases that need a human: **EMERGENCY** (gate 2), **UNCERTAIN**, low confidence, or rules and model disagreeing (gate 1).
- AC: Sorted by level, then waiting time. A new item rings. Each item shows the level, `pFinal`, uncertainty, triggered rules and the reason it is in the queue.

**C2 — Live case view.** As a clinician I want the transcript, the structured state, the risk over time, the explanation (rule hits + feature contributions) and the draft report on one screen, updating live while the patient is still talking.

**C3 — Correct the patient state.** As a clinician I want to fix a wrong extraction ("the patient said *no* chest pain"), so that the risk is recomputed correctly.
- AC: The `StateEditor` saves a new state version (source = CLINICIAN), the backend re-runs the AI turn on the corrected state (no new patient message), and a new assessment appears. Both versions are kept.

**C4 — Validate or override the risk.** As a clinician I want to approve the AI's level or override it with a reason.
- AC: Approve = one click. Override = the new level + a required reason. It updates the case, re-matches if needed, notifies the patient and the hospital, and writes a review, an override, a learning event and an audit entry.

**C5 — Notes and draft report.** As a clinician I want to add notes and edit the draft report before it goes to the hospital (§25).

**C6 — Uncertain timeout.** If nobody reviews an UNCERTAIN case within the time limit (default 5 min), it is **treated as HIGH** and continues to matching. A clinician can still review it afterwards.

### ED staff (`hospital-dashboard/` Board, Handoffs, Arrival, Availability)

**H1 — Incoming board [13].** New referrals appear within 2 s with a sound, sorted by level then ETA, with the decision countdown.
**H2 — Read the case.** The report, red flags, risk and explanation, clinician review status, transcript and PDF.
**H3 — Accept** with an optional note to the patient and the **arrival mode**: *the patient comes on their own* or *we send an ambulance (simulated)* (§29.1). EMERGENCY pre-selects the ambulance.
**H4 — Request more info:** a structured question to the patient (yes/no, choice, text); the answer appears live.
**H5 — Deny (cannot receive)** with a reason; optional "unavailable for <specialty> until …"; automatic re-match.
**H6 — Reroute** to a capable hospital from the ranked list, with a reason.
**H7 — Updates and cancellations** show on the card (level raised, cancelled, arrived).
**H8 — Several hospitals:** a hospital switcher for staff with several memberships.
**H9 — Backup alerts:** a **push on the phones and computers of all ED staff and clinicians** of the hospital if a case waits without a decision.
**H9b — Enable notifications** on each of my devices (computer at the desk, my phone) and see/remove my devices.
**H10 — Handoffs inbox.** As ED staff I want a list of accepted patients on their way (ETA, unread messages, urgency raised), so that we prepare.

**H16 — Chat with the patient [13, 14].** As ED staff I want to chat directly with a patient sent to us (before and after acceptance), with quick replies, so that I understand their situation and guide them.
- AC: A thread per referral; messages in < 2 s both ways; unread badges; "I feel worse" and red-flag messages are highlighted with a sound; staff names are shown to the patient; read-only after reroute/completion.

**H18 — Follow the patient live on a map [14].** As ED staff I want to see where an accepted patient (or our simulated ambulance) is, with a live ETA, so that we know when they arrive.
- AC: The map on Handoffs shows the hospital, the patient/ambulance marker with its trail, the ETA and "updated X s ago". There is an overview map of all patients on their way. "Patient at the door" appears within 150 m. Shown only during the trip (§29.2).

**H19 — Export case data to our own software.** As ED staff or a manager I want to export a case (FHIR / PDF / CSV), or all cases of a period, so that I can load them into the app our hospital already uses.
- AC: Per-case export menu; bulk export (CSV, FHIR NDJSON, ZIP of PDFs) generated in the background with a 24 h link; every export audited (§29.7).

**H17 — Raise urgency ("raise awareness") [14].** As ED staff, when I notice something urgent in the chat, I want to raise the patient's level and send an instruction, so that the patient acts and my team prepares.
- AC: Only upward (e.g. HIGH → EMERGENCY). A reason is required. Optional instruction ("Call 190 now", "Don't drive", "Come to entrance B"). Effects: the patient gets a critical push; EMERGENCY opens their Emergency screen with the instruction; the hospital team gets a push; the row/card turns red; a new report version, an escalation record, an audit entry and a learning event are written.
**H11 — Update availability by hand:** department status, free beds, specialists on duty, estimated wait, equipment working/down.
**H12 — Confirm availability:** a reminder when it is stale; "Nothing changed ✓".
**H13 — Confirm arrival [15].** One click when the patient arrives (or the patient marks it); the arrival time is stored.
**H14 — Treatment status [15].** A coarse status: *in treatment · admitted · transferred · discharged · left without being seen*. No doctor or bed details.
**H15 — Record the outcome [15, gate 4].** Final level, disposition, diagnosis category and notes. This closes the referral and feeds the learning loop.

### Hospital manager (`hospital-dashboard/` Admin, Metrics)

**M1 — Profile & settings** (address, ED phone, coordinates, decision timeouts, alert delays, staleness threshold).
**M2 — Departments & equipment.**
**M3 — On-call schedule (garde).**
**M4 — Staff accounts:** create, deactivate, reset; roles ED staff / clinician / manager.
**M5 — Integrations & alerts:** backup-alert delay, who receives backup alerts (ED staff, clinicians, manager), optional FHIR webhook + test.
**M6 — Statistics:** cases received, decisions, refusal reasons, decision times, outcomes.

### Platform admin

**A1 — Onboard a hospital** and its first manager.
**A2 — Reference lists** (specialty and equipment codes).
**A3 — System settings** (uncertain timeout, re-match limits, model/rule versions in use).
**A4 — Global monitoring and dataset export** (§31).

---

## 4. Safety rules

1. **Emergency wins, at every turn.** An EMERGENCY decision shows the emergency instructions immediately and sends the case to the nearest capable ED. **Clinician review and hospital acceptance never block the patient.**
2. **Rules can only raise risk, never lower it.** A triggered critical rule forces EMERGENCY, whatever `pNLP` says (`ai/safety.py`).
3. **Uncertain is never treated as Low.** UNCERTAIN → ask follow-up questions + clinician review. With no review within the time limit, the case is handled as HIGH.
4. **ED staff can only raise urgency, never lower it** (H17). Lowering a level is a clinician override.
5. **A clinician override is always explicit,** with a reason, the author, the old and new level, and the model/rule versions. It is audited and becomes a learning event.
6. **Clinician state corrections create a new state version.** The AI's original output is never overwritten.
7. **No patient is left without a destination.** Refusals and timeouts re-match automatically. After 2 failed hospitals (1 for EMERGENCY), the patient is told to go to the nearest ED / call 190.
8. **Availability is human-entered and can be stale.** Stale data counts as unknown, never as available, and never moves an EMERGENCY patient further away.
9. **AI down = degraded mode:** the safe message + emergency number, and the case goes to the clinician queue. Never silence (§21.4).
10. **Permissions never block care.** Refusing notifications or location still allows triage, emergency instructions and a hospital choice (manual location). An emergency never waits for a permission prompt or a location confirmation.
11. **Vitals are optional and patient-reported unless a clinician enters them.** They are labeled with their source; the rules and classifier must work without them.
12. **The LLM never decides.** The interviewer only collects. The level comes from the rules + classifier + fusion + safety policy. The report narrative is generated from the structured data and can be edited by a clinician before it is sent.
13. **Location privacy:** live location is shared only with the referred hospital, only during the trip, can be stopped by the patient at any time, and is deleted 24 h after the case closes. The ambulance is **simulated** and always labeled as such.
14. **Privacy:** hospitals see a case only once it is referred to them; supervising clinicians see the cases in their scope (§20). Learning events are anonymized. Secure links are random, hashed and expiring.
15. **Everything needed to replay a decision is stored:** turn, state version, assessment, versions of the model, rules, fusion and prompts, reviews, overrides, referral decisions and outcome.

---

# Part B — Architecture

## 5. Repository & stack

### 5.1 Repository (final)

```
hackcure/
├── README.md                  # overview, setup, how to run the demo
├── docs/
│   ├── architecture.png       # Sahhanito architecture diagram
│   ├── contracts.md           # API contracts, case/referral status machines, SSE events
│   └── demo-script.md         # demo scenarios and scripted patient conversations
├── docker-compose.yml         # postgres, ai, backend, both dashboards with one command
├── .env.example               # DB URL, JWT secret, LLM key, AI service URL…
├── ai-stub/main.py            # canned /turn and /report with the same contract as ai/
├── ai/                        # FastAPI, stateless (owns no database)
│   ├── main.py                # POST /turn, POST /report, GET /health
│   ├── schemas.py             # request/response, CaseState, RiskAssessment, Decision
│   ├── preprocess.py          # language/script detection, normalization, PII scrubbing
│   ├── interviewer.py         # LLM interviewer: extracts facts, missing info, next question
│   ├── state.py               # structured clinical state
│   ├── nlp_classifier.py      # XLM-R emergency-risk / no-risk → pNLP + confidence
│   ├── rules.py, rules.yaml   # red flags → sRule + triggered rules
│   ├── fusion.py              # pFinal = σ(β0 + β1·pNLP + β2·sRule), contributions, uncertainty
│   ├── safety.py              # level (Emergency/High/Low/Uncertain) + actions
│   ├── report.py              # LLM structured clinical report + timeline
│   ├── prompts/, knowledge/, data/, models/, scripts/, tests/
├── backend/                   # Next.js (API only) + Prisma; structure in §5.3
│   ├── prisma/schema.prisma, prisma/seed.ts
│   ├── templates/             # report.html, patient.html
│   ├── src/app/api/           # route handlers (HTTP layer)
│   ├── src/server/            # domain logic: auth, ai, cases, supervision, matching, referrals,
│   │                          # dashboard, info-requests, chat, tracking, availability, hospital-admin,
│   │                          # reports, delivery, exports, notify, feedback, learning, audit, live
│   └── worker/                # scheduled jobs + ambulance simulator (separate process)
├── packages/shared/src/       # case-state.ts, assessment.ts, status.ts, events.ts
├── hospital-dashboard/        # React + Vite: ED staff, clinicians, managers
│   └── src/pages/             # Login, Board, CaseWorkspace, Handoffs, Arrival, Availability, Admin, Metrics
├── patient-dashboard/         # React + Vite: patients on the web
│   └── src/pages/             # Chat, Emergency, Status, InfoRequests, Report, History
└── mobile/                    # Expo: patients (text chat, push)
    └── src/screens/           # Chat, Status, InfoRequests, Report (+ Emergency)
```

### 5.2 Stack

| Layer | Choice | Why |
|---|---|---|
| AI service | **FastAPI** (Python), stateless | the AI team's language and tooling; no DB, so the backend owns all state |
| Backend | **Next.js (Route Handlers, API only) + PostgreSQL + Prisma** (TypeScript) | the team's choice; one TypeScript codebase for API + jobs; Prisma for typed DB access; self-hosted with `next start` (§5.3) |
| Shared types | **`packages/shared`** (TypeScript, npm workspace) | the backend and both dashboards use the same `CaseState`, `RiskAssessment`, statuses and event types, so they can't drift |
| Hospital dashboard | **React + Vite** | one web app, layout by role (ED / clinician / manager) |
| Patient dashboard | **React + Vite** | patients without the app; Arabic RTL + FR + EN |
| Mobile | **Expo** | push notifications, offline cache |
| Live updates | **SSE**: `/dashboard/stream` (staff), `/patient/stream` (patients) | one-way server → browser over plain HTTP, auto-reconnect; actions stay REST (§28.4) |
| Notifications | **push only**: Expo push (mobile) + **Web Push** with VAPID keys (`web-push`, service worker) for both dashboards on phones and computers | no email, no SMS (§26) |
| Jobs | **`worker/`** process (`node-cron`), same code as the API | timeouts, alerts, simulator, expiry, check-ins; no message broker. Events reach the API through Postgres `LISTEN/NOTIFY` |
| Validation | **Zod** | request bodies and query params, mirrored from `packages/shared` |
| Reports | AI `/report` (narrative) + backend templates → HTML / PDF / FHIR | §25 |
| Run | **Docker Compose** | one command for the whole system (§19) |

### 5.3 Backend on Next.js: how it is organized

The backend is a **Next.js app used as an API server only**: no pages, just Route Handlers under `app/api/`. The UIs are the two React + Vite apps and the Expo app. Prisma talks to PostgreSQL.

```
backend/
├── prisma/schema.prisma, prisma/seed.ts
├── templates/                 # report.html, patient.html (rendered for /r/:token, /p/:token, PDF)
├── src/
│   ├── app/api/               # HTTP layer only: one route.ts per endpoint, thin
│   │   ├── auth/…             # anonymous, staff/login, logout, me
│   │   ├── cases/[id]/…       # messages, location, facilities, referrals, close, sync, report
│   │   ├── chat/[referralId]/…
│   │   ├── dashboard/…        # referrals, handoffs, stream (SSE), tracking
│   │   ├── supervision/…  referrals/…  hospital/[fid]/…  departments/[id]/…
│   │   ├── tracking/…  exports/…  push/…  notifications/…  learning/…  admin/…
│   │   └── public/r/[token], public/p/[token]   # token pages (HTML) + PDF/FHIR
│   ├── server/                # business logic, one folder per domain (the old "modules")
│   │   ├── auth/ (session, guards, AccessService)  ai/ (AiClient)  cases/  supervision/
│   │   ├── matching/  referrals/  dashboard/  info-requests/  chat/  tracking/  availability/
│   │   ├── hospital-admin/  reports/  delivery/  exports/  notify/  feedback/  learning/  audit/
│   │   ├── live/              # event bus over Postgres LISTEN/NOTIFY (see below)
│   │   └── db.ts              # one PrismaClient instance
│   ├── lib/http.ts            # route() wrapper: auth, Zod validation, errors → JSON, idempotency
│   └── middleware.ts          # CORS for the two Vite origins, request id
└── worker/                    # separate Node process: scheduled jobs + ambulance simulator
    └── index.ts
```

**How the backend patterns map to Next.js:**

| Concern | In this backend |
|---|---|
| Endpoint | `src/app/api/.../route.ts` exporting `GET` / `POST` / `PUT` / `PATCH` / `DELETE`; set `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'` |
| Business logic | plain TypeScript functions/classes in `src/server/<domain>/`; route handlers only parse, check access, call the service, return JSON |
| Validation | **Zod** schemas (the same shapes as `packages/shared`) in the `route()` wrapper |
| Auth & roles | `route({ auth: 'patient' \| 'staff', facilityRole?: [...] }, handler)`: reads the Bearer token (patients) or the httpOnly cookie (staff), checks the membership for `:fid`, then calls the handler with `ctx.user` |
| Errors | `throw new HttpError(409, 'ALREADY_HANDLED', '…')` → the wrapper returns `{ code, message }` with the status |
| Idempotency | the wrapper reads `Idempotency-Key`, returns the stored response from `ClientRequest` if seen |
| Scheduled jobs | **`worker/`**, a separate long-running process (`node-cron` or `setInterval`) importing the same `src/server/*` code: decision timeouts, backup alerts, uncertain timeout, escalation, stale availability, tracking stale/purge, ambulance simulator, exports, learning metrics, AI health |
| Live events (SSE) | Route Handler returning a `ReadableStream` (`text/event-stream`), see §28.4 |
| Event bus | **Postgres `LISTEN/NOTIFY`** (channel `live`), because events come from **two processes** (web + worker): `live.emit()` runs `NOTIFY`; every web process `LISTEN`s and pushes to its open SSE connections |
| Files (PDF, exports) | generated on the server; exports written to a local volume (demo) or object storage; served through a signed route |

**Constraints that matter:**
- **Self-host it with `next start` (Docker), not on serverless.** SSE streams and the worker need long-running Node processes. Serverless functions time out and can't hold open connections.
- **CORS + cookies:** the dashboards run on other origins (`:5173`, `:5174`). `middleware.ts` must answer preflight requests and allow `credentials` for exactly those origins. Staff cookies are `SameSite=Lax` and only work if the dashboard and API share the same site (same domain or `localhost`). Otherwise use a reverse proxy (or the Vite dev proxy) so `/api` is same-origin. **Recommended: serve everything behind one domain with a proxy (`/api` → Next.js).**
- **One `PrismaClient`** per process (`src/server/db.ts` with the global singleton pattern for dev hot-reload).
- The worker and the web process share code through imports from `src/server`. Run the worker with `tsx worker/index.ts` (dev) or build it with `tsup` (prod).

**Starting code for `ai/` (adopted 2026-10-10):** the open-source **central-park / Triage Park** project (MIT) — its LLM provider, adaptive interview, red-flag gate with negation guard, escalate-only checker and handoff prompt are reused; IRIS and FHIR record reads are removed; red flags are extended to Darija/Arabizi/French/Arabic; XLM-R + fusion stay as designed. Details: `docs/central-park-reuse.md`.

**`ai-stub/` vs `ai/`:** both expose the same contract. The backend points `AI_SERVICE_URL` at the stub until the real service is ready, so my part is never blocked by the AI team.

---

## 6. AI service contract (`ai/` ↔ `backend/`)

The single source of truth for these shapes is `ai/schemas.py` (Pydantic) mirrored in `packages/shared/src/case-state.ts` and `assessment.ts`. Generate the TypeScript from FastAPI's OpenAPI to keep them in sync: `npx openapi-typescript http://ai:8000/openapi.json -o packages/shared/src/ai.gen.ts`. The full contracts also live in `docs/contracts.md`.

### 6.1 Levels and actions

| Level | Meaning | Typical actions |
|---|---|---|
| `EMERGENCY` (Emergency/Critical) | life-threatening now | `CALL_EMERGENCY`, `REFER_NEAREST_ED`, `CLINICIAN_REVIEW` |
| `HIGH` | needs ED / urgent assessment today | `REFER_ED`, `ASK_FOLLOWUP` (optional) |
| `LOW` | can wait / self-care / routine visit | `SELF_CARE`, `SCHEDULE_VISIT` |
| `UNCERTAIN` | not enough information or the signals disagree | `ASK_FOLLOWUP`, `CLINICIAN_REVIEW` |

### 6.2 `POST /turn`

Called by `backend/ai` for every patient message, and again (without a new message) after a clinician corrects the state.

```json
{
  "case_id": "uuid",
  "turn_index": 3,
  "message": "n7ess rou7i mkhanou9 w sderi yo9jani",
  "history": [{ "role": "patient", "text": "…", "at": "…" }, { "role": "assistant", "text": "…", "at": "…" }],
  "state": { "...": "the latest CaseState (AI or clinician-corrected), or null" },
  "state_source": "AI",
  "patient_context": { "age": 54, "sex": "M", "pregnant": null, "language_pref": "darija" }
}
```

Response:

```json
{
  "language": "darija", "script": "arabizi",
  "normalized_text": "…",
  "state": {
    "symptoms": [{ "code": "chest_pain", "present": true, "onset": "20 min", "severity": "severe", "evidence": "sderi yo9jani" },
                 { "code": "dyspnea", "present": true, "evidence": "n7ess rou7i mkhanou9" },
                 { "code": "fever", "present": false, "evidence": "ma 3andich skhana" }],
    "history": ["hypertension"], "medications": ["Kardegic"],
    "vitals": { "temperature_c": null, "spo2": null, "heart_rate": null, "bp": null, "source": "patient" },
    "uncertainties": ["onset time approximate"],
    "metadata": { "pregnant": null, "age": 54 }
  },
  "missing_info": ["duration", "radiation of pain"],
  "next_question": { "text": "Depuis quand ?", "text_localized": "men waktech?", "quick_replies": ["< 1h", "1–24h", "> 1 jour"] },
  "assessment": {
    "p_nlp": 0.81, "nlp_confidence": 0.74,
    "s_rule": 1.0, "triggered_rules": [{ "id": "R-CARD-01", "name": "chest pain + dyspnea", "severity": "critical" }],
    "p_final": 0.97,
    "uncertainty": "LOW",
    "contributions": { "bias": -2.1, "nlp": 2.4, "rules": 3.6 }
  },
  "decision": {
    "level": "EMERGENCY",
    "actions": ["CALL_EMERGENCY", "REFER_NEAREST_ED", "CLINICIAN_REVIEW"],
    "suggested_specialty": "CARDIO", "required_equipment": ["CATH_LAB"],
    "rationale": "Chest pain with breathing difficulty (critical rule).",
    "rationale_localized": "…"
  },
  "versions": { "classifier": "xlmr-0.3", "rules": "2026-10-01", "fusion": "f-0.2", "prompts": "p-0.4" }
}
```

Rules of the contract:
- `mode`: `"interview"` (default, triage chat) or `"monitor"` (a patient message in the hospital chat: run preprocessing + rules + classifier on it, return the assessment, **never** a `next_question`).
- `next_question` is null when the interviewer has enough information **or** when the level is EMERGENCY (don't keep asking someone who must call 190).
- `vitals` are optional and carry their `source` (`patient` / `clinician`).
- `uncertainty` is `LOW | MEDIUM | HIGH`; HIGH implies level `UNCERTAIN` unless a critical rule fired.
- Timeout **15 s** (the LLM interviewer is slower than a classifier). On timeout or 5xx, the backend retries once, then switches to degraded mode (§21.4).

### 6.3 `POST /report`

Called by `backend/reports` when a referral is created, when the level changes, and on demand from the clinician workspace.

```json
{
  "case_id": "uuid",
  "state": { "...": "latest CaseState" },
  "assessment": { "...": "latest RiskAssessment" },
  "decision": { "...": "latest Decision" },
  "transcript": [{ "role": "patient", "text": "…", "at": "…" }],
  "review": { "status": "OVERRIDDEN", "by": "Dr X", "from": "HIGH", "to": "EMERGENCY", "reason": "…" },
  "referral": { "facility": "Hôpital La Rabta", "eta_minutes": 9 },
  "output_language": "fr"
}
```

Response: a **structured** report (not free HTML), which the backend stores and renders:

```json
{
  "summary": "Homme 54 ans, douleur thoracique + dyspnée depuis ~20 min…",
  "chief_complaint": "Douleur thoracique",
  "timeline": [{ "at": "20:31", "event": "Début de la douleur (rapporté)" }, { "at": "20:42", "event": "Dyspnée signalée" }],
  "positives": ["…"], "negatives": ["Pas de fièvre"], "history": ["HTA"], "medications": ["Kardegic"],
  "vitals": { "...": "with source" },
  "red_flags": ["chest pain + dyspnea"],
  "risk": { "level": "EMERGENCY", "p_final": 0.97, "uncertainty": "LOW" },
  "recommended_actions": ["…"], "open_questions": ["…"],
  "disclaimer": "AI-assisted triage. Clinical decisions remain with the receiving team.",
  "versions": { "report_prompt": "r-0.2", "llm": "…" }
}
```

The backend **never** sends the LLM text to a hospital without its structured data: the report page always shows the risk, red flags and transcript **from the stored assessment**, next to the narrative.

### 6.4 `GET /health`

Returns `{ ok, versions }`. The backend polls it every 30 s and shows "AI degraded" in the dashboards when it fails.

---

## 7. Necessary elements

### 7.1 Patient apps

| `patient-dashboard/` page | `mobile/` screen | Content |
|---|---|---|
| (first open) | Welcome | anonymous start, language, one-tap consent, **notification permission** (P1–P1b) |
| `Location.tsx` | Location | permission → map with pin, accuracy circle, address → **Confirm / Adjust** (drag, search, pick a neighborhood) before the hospital search (P6a) |
| `Chat.tsx` | Chat | the triage conversation (`ChatBubble`, `ChatInput`), quick replies, typing state |
| `Emergency.tsx` | Emergency | immediate instructions, call 190, first aid, the hospital the case was sent to; interrupts everything |
| `Status.tsx` | Status | level + explanation, hospital, ETA, directions, `StatusTimeline`, reference code, QR |
| `InfoRequests.tsx` | InfoRequests | the hospital's questions and answer controls |
| `Report.tsx` | Report | the patient-facing report (`templates/patient.html` content) + PDF |
| `History.tsx` | (History on the home screen) | past cases (P12) |

Both use `i18n/` with **Arabic (RTL), French, English**, and Darija for UI strings where useful. Live updates: the web app uses SSE (`/patient/stream`); mobile uses push in the background and SSE or polling in the foreground.

### 7.2 Hospital dashboard (`hospital-dashboard/`, layout by role)

| Page | Roles | Content |
|---|---|---|
| `Login.tsx` | all | staff login (cookie session) |
| `Board.tsx` | ED, clinician (read) | incoming referrals, decision countdowns, Accept / Request info / Cannot receive / Reroute (§28) |
| `CaseWorkspace.tsx` | clinician (full), ED (read) | live case: `TranscriptView`, `StateEditor`, risk over time, `RiskBadge`, `UncertaintyBar`, `RedFlagList`, `ContributionChart`, `ReportViewer` (draft), approve/override panel (§22) |
| `Handoffs.tsx` | ED, clinician | accepted patients on their way + **live map** (patient or simulated ambulance, ETA) + **direct chat** + **Raise urgency** (H10, H16–H18) |
| `Arrival.tsx` | ED | confirm arrival, treatment status, outcome and notes; per-case **export** (§29) |
| `Availability.tsx` | ED, manager | beds, specialists, wait, equipment, confirm (§28.6) |
| `Admin.tsx` | manager | profile, departments, on-call, staff, channels, stats, **Exports** (bulk) (§28.7, §29.7) |
| `Metrics.tsx` | clinician, manager | model performance, override rate, calibration (§31) |

The supervision queue is a tab of `CaseWorkspace` (or of `Board` for clinicians).

### 7.3 API endpoints (`backend/src`)

```
# auth/
POST /auth/anonymous              POST /auth/patient/link-phone (optional, later)
POST /auth/staff/login   POST /auth/logout   GET/PATCH /me

# cases/ (patient)
POST /cases                        → create case + first message → triage loop
POST /cases/:id/messages           → triage loop (§21)
GET  /cases  GET /cases/:id  GET /cases/:id/sync  DELETE /cases/:id (hide from history)
PUT  /cases/:id/location {lat, lng, accuracyM, source, address?} → confirmed location (re-matches if referred)
(no hospital-choice endpoints: setting the location triggers the automatic assignment; the assigned hospital
 arrives as a `referral.status` event and in GET /cases/:id)
POST /cases/:id/close {arrived}

# chat/ (patient ↔ ED, one thread per referral)
GET  /chat/:referralId/messages?after   POST /chat/:referralId/messages {text, kind}   POST /chat/:referralId/read
POST /dashboard/referrals/:id/raise-urgency {level, reason, instruction?, alertTeam}
POST /info-requests/:id/answer     POST /notifications/:id/opened

# notify/ (all users)
GET  /push/vapid-public-key   POST /push/subscriptions   GET /push/subscriptions   DELETE /push/subscriptions/:id
POST /patient/stream-ticket        GET /patient/stream?ticket=…   (SSE)

# supervision/ (clinician)
GET  /supervision/queue            GET /supervision/cases/:id      (live view)
PUT  /supervision/cases/:id/state {state, note}     → new state version + re-run /turn
POST /supervision/cases/:id/approve {assessmentId, note?}
POST /supervision/cases/:id/override {assessmentId, level, reason}
POST /supervision/cases/:id/notes {text}
PUT  /supervision/cases/:id/report {report}          → clinician-edited report version

# dashboard/ (ED)
GET  /dashboard/referrals?facilityId=&status=&ref=   GET /dashboard/referrals/:id
POST /dashboard/referrals/:id/accept | request-info | reject | reroute
GET  /dashboard/referrals/:id/reroute-options
GET  /dashboard/handoffs?facilityId=
GET  /dashboard/stream?facilityId=                   (SSE)

# referrals/ (arrival, treatment, outcome)
POST /referrals/:id/arrived   PUT /referrals/:id/treatment-status {status}   POST /referrals/:id/outcome {…}
(accept body: { note?, arrivalMode: 'SELF' | 'AMBULANCE' })

# tracking/ (live location + simulated ambulance)
POST /tracking/:referralId/positions [{lat,lng,accuracyM,speed?,recordedAt}]   (patient)
POST /tracking/:referralId/stop                                                 (patient)
GET  /tracking/:referralId        → latest position, trail, ETA, ambulance status (hospital, patient)
GET  /dashboard/tracking?facilityId → all patients on their way (overview map)

# exports/
GET  /exports/referrals/:id?format=fhir|pdf|csv   POST /exports {facilityId, from, to, status?, level?, format}
GET  /exports/:id   GET /exports?facilityId

# availability/, hospital-admin/  (see §28.6, §28.7)
# reports/, public/
GET /cases/:id/report  GET /cases/:id/report.pdf   GET /r/:token  GET /r/:token/pdf  GET /r/:token/fhir
GET /p/:token  POST /p/:token/update|arrived|not-going|answer/:infoRequestId

# feedback/, learning/, admin/
POST /api/hospital-feedback (API key)
GET  /learning/metrics?from&to&facilityId   GET /learning/export?format=jsonl   (admin / AI team)
/admin/facilities, /admin/specialties, /admin/equipment, /admin/settings, /admin/monitor, /admin/audit
```

All patient POSTs accept `Idempotency-Key` (§27.6). Every state-changing staff action uses a conditional update (409 if already handled, §24).

### 7.4 SSE events (`packages/shared/src/events.ts`)

| Stream | Events |
|---|---|
| `/dashboard/stream` (ED, per hospital) | `referral.new`, `referral.status`, `referral.updated`, `info.answered`, `referral.arrived`, `chat.message`, `chat.read`, `case.escalated`, `tracking.position`, `tracking.stale`, `ambulance.status`, `export.ready`, `availability.updated`, `availability.stale` |
| `/dashboard/stream` (clinicians) | `supervision.queued`, `case.turn` (new message + assessment while the patient talks), `case.state_corrected`, `case.reviewed` |
| `/patient/stream` (one patient) | `case.assessment`, `case.question`, `referral.status`, `referral.rerouted`, `info.request`, `chat.message`, `case.escalated`, `ambulance.status`, `tracking.position` (ambulance), `report.ready` |

### 7.5 Background jobs (`backend/src/jobs`)

- `decision-timeouts` (15 s) · `backup-alerts` (30 s) · `deliver-reports` (30 s) · `close-stale-cases` (hourly) · `expire-unavailability` (1 min) · `stale-availability` (10 min)
- `uncertain-timeout` (30 s): UNCERTAIN cases not reviewed within the limit → handled as HIGH (C6)
- `ai-health` (30 s): polls `ai /health`, toggles degraded mode
- `push-receipts` (15 min) · `notify-escalation` (1 min, re-send critical pushes / widen staff audience, §26.3) · `patient-checkins` (5 min): §27
- `learning-metrics` (hourly): recomputes the metrics cache (§31)
- `ambulance-simulator` (2–3 s): moves simulated ambulances along their route, emits positions and statuses (§29.1)
- `tracking-stale` (1 min): no position for 2 min during a trip → `tracking.stale`; `tracking-purge` (hourly): deletes positions 24 h after close
- `exports` (on demand): builds bulk export files, deletes them after 24 h (§29.7)

### 7.6 Notifications

**Push only**, to every device of the person (phone and computer): Expo push for the mobile app, Web Push for both dashboards. Critical events are repeated until opened. Local reminders on the phone. No email, no SMS. See §26–§27.

---

# Part C — Database

## 8. Who is in the database

| Actor | In our DB | Notes |
|---|---|---|
| Patient | `USER` (role PATIENT) | phone login; optional profile |
| ED staff / clinician / manager | `USER` (role STAFF) + `STAFF_MEMBERSHIP` per hospital with `facilityRole` = `ED_STAFF`, `CLINICIAN` or `MANAGER` | one account, several hospitals possible |
| Network clinician (supervision pool) | `STAFF_MEMBERSHIP.supervisesNetwork = true` | sees the supervision queue for **unreferred** cases too (§20) |
| Platform admin | `USER` (role ADMIN) | onboarding, settings |
| Hospital | `FACILITY` + departments, equipment, on-call, channels, unavailability | managed by its own manager |
| AI service | **no table, stateless** | its outputs are stored by the backend (`TURN`, `CASE_STATE`, `RISK_ASSESSMENT`, `REPORT`) |

---

## 9. Overview: tables and relationships

```mermaid
erDiagram
    FACILITY ||--o{ DEPARTMENT : "has"
    SPECIALTY ||--o{ DEPARTMENT : "type of"
    DEPARTMENT ||--o{ CAPACITY_SNAPSHOT : "availability history"
    FACILITY ||--o{ FACILITY_EQUIPMENT : "owns"
    FACILITY ||--o{ ON_CALL_SHIFT : "on duty"
    FACILITY ||--o{ DELIVERY_CHANNEL : "notification channels"
    FACILITY ||--o{ FACILITY_UNAVAILABILITY : "temporary blocks"
    USER ||--o{ STAFF_MEMBERSHIP : "works at"
    FACILITY ||--o{ STAFF_MEMBERSHIP : "employs"

    USER ||--o{ CASE : "patient"
    CASE ||--o{ TURN : "conversation"
    CASE ||--o{ CASE_STATE : "versioned state"
    CASE ||--o{ RISK_ASSESSMENT : "risk over time"
    TURN |o--o| RISK_ASSESSMENT : "produced"
    CASE_STATE ||--o{ RISK_ASSESSMENT : "assessed from"
    CASE ||--o{ REVIEW : "clinician reviews"
    REVIEW |o--o| OVERRIDE : "if overridden"
    CASE ||--o{ CLINICAL_NOTE : "notes"
    CASE ||--o{ REFERRAL : "sent to hospitals"
    FACILITY ||--o{ REFERRAL : "receives"
    REFERRAL |o--o| REFERRAL : "re-match chain"
    REFERRAL ||--o{ INFO_REQUEST : "hospital asks"
    REFERRAL ||--o{ CHAT_MESSAGE : "patient ↔ ED chat"
    REFERRAL ||--o{ TRACKING_POINT : "live positions"
    REFERRAL ||--o| AMBULANCE_DISPATCH : "simulated ambulance"
    FACILITY ||--o{ EXPORT_JOB : "data exports"
    CASE ||--o{ ESCALATION : "urgency raised"
    REFERRAL ||--o| OUTCOME : "result"
    CASE ||--o{ REPORT : "versions"
    REPORT ||--o{ REPORT_DELIVERY : "sent as"
    CASE ||--o{ NOTIFICATION : "push log"
    USER ||--o{ PUSH_SUBSCRIPTION : "devices (phone, computer)"
    CASE ||--o{ LEARNING_EVENT : "anonymized copy"
    USER ||--o{ CLIENT_REQUEST : "idempotent actions"
    USER ||..o{ AUDIT_LOG : "actor"
```

Legend: a solid line is a real foreign key, a dotted line a logical reference. `||` means exactly one, `|o` zero or one, and `o{` zero or many.

---

## 10. Hospital directory

This data is maintained by our team (seed + admin console). The hospitals don't log in.

```mermaid
erDiagram
    FACILITY {
        uuid id PK
        string name "Hôpital Charles Nicolle"
        string shortName "CHN"
        enum type "CHU | REGIONAL | SPECIALIZED_INSTITUTE | MILITARY | PRIVATE_CLINIC"
        enum governorate "TUNIS | ARIANA | BEN_AROUS | MANOUBA"
        string city
        string address
        float lat
        float lng
        boolean hasGeneralEd
        string edPhone "shown to the patient"
        boolean isActive "in the network"
        int decisionTimeoutEmergencySec "default 180"
        int decisionTimeoutHighSec "default 600"
        int alertDelaySec "backup alert after, default 120"
        int availabilityStaleAfterMin "default 240"
        datetime availabilityConfirmedAt
    }

    SPECIALTY {
        string code PK "CARDIO, NEURO, PEDIA, TRAUMA, OPHTA, OBGYN, BURNS..."
        string nameFr
        string nameAr
    }

    DEPARTMENT {
        uuid id PK
        uuid facilityId FK
        string specialtyCode FK "unique with facilityId"
        boolean hasEmergency "takes emergency arrivals"
        string notes "e.g. adults only"
        enum status "AVAILABLE | LIMITED | FULL | CLOSED (manual)"
        int bedsAvailable "manual"
        int specialistsOnDuty "manual"
        int estimatedWaitMin "manual"
        datetime statusUpdatedAt
        uuid statusUpdatedById "staff, logical ref"
    }

    CAPACITY_SNAPSHOT {
        uuid id PK
        uuid departmentId FK
        enum status
        int bedsAvailable
        int specialistsOnDuty
        uuid updatedById
        boolean confirmOnly "Nothing changed"
        datetime takenAt
    }

    EQUIPMENT {
        string code PK "CT, MRI, CATH_LAB, ICU, NICU, DIALYSIS..."
        string nameFr
        string nameAr
    }

    FACILITY_EQUIPMENT {
        uuid facilityId PK, FK
        string equipmentCode PK, FK
        boolean operational "working / down (manual)"
        datetime updatedAt
        uuid updatedById
    }

    ON_CALL_SHIFT {
        uuid id PK
        string specialtyCode FK
        uuid facilityId FK
        datetime startsAt
        datetime endsAt "indexed with specialtyCode"
    }

    DELIVERY_CHANNEL {
        uuid id PK
        uuid facilityId FK
        enum type "WEBHOOK_FHIR"
        string target "webhook URL"
        string secret "HMAC key for webhooks"
        int priority "1 = try first"
        boolean active
    }

    FACILITY_UNAVAILABILITY {
        uuid id PK
        uuid facilityId FK
        string specialtyCode FK "null = whole ED"
        string reason "No beds, Specialist unavailable..."
        datetime until
        uuid createdById "logical ref to USER (staff)"
        datetime createdAt
    }

    FACILITY ||--o{ DEPARTMENT : "facilityId"
    SPECIALTY ||--o{ DEPARTMENT : "specialtyCode"
    FACILITY ||--o{ FACILITY_EQUIPMENT : "facilityId"
    EQUIPMENT ||--o{ FACILITY_EQUIPMENT : "equipmentCode"
    FACILITY ||--o{ ON_CALL_SHIFT : "facilityId"
    SPECIALTY ||--o{ ON_CALL_SHIFT : "specialtyCode"
    FACILITY ||--o{ DELIVERY_CHANNEL : "facilityId"
    FACILITY ||--o{ FACILITY_UNAVAILABILITY : "facilityId"
    DEPARTMENT ||--o{ CAPACITY_SNAPSHOT : "departmentId"
    SPECIALTY |o--o{ FACILITY_UNAVAILABILITY : "specialtyCode"
```

---

## 11. Cases, triage & supervision

```mermaid
erDiagram
    USER {
        uuid id PK
        enum role "PATIENT | STAFF | ADMIN"
        string phone UK "patients"
        string email UK "staff"
        string passwordHash
        string name
        string language "darija | ar | fr | en"
        int birthYear
        string sex
        boolean pregnant
        string consentVersion
        datetime consentAt
        boolean active
        boolean mustChangePassword
    }

    STAFF_MEMBERSHIP {
        uuid id PK
        uuid userId FK
        uuid facilityId FK
        enum facilityRole "ED_STAFF | CLINICIAN | MANAGER"
        boolean supervisesNetwork "clinician pool"
        boolean active
    }

    CASE {
        uuid id PK
        string referenceCode UK "HC-7K4P2Q"
        uuid patientId FK
        enum status "TRIAGING | EMERGENCY | UNDER_REVIEW | RESULT_READY | REFERRED | CLOSED"
        string language
        enum currentLevel "EMERGENCY | HIGH | LOW | UNCERTAIN"
        uuid currentAssessmentId
        enum reviewStatus "NONE | QUEUED | APPROVED | OVERRIDDEN"
        datetime reviewDueAt "uncertain timeout"
        boolean degraded "AI was unavailable"
        float lat
        float lng
        int locationAccuracyM
        enum locationSource "GPS | ADJUSTED | MANUAL | LAST_KNOWN"
        string locationAddress
        datetime locationConfirmedAt
        string patientTokenHash
        datetime lastPatientContactAt
        boolean hiddenByPatient
        datetime createdAt
        datetime closedAt
    }

    TURN {
        uuid id PK
        uuid caseId FK
        int index
        enum role "PATIENT | ASSISTANT | SYSTEM | CLINICIAN | HOSPITAL"
        text text
        text normalizedText
        string language
        string script
        string clientRequestId UK
        int aiLatencyMs
        datetime createdAt
    }

    CASE_STATE {
        uuid id PK
        uuid caseId FK
        int version
        json data "CaseState"
        enum source "AI | CLINICIAN"
        uuid turnId FK
        uuid createdById "clinician"
        json missingInfo
        datetime createdAt
    }

    RISK_ASSESSMENT {
        uuid id PK
        uuid caseId FK
        uuid stateId FK
        uuid turnId FK
        float pNlp
        float nlpConfidence
        float sRule
        json triggeredRules
        float pFinal
        enum level
        enum uncertainty "LOW | MEDIUM | HIGH"
        json contributions
        json actions
        string suggestedSpecialty
        string_list requiredEquipment
        text rationale
        json versions "classifier, rules, fusion, prompts"
        datetime createdAt
    }

    REVIEW {
        uuid id PK
        uuid caseId FK
        uuid assessmentId FK
        int gate "1 low confidence, 2 emergency, 3 handoff, 4 outcome"
        enum decision "APPROVED | OVERRIDDEN | STATE_CORRECTED"
        uuid reviewerId
        text note
        datetime createdAt
    }

    OVERRIDE {
        uuid id PK
        uuid reviewId FK
        uuid caseId FK
        enum fromLevel
        enum toLevel
        text reason
        datetime createdAt
    }

    CLINICAL_NOTE {
        uuid id PK
        uuid caseId FK
        uuid authorId
        text text
        datetime createdAt
    }

    REFERRAL {
        uuid id PK
        uuid caseId FK
        uuid facilityId FK
        uuid departmentId FK
        uuid previousReferralId FK
        enum status "SENT | INFO_REQUESTED | ACCEPTED | REJECTED | REROUTED | TIMED_OUT | CANCELLED | ARRIVED | COMPLETED"
        enum treatmentStatus "IN_TREATMENT | ADMITTED | TRANSFERRED | DISCHARGED | LEFT_WITHOUT_BEING_SEEN"
        enum origin "AUTO_ASSIGN | AUTO_EMERGENCY | AUTO_REMATCH | HOSPITAL_REROUTE | LOCATION_CORRECTED | CLINICIAN_OVERRIDE"
        json scoreBreakdown
        float distanceKm
        int etaMinutes
        datetime decisionDueAt
        uuid decidedById
        string decisionReason
        string acceptNote
        datetime arrivedAt
        datetime completedAt
        enum arrivalMode "SELF | AMBULANCE"
        boolean trackingShared
        datetime createdAt
    }

    TRACKING_POINT {
        uuid id PK
        uuid referralId FK
        enum source "PATIENT | AMBULANCE_SIM"
        float lat
        float lng
        int accuracyM
        datetime recordedAt
    }

    AMBULANCE_DISPATCH {
        uuid id PK
        uuid referralId FK
        string unitName
        boolean simulated
        enum status "DISPATCHED | EN_ROUTE_TO_PATIENT | AT_PATIENT | TRANSPORTING | ARRIVED"
        json route
        datetime etaAt
    }

    EXPORT_JOB {
        uuid id PK
        uuid facilityId
        enum format "CSV | FHIR_NDJSON | PDF_ZIP"
        enum status
        datetime expiresAt
    }

    CHAT_MESSAGE {
        uuid id PK
        uuid referralId FK
        enum sender "PATIENT | STAFF | SYSTEM"
        uuid senderId
        enum kind "TEXT | QUESTION | ANSWER | INSTRUCTION | WORSE | SYSTEM | RED_FLAG"
        text text
        text translation
        uuid infoRequestId
        string clientRequestId UK
        datetime readAt
        datetime createdAt
    }

    ESCALATION {
        uuid id PK
        uuid caseId FK
        uuid referralId FK
        enum fromLevel
        enum toLevel
        text reason
        text instruction
        uuid byId "staff, null = automatic red flag"
        boolean automatic
        datetime createdAt
    }

    INFO_REQUEST {
        uuid id PK
        uuid referralId FK
        text question
        string questionLocalized
        enum answerType "YES_NO | CHOICE | TEXT"
        text answer
        datetime answeredAt
    }

    OUTCOME {
        uuid referralId PK, FK
        enum finalLevel
        enum disposition "DISCHARGED | ADMITTED | ICU | TRANSFERRED | DECEASED | LEFT"
        string diagnosisCategory
        text diagnosisText
        text notes
        enum source "DASHBOARD | API"
        uuid recordedById
        datetime recordedAt
    }

    REPORT {
        uuid id PK
        uuid caseId FK
        int version
        enum kind "PRE_ARRIVAL | UPDATE | CANCELLATION | PATIENT"
        enum status "DRAFT | FINAL"
        json data "structured report from AI /report"
        enum author "AI | CLINICIAN"
        uuid editedById
        string accessTokenHash UK
        datetime accessExpiresAt
        datetime createdAt
    }

    LEARNING_EVENT {
        uuid id PK
        string caseHash "no direct link back"
        json stateSnapshot "anonymized"
        string language
        string script
        float pNlp
        float sRule
        float pFinal
        enum aiLevel
        enum finalLevel "after clinician"
        boolean overridden
        enum outcomeLevel
        enum disposition
        json versions
        datetime createdAt
    }

    USER ||--o{ STAFF_MEMBERSHIP : "userId"
    USER ||--o{ CASE : "patientId"
    CASE ||--o{ TURN : "caseId"
    CASE ||--o{ CASE_STATE : "caseId"
    CASE ||--o{ RISK_ASSESSMENT : "caseId"
    CASE_STATE ||--o{ RISK_ASSESSMENT : "stateId"
    CASE ||--o{ REVIEW : "caseId"
    REVIEW |o--o| OVERRIDE : "reviewId"
    CASE ||--o{ CLINICAL_NOTE : "caseId"
    CASE ||--o{ REFERRAL : "caseId"
    REFERRAL |o--o| REFERRAL : "previousReferralId"
    REFERRAL ||--o{ INFO_REQUEST : "referralId"
    REFERRAL ||--o{ CHAT_MESSAGE : "referralId"
    REFERRAL ||--o{ TRACKING_POINT : "referralId"
    REFERRAL ||--o| AMBULANCE_DISPATCH : "referralId"
    CASE ||--o{ ESCALATION : "caseId"
    REFERRAL ||--o| OUTCOME : "referralId"
    CASE ||--o{ REPORT : "caseId"
```

Not drawn, unchanged from earlier: `REPORT_DELIVERY` (report × channel × attempts), `PUSH_SUBSCRIPTION` (a user's phones and computers), `NOTIFICATION` (push log, opened, escalation), `CLIENT_REQUEST` (idempotency keys) and `AUDIT_LOG` (append-only, with `versions`). They are in the Prisma schema (§14).

---

## 12. How a case flows (patient → AI → clinician → hospital)

```mermaid
sequenceDiagram
    autonumber
    actor P as Patient (app / web)
    participant B as Backend
    participant AI as AI service
    participant C as Clinician (CaseWorkspace)
    participant H as ED (Board)
    P->>B: message
    B->>AI: POST /turn (history, state)
    AI-->>B: state, next question, assessment, decision (UNCERTAIN)
    B-->>P: next question
    B-)C: SSE supervision.queued (uncertain)
    P->>B: answer
    B->>AI: POST /turn
    AI-->>B: decision HIGH, CARDIO
    C->>B: correct state ("no fever" → fever present) 
    B->>AI: POST /turn (corrected state, no new message)
    AI-->>B: decision HIGH (new assessment)
    C->>B: approve
    P->>B: confirm location
    B->>B: automatic assignment → La Rabta (location + urgency + availability)
    B->>AI: POST /report
    AI-->>B: structured report
    B-)H: SSE referral.new
    H->>B: Accept "entrance B"
    B-)P: SSE / push "accepted"
    H->>B: arrived → in treatment → outcome (ADMITTED)
    B->>B: LEARNING_EVENT (AI level, final level, outcome)
```

For EMERGENCY, steps 3–12 collapse: the patient gets the emergency instructions at once, the case goes to the nearest capable ED, and the clinician reviews in parallel (gate 2).

---

## 13. Case and referral lifecycles

### Case

```mermaid
stateDiagram-v2
    [*] --> TRIAGING
    TRIAGING --> TRIAGING: follow-up question
    TRIAGING --> EMERGENCY: level EMERGENCY (instructions shown at once)
    TRIAGING --> UNDER_REVIEW: level UNCERTAIN (clinician queue)
    UNDER_REVIEW --> RESULT_READY: approved / overridden / timeout → HIGH
    UNDER_REVIEW --> TRIAGING: more questions
    TRIAGING --> RESULT_READY: level HIGH or LOW
    EMERGENCY --> REFERRED: nearest capable ED
    RESULT_READY --> REFERRED: HIGH + location → hospital assigned automatically
    RESULT_READY --> CLOSED: LOW → self-care / visit
    REFERRED --> REFERRED: update, question, reroute, override
    REFERRED --> CLOSED: outcome recorded / didn't go / 24 h expiry
    CLOSED --> [*]
```

A clinician override can move a case at any point (e.g. LOW → HIGH puts it back into matching).

### Referral (one hospital)

```mermaid
stateDiagram-v2
    [*] --> SENT
    SENT --> INFO_REQUESTED: request info
    INFO_REQUESTED --> SENT: patient answered
    SENT --> ACCEPTED
    INFO_REQUESTED --> ACCEPTED
    SENT --> REJECTED
    INFO_REQUESTED --> REJECTED
    SENT --> REROUTED
    INFO_REQUESTED --> REROUTED
    ACCEPTED --> REROUTED
    SENT --> TIMED_OUT
    INFO_REQUESTED --> TIMED_OUT
    SENT --> CANCELLED
    ACCEPTED --> CANCELLED
    ACCEPTED --> ARRIVED: arrival confirmed
    ARRIVED --> COMPLETED: outcome recorded
    REJECTED --> [*]
    REROUTED --> [*]
    TIMED_OUT --> [*]
    CANCELLED --> [*]
    COMPLETED --> [*]
```

While ARRIVED, `treatmentStatus` moves through *in treatment → admitted / transferred / discharged / left without being seen*. REJECTED, REROUTED and TIMED_OUT create the next referral (§24). These machines are defined once in `packages/shared/src/status.ts` and enforced in the backend.

---

## 14. Prisma schema

`backend/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role { PATIENT STAFF ADMIN }
enum FacilityRole { ED_STAFF CLINICIAN MANAGER }
enum FacilityType { CHU REGIONAL SPECIALIZED_INSTITUTE MILITARY PRIVATE_CLINIC }
enum Governorate { TUNIS ARIANA BEN_AROUS MANOUBA }
enum ArrivalMode { SELF AMBULANCE }
enum TrackingSource { PATIENT AMBULANCE_SIM }
enum DispatchStatus { DISPATCHED EN_ROUTE_TO_PATIENT AT_PATIENT TRANSPORTING ARRIVED CANCELLED }
enum ExportFormat { CSV FHIR_NDJSON PDF_ZIP }
enum ExportStatus { QUEUED RUNNING READY FAILED EXPIRED }
enum RiskLevel { EMERGENCY HIGH LOW UNCERTAIN }
enum Uncertainty { LOW MEDIUM HIGH }
enum CaseStatus { TRIAGING EMERGENCY UNDER_REVIEW RESULT_READY REFERRED CLOSED }
enum ReviewStatus { NONE QUEUED APPROVED OVERRIDDEN }
enum TurnRole { PATIENT ASSISTANT SYSTEM CLINICIAN HOSPITAL }
enum StateSource { AI CLINICIAN }
enum ReviewDecision { APPROVED OVERRIDDEN STATE_CORRECTED }
enum DeptStatus { AVAILABLE LIMITED FULL CLOSED }
enum ReferralStatus { SENT INFO_REQUESTED ACCEPTED REJECTED REROUTED TIMED_OUT CANCELLED ARRIVED COMPLETED }
enum TreatmentStatus { IN_TREATMENT ADMITTED TRANSFERRED DISCHARGED LEFT_WITHOUT_BEING_SEEN }
enum ReferralOrigin { AUTO_ASSIGN AUTO_EMERGENCY AUTO_REMATCH HOSPITAL_REROUTE LOCATION_CORRECTED CLINICIAN_OVERRIDE }
enum Disposition { DISCHARGED ADMITTED ICU TRANSFERRED DECEASED LEFT }
enum OutcomeSource { DASHBOARD API }
enum AnswerType { YES_NO CHOICE TEXT }
enum ChatSender { PATIENT STAFF SYSTEM }
enum ChatKind { TEXT QUESTION ANSWER INSTRUCTION WORSE SYSTEM RED_FLAG }
enum AnswerVia { APP WEB WEB_PAGE }
enum ReportKind { PRE_ARRIVAL UPDATE CANCELLATION PATIENT }
enum ReportStatus { DRAFT FINAL }
enum ReportAuthor { AI CLINICIAN }
enum ChannelType { WEBHOOK_FHIR }
enum DeliveryStatus { QUEUED SENT DELIVERED FAILED }
enum PushKind { EXPO WEB }
enum NotifyStatus { QUEUED SENT DELIVERED FAILED OPENED }

// ---------- Hospital directory ----------

model Facility {
  id                        String       @id @default(uuid())
  name                      String
  shortName                 String?
  type                      FacilityType
  governorate               Governorate
  city                      String?
  address                   String?
  lat                       Float
  lng                       Float
  hasGeneralEd              Boolean      @default(true)
  edPhone                   String?
  isActive                  Boolean      @default(true)
  apiKeyHash                String?
  decisionTimeoutEmergencySec Int        @default(180)
  decisionTimeoutHighSec    Int          @default(600)
  alertDelaySec             Int          @default(120)
  availabilityStaleAfterMin Int          @default(240)
  availabilityConfirmedAt   DateTime?
  departments               Department[]
  equipment                 FacilityEquipment[]
  onCall                    OnCallShift[]
  channels                  DeliveryChannel[]
  unavailability            FacilityUnavailability[]
  memberships               StaffMembership[]
  referrals                 Referral[]
}

model Specialty {
  code           String        @id   // EMERG, CARDIO, NEURO, PEDIA, TRAUMA, OPHTA, OBGYN, BURNS...
  nameFr         String
  nameAr         String
  nameEn         String
  departments    Department[]
  onCall         OnCallShift[]
  unavailability FacilityUnavailability[]
}

model Department {
  id                String     @id @default(uuid())
  facilityId        String
  facility          Facility   @relation(fields: [facilityId], references: [id])
  specialtyCode     String
  specialty         Specialty  @relation(fields: [specialtyCode], references: [code])
  hasEmergency      Boolean    @default(true)
  notes             String?
  status            DeptStatus @default(AVAILABLE)   // manual
  bedsAvailable     Int?                            // manual
  specialistsOnDuty Int?                            // manual
  estimatedWaitMin  Int?                            // manual
  statusUpdatedAt   DateTime?
  statusUpdatedById String?
  snapshots         CapacitySnapshot[]
  referrals         Referral[]
  @@unique([facilityId, specialtyCode])
}

model CapacitySnapshot {
  id                String     @id @default(uuid())
  departmentId      String
  department        Department @relation(fields: [departmentId], references: [id])
  status            DeptStatus
  bedsAvailable     Int?
  specialistsOnDuty Int?
  estimatedWaitMin  Int?
  updatedById       String
  confirmOnly       Boolean    @default(false)
  takenAt           DateTime   @default(now())
  @@index([departmentId, takenAt])
}

model Equipment {
  code       String              @id   // CT, MRI, CATH_LAB, ICU, NICU, DIALYSIS...
  nameFr     String
  nameAr     String
  nameEn     String
  facilities FacilityEquipment[]
}

model FacilityEquipment {
  facilityId    String
  facility      Facility  @relation(fields: [facilityId], references: [id])
  equipmentCode String
  equipment     Equipment @relation(fields: [equipmentCode], references: [code])
  operational   Boolean   @default(true)
  updatedAt     DateTime  @updatedAt
  updatedById   String?
  @@id([facilityId, equipmentCode])
}

model OnCallShift {
  id            String    @id @default(uuid())
  specialtyCode String
  specialty     Specialty @relation(fields: [specialtyCode], references: [code])
  facilityId    String
  facility      Facility  @relation(fields: [facilityId], references: [id])
  startsAt      DateTime
  endsAt        DateTime
  @@index([specialtyCode, startsAt, endsAt])
}

model FacilityUnavailability {
  id            String     @id @default(uuid())
  facilityId    String
  facility      Facility   @relation(fields: [facilityId], references: [id])
  specialtyCode String?
  specialty     Specialty? @relation(fields: [specialtyCode], references: [code])
  reason        String
  until         DateTime
  createdById   String
  createdAt     DateTime   @default(now())
  @@index([facilityId, until])
}

model DeliveryChannel {
  id         String           @id @default(uuid())
  facilityId String
  facility   Facility         @relation(fields: [facilityId], references: [id])
  type       ChannelType
  target     String
  secret     String?
  priority   Int              @default(1)
  active     Boolean          @default(true)
  deliveries ReportDelivery[]
}

// ---------- People ----------

model User {
  id                 String    @id @default(uuid())
  role               Role      @default(PATIENT)
  isAnonymous        Boolean   @default(false)   // patient device identity, no login
  deviceId           String?   @unique             // anonymous patients
  phone              String?   @unique             // optional, linked later (P1c)
  email              String?   @unique
  passwordHash       String?
  name               String?
  language           String    @default("fr")   // darija | ar | fr | en
  birthYear          Int?
  sex                String?
  pregnant           Boolean?
  consentVersion     String?
  consentAt          DateTime?
  active             Boolean   @default(true)
  mustChangePassword Boolean   @default(false)
  createdAt          DateTime  @default(now())
  memberships        StaffMembership[]
  cases              Case[]
  notifications      Notification[]
  pushSubscriptions  PushSubscription[]
  clientRequests     ClientRequest[]
}

model StaffMembership {
  id                String       @id @default(uuid())
  userId            String
  user              User         @relation(fields: [userId], references: [id])
  facilityId        String
  facility          Facility     @relation(fields: [facilityId], references: [id])
  facilityRole      FacilityRole @default(ED_STAFF)
  supervisesNetwork Boolean      @default(false)   // clinician pool for unreferred cases
  active            Boolean      @default(true)
  @@unique([userId, facilityId])
}

// ---------- Cases, triage, supervision ----------

model Case {
  id                    String       @id @default(uuid())
  referenceCode         String       @unique   // HC-7K4P2Q, not a credential
  patientId             String
  patient               User         @relation(fields: [patientId], references: [id])
  status                CaseStatus   @default(TRIAGING)
  language              String
  currentLevel          RiskLevel?
  currentAssessmentId   String?
  reviewStatus          ReviewStatus @default(NONE)
  reviewDueAt           DateTime?
  degraded              Boolean      @default(false)
  lat                   Float?
  lng                   Float?
  locationAccuracyM     Int?
  locationSource        String?      // GPS | ADJUSTED | MANUAL | LAST_KNOWN
  locationAddress       String?
  locationConfirmedAt   DateTime?
  patientTokenHash      String?      @unique
  patientTokenExpiresAt DateTime?
  lastPatientContactAt  DateTime?
  hiddenByPatient       Boolean      @default(false)
  createdAt             DateTime     @default(now())
  closedAt              DateTime?
  turns                 Turn[]
  states                CaseState[]
  assessments           RiskAssessment[]
  reviews               Review[]
  overrides             Override[]
  notes                 ClinicalNote[]
  escalations           Escalation[]
  referrals             Referral[]
  reports               Report[]
  notifications         Notification[]
  @@index([status, reviewStatus])
}

model Turn {
  id              String           @id @default(uuid())
  caseId          String
  case            Case             @relation(fields: [caseId], references: [id])
  index           Int
  role            TurnRole
  text            String
  normalizedText  String?
  language        String?
  script          String?
  clientRequestId String?          @unique
  aiLatencyMs     Int?
  createdAt       DateTime         @default(now())
  states          CaseState[]
  assessments     RiskAssessment[]
  @@unique([caseId, index])
}

model CaseState {
  id          String           @id @default(uuid())
  caseId      String
  case        Case             @relation(fields: [caseId], references: [id])
  version     Int
  data        Json             // CaseState (packages/shared/src/case-state.ts)
  missingInfo Json?
  source      StateSource
  turnId      String?
  turn        Turn?            @relation(fields: [turnId], references: [id])
  createdById String?          // clinician for CLINICIAN corrections
  createdAt   DateTime         @default(now())
  assessments RiskAssessment[]
  @@unique([caseId, version])
}

model RiskAssessment {
  id                 String      @id @default(uuid())
  caseId             String
  case               Case        @relation(fields: [caseId], references: [id])
  stateId            String
  state              CaseState   @relation(fields: [stateId], references: [id])
  turnId             String?
  turn               Turn?       @relation(fields: [turnId], references: [id])
  pNlp               Float?
  nlpConfidence      Float?
  sRule              Float?
  triggeredRules     Json
  pFinal             Float?
  level              RiskLevel
  uncertainty        Uncertainty
  contributions      Json?
  actions            Json
  suggestedSpecialty String?
  requiredEquipment  String[]
  rationale          String?
  rationaleLocalized String?
  versions           Json        // classifier, rules, fusion, prompts
  degraded           Boolean     @default(false)
  createdAt          DateTime    @default(now())
  reviews            Review[]
  @@index([caseId, createdAt])
}

model Review {
  id           String         @id @default(uuid())
  caseId       String
  case         Case           @relation(fields: [caseId], references: [id])
  assessmentId String
  assessment   RiskAssessment @relation(fields: [assessmentId], references: [id])
  gate         Int            // 1..4
  decision     ReviewDecision
  reviewerId   String
  note         String?
  createdAt    DateTime       @default(now())
  override     Override?
}

model Override {
  id          String    @id @default(uuid())
  reviewId    String    @unique
  review      Review    @relation(fields: [reviewId], references: [id])
  caseId      String
  case        Case      @relation(fields: [caseId], references: [id])
  fromLevel   RiskLevel
  toLevel     RiskLevel
  reason      String
  createdAt   DateTime  @default(now())
}

model ClinicalNote {
  id        String   @id @default(uuid())
  caseId    String
  case      Case     @relation(fields: [caseId], references: [id])
  authorId  String
  text      String
  createdAt DateTime @default(now())
}

// ---------- Referrals, arrival, outcome ----------

model Referral {
  id                 String           @id @default(uuid())
  caseId             String
  case               Case             @relation(fields: [caseId], references: [id])
  facilityId         String
  facility           Facility         @relation(fields: [facilityId], references: [id])
  departmentId       String?
  department         Department?      @relation(fields: [departmentId], references: [id])
  previousReferralId String?          @unique
  previous           Referral?        @relation("Chain", fields: [previousReferralId], references: [id])
  next               Referral?        @relation("Chain")
  status             ReferralStatus   @default(SENT)
  treatmentStatus    TreatmentStatus?
  origin             ReferralOrigin   @default(AUTO_ASSIGN)
  scoreBreakdown     Json?
  matchReason        String?
  distanceKm         Float?
  etaMinutes         Int?
  etaAt              DateTime?
  decisionDueAt      DateTime?
  decidedById        String?
  decidedAt          DateTime?
  decisionReason     String?
  decisionDetail     String?
  acceptNote         String?
  arrivalMode        ArrivalMode?
  trackingShared     Boolean          @default(false)
  lastPositionAt     DateTime?
  backupAlertSentAt  DateTime?
  arrivedAt          DateTime?
  completedAt        DateTime?
  createdAt          DateTime         @default(now())
  infoRequests       InfoRequest[]
  chatMessages       ChatMessage[]
  trackingPoints     TrackingPoint[]
  dispatch           AmbulanceDispatch?
  deliveries         ReportDelivery[]
  outcome            Outcome?
  @@index([facilityId, status])
  @@index([status, decisionDueAt])
}

model ChatMessage {
  id              String     @id @default(uuid())
  referralId      String
  referral        Referral   @relation(fields: [referralId], references: [id])
  sender          ChatSender
  senderId        String?
  kind            ChatKind   @default(TEXT)
  text            String
  translation     String?
  infoRequestId   String?
  clientRequestId String?    @unique
  readAt          DateTime?
  createdAt       DateTime   @default(now())
  @@index([referralId, createdAt])
}

model TrackingPoint {
  id         String         @id @default(uuid())
  referralId String
  referral   Referral       @relation(fields: [referralId], references: [id])
  source     TrackingSource
  lat        Float
  lng        Float
  accuracyM  Int?
  speedKmh   Float?
  recordedAt DateTime
  createdAt  DateTime       @default(now())
  @@index([referralId, recordedAt])
}

model AmbulanceDispatch {
  id          String         @id @default(uuid())
  referralId  String         @unique
  referral    Referral       @relation(fields: [referralId], references: [id])
  unitName    String         // AMB-03
  simulated   Boolean        @default(true)
  status      DispatchStatus @default(DISPATCHED)
  route       Json           // polyline hospital → patient → hospital
  progressM   Float          @default(0)
  currentLat  Float?
  currentLng  Float?
  etaAt       DateTime?
  dispatchedById String
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
}

model ExportJob {
  id          String       @id @default(uuid())
  facilityId  String
  requestedById String
  filters     Json         // from, to, status, level
  format      ExportFormat
  status      ExportStatus @default(QUEUED)
  fileKey     String?
  rowCount    Int?
  expiresAt   DateTime?
  error       String?
  createdAt   DateTime     @default(now())
}

model Escalation {
  id          String    @id @default(uuid())
  caseId      String
  case        Case      @relation(fields: [caseId], references: [id])
  referralId  String?
  fromLevel   RiskLevel
  toLevel     RiskLevel
  reason      String
  instruction String?
  byId        String?   // staff user; null when automatic (red flag in the chat)
  automatic   Boolean   @default(false)
  createdAt   DateTime  @default(now())
}

model InfoRequest {
  id                String     @id @default(uuid())
  referralId        String
  referral          Referral   @relation(fields: [referralId], references: [id])
  question          String
  questionLocalized String?
  answerType        AnswerType
  options           String[]
  askedById         String
  askedAt           DateTime   @default(now())
  answer            String?
  answeredVia       AnswerVia?
  answeredAt        DateTime?
}

model Outcome {
  referralId         String        @id
  referral           Referral      @relation(fields: [referralId], references: [id])
  finalLevel         RiskLevel
  disposition        Disposition
  diagnosisCategory  String?
  diagnosisText      String?
  notes              String?
  source             OutcomeSource
  raw                Json?         // API payload as received
  recordedById       String?
  recordedAt         DateTime      @default(now())
}

// ---------- Reports and delivery ----------

model Report {
  id              String           @id @default(uuid())
  caseId          String
  case            Case             @relation(fields: [caseId], references: [id])
  version         Int
  kind            ReportKind
  status          ReportStatus     @default(FINAL)
  author          ReportAuthor     @default(AI)
  data            Json             // structured report from AI /report (+ clinician edits)
  assessmentId    String?          // which assessment it reflects
  editedById      String?
  accessTokenHash String           @unique
  accessExpiresAt DateTime
  createdAt       DateTime         @default(now())
  deliveries      ReportDelivery[]
  @@unique([caseId, version])
}

model ReportDelivery {
  id             String          @id @default(uuid())
  reportId       String
  report         Report          @relation(fields: [reportId], references: [id])
  referralId     String
  referral       Referral        @relation(fields: [referralId], references: [id])
  channelId      String
  channel        DeliveryChannel @relation(fields: [channelId], references: [id])
  status         DeliveryStatus  @default(QUEUED)
  attempts       Int             @default(0)
  lastError      String?
  externalRef    String?
  sentAt         DateTime?
  firstViewedAt  DateTime?
  createdAt      DateTime        @default(now())
  @@index([status, attempts])
}

// ---------- Push notifications (phone + computer), idempotency ----------

model PushSubscription {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  kind        PushKind
  expoToken   String?  @unique   // mobile app
  endpoint    String?  @unique   // Web Push (browser on phone or computer)
  p256dh      String?
  auth        String?
  deviceLabel String?
  active      Boolean  @default(true)
  failures    Int      @default(0)
  lastSeenAt  DateTime @default(now())
  createdAt   DateTime @default(now())
  notifications Notification[]
  @@index([userId, active])
}

model Notification {
  id             String            @id @default(uuid())
  userId         String            // patient or staff
  user           User              @relation(fields: [userId], references: [id])
  caseId         String?
  case           Case?             @relation(fields: [caseId], references: [id])
  subscriptionId String?
  subscription   PushSubscription? @relation(fields: [subscriptionId], references: [id])
  type           String
  critical       Boolean           @default(false)
  channel        PushKind
  status         NotifyStatus      @default(QUEUED)
  attempts       Int               @default(1)
  expoTicketId   String?
  error          String?
  sentAt         DateTime?
  openedAt       DateTime?
  escalatedAt    DateTime?
  createdAt      DateTime          @default(now())
  @@index([status, critical, sentAt])
}

model ClientRequest {
  key       String   @id
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  caseId    String?
  endpoint  String
  response  Json
  createdAt DateTime @default(now())
}

// ---------- Learning and audit ----------

model LearningEvent {
  id            String       @id @default(uuid())
  caseHash      String       // HMAC(caseId, secret): joins updates without exposing the id
  stage         String       // assessment | review | outcome
  stateSnapshot Json         // anonymized CaseState
  language      String?
  script        String?
  ageBucket     String?
  sex           String?
  pNlp          Float?
  sRule         Float?
  pFinal        Float?
  aiLevel       RiskLevel?
  finalLevel    RiskLevel?   // after clinician review
  overridden    Boolean      @default(false)
  outcomeLevel  RiskLevel?
  disposition   Disposition?
  versions      Json
  createdAt     DateTime     @default(now())
  @@index([caseHash])
  @@index([createdAt])
}

model AuditLog {
  id         String   @id @default(uuid())
  actorId    String?
  facilityId String?
  action     String   // ai.turn, supervision.override, referral.accept, outcome.record...
  entity     String
  entityId   String
  data       Json?
  versions   Json?    // model / rules / fusion / prompt versions for AI decisions
  createdAt  DateTime @default(now())
  @@index([entity, entityId])
}
```

---

## 15. Seed data: Grand Tunis hospitals (candidates, verify before use)

**Source of truth:** `mobile/src/mock/data/hospitals.grand-tunis.json` (18 public / university / military / specialized hospitals, OpenStreetMap coordinates, illustrative departments and equipment, `edPhone: null` on purpose — the apps fall back to 190 and never show an invented number). The backend seed (`prisma/seed.ts`) loads the same file; the table below is the earlier candidate list.

> **Source of truth:** `backend/prisma/data/grand-tunis-hospitals.json` lists 18 public hospitals (Tunis 12, Ariana 2, Ben Arous 2, Manouba 2), plus the `Specialty` and `Equipment` reference lists. Coordinates come from OpenStreetMap; `coordVerified: false` marks an approximate point. Departments and equipment are **illustrative**. `edPhone` is `null` on purpose. `seed.ts` reads this file and adds the demo availability (stale data, scanner down, etc.). The table below is the original shortlist.

| Facility | Type | Governorate | Notable for |
|---|---|---|---|
| Hôpital Charles Nicolle | CHU | Tunis | general ED, many specialties |
| Hôpital La Rabta | CHU | Tunis | general ED, cardiology |
| Hôpital Habib Thameur | CHU | Tunis | general ED |
| Hôpital Mongi Slim (La Marsa) | CHU | Tunis | general ED, north suburbs |
| Hôpital d'Enfants Béchir Hamza | CHU | Tunis | pediatrics |
| Centre de Traumatologie et des Grands Brûlés | Specialized | Ben Arous | trauma, burns |
| Institut National de Neurologie Mongi Ben Hamida | Specialized | Tunis | neurology / stroke |
| Institut Hédi Rais d'Ophtalmologie | Specialized | Tunis | ophthalmology |
| Hôpital Abderrahmen Mami | CHU | Ariana | pneumology / respiratory |
| Hôpital Militaire Principal d'Instruction de Tunis | Military | Tunis | general ED |
| Centre de Maternité et de Néonatologie de Tunis | Specialized | Tunis | obstetrics, neonatology |

**`backend/prisma/seed.ts` creates:**
- 8–12 hospitals from the list above (approximate coordinates), 2–5 departments each, including `EMERG`, with varied availability (beds, doctors, scanner). One hospital's availability is deliberately **stale**, and one has its **scanner down**.
- Specialty and equipment reference lists (FR / AR / EN names), equipment rows and one week of on-call shifts.
- Staff per demo hospital: **1 manager, 1–2 ED staff, 1 clinician**. Plus one **network clinician** (`supervisesNetwork = true`) and one person with memberships in two hospitals.
- **FHIR webhook** channels pointing to webhook.site only, never real hospitals. Push needs no seed: each demo account enables notifications on its devices.
- **Demo patients** with past cases (for History) and the scripted conversations of `docs/demo-script.md`.
- Short timeouts for the demo (EMERGENCY decision 60 s, HIGH 120 s, uncertain review 90 s) and `DEMO_SPEED_FACTOR = 10` for the simulated ambulance.

### Live services each hospital keeps up to date

| Service | Where it lives | Routing rule (§23) |
|---|---|---|
| **Scanner (CT)** and other equipment | `FacilityEquipment.operational` (working / down) | a patient who **needs a scan** (`required_equipment` contains `CT`) is **never** sent to a hospital whose scanner is down |
| **Free beds** | `Department.bedsAvailable` (per department, incl. the ED as `EMERG`) | **0 free beds** (fresh data) → the hospital is **excluded** for that department |
| **Doctors available** | `Department.specialistsOnDuty` (for the ED: ED doctors on duty) | **0 doctors** for the needed specialty (fresh) → excluded, unless the hospital is on call for it |
| Department status | `Department.status` (Available / Limited / Full / Closed) | Full or Closed (fresh) → excluded; Limited → penalty |
| Estimated wait | `Department.estimatedWaitMin` | added to the score |

Data older than the hospital's staleness threshold counts as **unknown**: never as available, and never a reason to send an EMERGENCY patient further away (§4).

---

## 16. Design notes

- **The AI service is stateless; the backend stores every AI output.** Each `/turn` becomes a `TURN` + a new `CASE_STATE` version + a `RISK_ASSESSMENT`, so the risk over time, the explanation and any replay come from our DB.
- **State is versioned, never edited in place.** A clinician correction is a new `CASE_STATE` (source CLINICIAN), followed by a new assessment. The AI's original remains for learning and audit.
- **Reviews and overrides are separate tables.** `REVIEW` records every human check (gates 1–4). `OVERRIDE` exists only when the level changed, with from/to and reason.
- **Reports are structured JSON, versioned, with an author (AI / CLINICIAN) and a status (DRAFT / FINAL).** HTML, PDF and FHIR are rendered from the stored JSON.
- **Referrals cover the hospital side up to the outcome:** decision, arrival, coarse treatment status and outcome. Doctor assignment and beds stay in the hospital's own system.
- **`LEARNING_EVENT` is anonymized and append-only**: no ids, names, phones or free text except the scrubbed `stateSnapshot`. `caseHash` (HMAC) links the stages of one case without a way back.
- **Availability is manual** with history (`CAPACITY_SNAPSHOT`) and staleness, and each hospital manages itself (`STAFF_MEMBERSHIP.facilityRole = MANAGER`).
- **One reference code per case** (`HC-…`), human-readable, never a credential.

---

# Part D — Implementation

## 17. Demo script

The full scripted conversations live in `docs/demo-script.md`. Setup: a phone (mobile) or a browser tab (patient dashboard), plus a laptop with three hospital-dashboard windows: **network clinician**, **La Rabta ED**, **Charles Nicolle ED**.

1. **Uncertain → clinician.** A patient writes in Arabizi: *"3andi wja3 fi kerchi w dou5a"* (stomach pain + dizziness). The interviewer asks two questions. The level is **UNCERTAIN**; the patient sees "A clinician is reviewing your case". The clinician's queue rings.
2. **Live supervision.** In CaseWorkspace, the clinician sees the transcript, the state, the risk curve and the contributions. They notice the AI missed "I'm pregnant" in a later message, correct the state (`pregnant = true`), and the re-run assessment rises to **HIGH**. They approve.
3. **Automatic assignment.** The patient confirms their location; the system assigns La Rabta (shown with the reason: specialty, free beds, distance, ETA). The structured report is generated (`/report`), and La Rabta's Board rings.
4. **Two-way handoff.** La Rabta asks "Any bleeding?" (yes/no). The patient answers on their phone, and it appears live. La Rabta clicks **Cannot receive → specialist unavailable**. Charles Nicolle rings; the patient is told "Go to Charles Nicolle instead".
5. **Accept + handoff inbox.** Charles Nicolle accepts ("entrance B"). The case appears in **Handoffs** with an ETA countdown.
6. **Worsening.** The patient taps "I feel worse: heavy bleeding". A critical rule fires → **EMERGENCY**: the emergency screen shows instantly, the Handoffs card turns red, and the clinician gets a gate-2 alert.
7. **Arrival → outcome.** Charles Nicolle marks arrived → in treatment → admitted, then records the outcome (final level EMERGENCY, ADMITTED, diagnosis category). The case closes.
8. **Override + learning.** In another prepared case, the clinician overrides LOW → HIGH with a reason. **Metrics** shows the override rate, emergency recall and calibration updating.
9. **Emergency path.** *"n7ess rou7i mkhanou9 w sderi yo9jani"* → EMERGENCY on the first turn: instructions at once, the nearest capable ED rings, no waiting.
10. **Resilience.** Stop the `ai` container: the patient gets the degraded-mode message + 190, and the case goes to the clinician queue. Close the app and the patient tab: a hospital question still arrives as a push on the phone **and** the computer, repeated until opened.

---

## 18. MVP cut

**Must have (demo path):**
- `ai-stub` with the demo conversations, then the real `ai/`
- triage loop (P1–P5), Emergency (P4), Status + live updates (P7)
- supervision C1–C4 (queue, live view, state correction + re-run, approve/override)
- matching + referral + Board H1–H6 + Handoffs H10
- Arrival / outcome H13–H15
- the structured report via `/report` + report page / PDF
- learning events + 3 metrics (emergency recall, override rate, calibration)

**Should have:** patient History (P12), InfoRequests (P16), reroute notifications (P17), availability (H11–H12), manager staff accounts (M4), push on phone + computer (P13–P14).

**Nice to have:** offline outbox (P15), FHIR, other manager pages, backup alerts, the feedback API, `ContributionChart` polish.

**Mock:** ETA (straight line ÷ 30 km/h), anonymous patients (no login), seeded staff, webhook.site for the FHIR webhook.

---

## 19. Local setup

### docker-compose.yml

```yaml
services:
  db:
    image: postgres:16
    environment: { POSTGRES_USER: hackcure, POSTGRES_PASSWORD: hackcure, POSTGRES_DB: hackcure }
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]

  ai:
    build: ./ai                   # or ./ai-stub until the real service is ready
    env_file: .env
    ports: ["8000:8000"]

  backend:
    build: ./backend
    env_file: .env
    environment: { DATABASE_URL: "postgresql://hackcure:hackcure@db:5432/hackcure", AI_SERVICE_URL: "http://ai:8000" }
    command: ["npm", "run", "start"]      # next start
    depends_on: [db, ai]
    ports: ["3000:3000"]

  worker:
    build: ./backend                       # same image, different command
    env_file: .env
    environment: { DATABASE_URL: "postgresql://hackcure:hackcure@db:5432/hackcure", AI_SERVICE_URL: "http://ai:8000" }
    command: ["node", "dist/worker/index.js"]
    depends_on: [db, backend]

  hospital-dashboard:
    build: ./hospital-dashboard
    environment: { VITE_API_URL: "http://localhost:3000" }
    ports: ["5173:80"]

  patient-dashboard:
    build: ./patient-dashboard
    environment: { VITE_API_URL: "http://localhost:3000" }
    ports: ["5174:80"]

volumes:
  pgdata:
```

The mobile app is not in Compose: run `cd mobile && npx expo start`, pointing `EXPO_PUBLIC_API_URL` at the laptop's LAN IP. Note that `VITE_*` variables are baked in at **build** time; for a demo, build with the right URL or serve a small `config.json`.

### .env.example

```
# backend
DATABASE_URL=postgresql://hackcure:hackcure@localhost:5432/hackcure
JWT_SECRET=change-me
COOKIE_SECURE=false
HOSPITAL_DASHBOARD_ORIGIN=http://localhost:5173
PATIENT_DASHBOARD_ORIGIN=http://localhost:5174
PUBLIC_BASE_URL=http://192.168.1.20:3000
AI_SERVICE_URL=http://localhost:8000
AI_TIMEOUT_MS=15000
LEARNING_HASH_SECRET=change-me-too
VAPID_PUBLIC_KEY=...        # Web Push: generate once with `npx web-push generate-vapid-keys`
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:team@sahhanito.tn
EXPO_ACCESS_TOKEN=...       # optional, for Expo push
# ai
LLM_API_KEY=...
LLM_MODEL=...
CLASSIFIER_PATH=/app/models/xlmr
```

### npm workspaces (for `packages/shared`)

Root `package.json`: `{ "private": true, "workspaces": ["packages/*", "backend", "hospital-dashboard", "patient-dashboard", "mobile"] }`. Import types with `import type { CaseState } from '@sahhanito/shared'`. Expo needs `metro.config.js` `watchFolders` pointing to the repo root so it can resolve the shared package.

### Start (without Docker)

1. `docker compose up -d db`
2. `cd ai-stub && uvicorn main:app --port 8000` (or `cd ai && uvicorn main:app --port 8000`)
3. `cd backend && npx prisma migrate dev && npx prisma db seed && npm run dev` (Next.js API on :3000), and in a second terminal `cd backend && npx tsx watch worker/index.ts` (jobs + ambulance simulator)
4. `cd hospital-dashboard && npm run dev` · `cd patient-dashboard && npm run dev -- --port 5174`
5. `cd mobile && npx expo start`

---

## 20. Auth and access

**Patients** (`mobile/`, `patient-dashboard/`):
- **No login.** On first open, `POST /auth/anonymous { deviceId }` creates (or finds) an anonymous PATIENT user and returns a JWT `{ sub, role: 'PATIENT', anon: true }`, 30 days, renewed silently. The `deviceId` is a random id generated by the app and kept in secure storage.
- Optional later: `POST /auth/patient/link-phone` (phone + code) merges the anonymous cases into a phone account (P1c).
- **Abuse protection** (anyone can create cases): rate limits per device and IP; Play Integrity / App Attest when available; a referral requires a completed triage and a location; clinicians see repeat devices; staff can flag a case as abusive.
- Mobile stores it in `expo-secure-store`; the web app keeps it in memory + `localStorage` (demo).
- **SSE on the web:** `EventSource` can't send an Authorization header, so the app first calls `POST /patient/stream-ticket` (with the JWT) and gets a **single-use ticket valid for 60 s**, then opens `GET /patient/stream?ticket=…`. Never put the JWT itself in a URL.
- Access: `case.patientId === user.sub`.

**Staff** (`hospital-dashboard/`):
- `POST /auth/staff/login { email, password }` → httpOnly, Secure, SameSite=Lax cookie with a JWT `{ sub, role: 'STAFF', memberships: [{ facilityId, facilityRole, supervisesNetwork }] }`, 12 h. The cookie works for `/dashboard/stream` automatically.
- Role checks: `route({ auth: 'staff', facilityRole: ['ED_STAFF'] }, handler)` checks the membership for the hospital in the route (`:fid`, or the referral's hospital) and re-checks `user.active` in the DB.
- **`AccessService`** (one place for all visibility rules):

| Who | Sees |
|---|---|
| ED staff of hospital X | referrals to X (full report while the referral is active at X; summary only after a reroute away) |
| Clinician of hospital X | everything ED staff of X sees + supervision on those cases |
| Network clinician (`supervisesNetwork`) | the supervision queue of **unreferred** cases (UNCERTAIN, EMERGENCY, low confidence) + those cases' full view |
| Manager of X | X's settings, staff, statistics, audit; no clinical edits unless also clinician |
| Patient | own cases only |
| Admin | platform settings, onboarding, global monitoring; anonymized exports |

**Other:** `/r/:token` and `/p/:token` use random tokens (stored hashed). `/api/hospital-feedback` uses a per-hospital API key.

---

## 21. AI integration & the triage loop (`backend/src/ai`, `cases`)

### 21.1 `backend/src/server/ai/ai.client.ts`

```ts
export class AiClient {   // exported as a singleton: export const ai = new AiClient()
  async turn(body: TurnRequest): Promise<TurnResponse> { return this.post('/turn', body); }
  async report(body: ReportRequest): Promise<ReportResponse> { return this.post('/report', body); }

  private async post<T>(path: string, body: unknown, attempt = 1): Promise<T> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), Number(process.env.AI_TIMEOUT_MS ?? 15000));
    try {
      const res = await fetch(`${process.env.AI_SERVICE_URL}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: ctrl.signal,
      });
      if (res.status >= 500 && attempt < 2) return this.post(path, body, attempt + 1);  // one retry
      if (!res.ok) throw new AiError(res.status);
      return (await res.json()) as T;
    } catch (e) {
      if (attempt < 2 && (e as Error).name === 'AbortError') return this.post(path, body, attempt + 1);
      throw new AiUnavailable(e);
    } finally { clearTimeout(t); }
  }
}
```

### 21.2 The triage loop (`backend/src/cases/cases.service.ts`)

```
addPatientMessage(caseId, user, text, clientRequestId):
  1. access check; save TURN(PATIENT) (idempotent on clientRequestId)
  2. AiClient.turn({ history, state: latest CaseState, state_source, patient_context })
       └─ AiUnavailable → degraded mode (§21.4)
  3. in one DB transaction:
       TURN(ASSISTANT, next_question)             (if any)
       CASE_STATE v+1 (source AI)
       RISK_ASSESSMENT (pNlp, sRule, triggered rules, pFinal, level, uncertainty, contributions, versions)
       CASE.currentLevel / currentAssessmentId / status
       AUDIT_LOG("ai.turn", versions) + LEARNING_EVENT(stage = assessment)
  4. apply safety actions (from decision.actions):
       CALL_EMERGENCY      → status EMERGENCY; return { kind: "emergency" } FIRST, then
                             referrals.autoEmergency(case) + supervision.enqueue(gate 2)
       CLINICIAN_REVIEW    → supervision.enqueue(gate 1 or 2)
       ASK_FOLLOWUP        → return { kind: "question", next_question }
       UNCERTAIN level     → status UNDER_REVIEW, reviewDueAt = now + limit
       REFER_* / SELF_CARE → status RESULT_READY, return { kind: "result", … }
  5. live: patient stream "case.assessment" / "case.question";
           clinicians "case.turn" (+ "supervision.queued" if enqueued)
```

Re-run after a clinician correction (§22) uses the same steps 2–5 with **no** new patient turn and `state_source = CLINICIAN`.

### 21.3 `ai-stub/main.py`

Same contract as `ai/` (§6). It returns canned responses keyed on keywords, so the demo conversations in `docs/demo-script.md` are deterministic:

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class TurnReq(BaseModel):
    case_id: str
    turn_index: int
    message: str | None = None
    history: list = []
    state: dict | None = None
    state_source: str = "AI"
    patient_context: dict | None = None

CRIT = ["sder", "poitrine", "صدر", "mkhanou9", "nitnaffes", "nazif", "bleeding"]

@app.post("/turn")
def turn(r: TurnReq):
    text = (r.message or "").lower()
    pregnant = bool(r.state and r.state.get("metadata", {}).get("pregnant"))
    crit = any(k in text for k in CRIT)
    if crit:
        level, rules, p = "EMERGENCY", [{"id": "R-CARD-01", "name": "chest pain + dyspnea", "severity": "critical"}], 0.97
    elif pregnant:
        level, rules, p = "HIGH", [{"id": "R-OB-02", "name": "pregnancy + abdominal pain", "severity": "high"}], 0.72
    elif r.turn_index < 3:
        level, rules, p = "UNCERTAIN", [], 0.48
    else:
        level, rules, p = "LOW", [], 0.15
    return {
        "language": "darija", "script": "arabizi", "normalized_text": text,
        "state": r.state or {"symptoms": [], "history": [], "medications": [], "vitals": {"source": "patient"},
                             "uncertainties": [], "metadata": {}},
        "missing_info": ["duration"] if level == "UNCERTAIN" else [],
        "next_question": None if level in ("EMERGENCY",) or r.turn_index >= 3 else
            {"text": "Depuis quand ?", "text_localized": "men waktech?", "quick_replies": ["< 1h", "1-24h", "> 1 jour"]},
        "assessment": {"p_nlp": p, "nlp_confidence": 0.7, "s_rule": 1.0 if rules else 0.0, "triggered_rules": rules,
                       "p_final": p, "uncertainty": "HIGH" if level == "UNCERTAIN" else "LOW",
                       "contributions": {"bias": -1.0, "nlp": 1.2, "rules": 2.5 if rules else 0.0}},
        "decision": {"level": level,
                     "actions": {"EMERGENCY": ["CALL_EMERGENCY", "REFER_NEAREST_ED", "CLINICIAN_REVIEW"],
                                 "HIGH": ["REFER_ED"], "LOW": ["SELF_CARE"],
                                 "UNCERTAIN": ["ASK_FOLLOWUP", "CLINICIAN_REVIEW"]}[level],
                     "suggested_specialty": "CARDIO" if crit else ("OBGYN" if pregnant else None),
                     "required_equipment": ["CATH_LAB"] if crit else [],
                     "rationale": "stub", "rationale_localized": "stub"},
        "versions": {"classifier": "stub", "rules": "stub", "fusion": "stub", "prompts": "stub"},
    }

@app.post("/report")
def report(body: dict):
    a = body.get("assessment", {})
    return {"summary": "Stub summary", "chief_complaint": "stub", "timeline": [], "positives": [], "negatives": [],
            "history": [], "medications": [], "vitals": {}, "red_flags": [x["name"] for x in a.get("triggered_rules", [])],
            "risk": {"level": body.get("decision", {}).get("level"), "p_final": a.get("p_final"), "uncertainty": a.get("uncertainty")},
            "recommended_actions": [], "open_questions": [],
            "disclaimer": "AI-assisted triage. Clinical decisions remain with the receiving team.",
            "versions": {"report_prompt": "stub"}}

@app.get("/health")
def health():
    return {"ok": True, "versions": {"stub": True}}
```

### 21.4 Degraded mode (AI unavailable)

The backend contains **no medical logic of its own**. When `/turn` fails after the retry:
1. Save a SYSTEM turn with the localized safe message: *"We can't analyze your message right now. If you have chest pain, difficulty breathing, heavy bleeding, fainting or signs of stroke, call 190 now."* with a call button.
2. Mark `case.degraded = true` and queue the case for a clinician (gate 1, reason "AI unavailable"). The clinician can talk to the patient through the case (CLINICIAN turns) or set a level manually (as an override).
3. The `ai-health` job shows "AI degraded" in both dashboards until `/health` recovers. Pending cases are then re-run automatically.

---

## 22. Clinician supervision (`backend/src/supervision`, `CaseWorkspace.tsx`)

**Purpose:** continuous clinician oversight of the AI (gates 1–2 of the infographic). The clinician never blocks an emergency, but can correct, approve or override at any time.

### 22.1 The queue (`GET /supervision/queue`)

A case enters the queue (`reviewStatus = QUEUED`) when:

| Reason | Gate | Priority |
|---|---|---|
| level EMERGENCY | 2 | 1 (review in parallel, the patient is already told to go) |
| level UNCERTAIN | 1 | 2 (the patient waits for review, up to `reviewDueAt`) |
| low NLP confidence, or the rules and the classifier disagree (e.g. `sRule = 0`, `pNlp > 0.8`) | 1 | 3 |
| AI degraded | 1 | 2 |
| the patient's level rose after referral | 2 | 1 |

Scope: network clinicians see unreferred cases; hospital clinicians see the cases referred to their hospital (§20).

### 22.2 The workspace (`CaseWorkspace.tsx`)

- `TranscriptView`: timestamps, language/script tags, normalized text on hover
- `StateEditor`: the current `CaseState` with source badges (AI / clinician); edit symptoms (present/absent), history, medications, vitals (source = clinician), pregnancy
- risk over time: a line of `pFinal` per assessment, with level bands and markers for overrides and corrections
- `RiskBadge`, `UncertaintyBar`, `RedFlagList` (triggered rules), `ContributionChart` (bias / NLP / rules contributions to `pFinal`)
- `ReportViewer`: the draft report, editable
- **action panel:** Approve · Override (level + reason, required) · Add note · Ask the patient (a CLINICIAN turn)

Live: subscribes to `case.turn` and `case.state_corrected` for this case, so the view updates while the patient is still typing.

### 22.3 Backend actions (`backend/src/supervision`)

```
correctState(user, caseId, state, note):
  CASE_STATE v+1 (source CLINICIAN, createdById) → REVIEW(STATE_CORRECTED)
  → AiClient.turn(state_source = CLINICIAN, no new message) → new RISK_ASSESSMENT
  → apply safety actions (§21.2 step 4) → live "case.state_corrected"

approve(user, caseId, assessmentId, note):
  check assessmentId is still the case's current assessment (else 409 "risk changed, re-check")
  REVIEW(APPROVED) → reviewStatus APPROVED → continue the flow (e.g. UNCERTAIN → RESULT_READY)

override(user, caseId, assessmentId, level, reason):
  same check → REVIEW(OVERRIDDEN) + OVERRIDE(from, to, reason)
  → CASE.currentLevel = level
  → effects: up to EMERGENCY → emergency screen + autoEmergency; LOW → HIGH → matching;
             referral active and level changed → new report version + hospital notified
  → LEARNING_EVENT(stage = review, overridden = true) + AUDIT_LOG
```

**Rules:**
- Overriding **down** from EMERGENCY requires a second confirmation and a reason of at least 20 characters. It is highlighted in Metrics.
- A clinician cannot approve an assessment they haven't opened. The panel is disabled until the workspace has loaded that assessment id.
- UNCERTAIN not reviewed by `reviewDueAt` → the `uncertain-timeout` job sets the case to HIGH ("timeout") and continues. It stays visible in the queue as "auto-escalated".

---

## 23. Matching across Grand Tunis (`matching/`)

Load every active hospital with what matching needs. That's a few dozen rows, so filter in memory:

```ts
const now = new Date();
const facilities = await prisma.facility.findMany({
  where: { isActive: true },
  include: {
    departments: true,
    equipment: true,
    onCall: { where: { startsAt: { lte: now }, endsAt: { gt: now } } },
  },
});

function km(a: {lat:number;lng:number}, b: {lat:number;lng:number}) {
  const R = 6371, r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat/2)**2 + Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
```

Rules, for `specialty` (e.g. `CARDIO`) and `requiredEquipment` (e.g. `['CATH_LAB']`):

1. **Can treat it:** a department for that specialty with `hasEmergency`, **or** on duty for it now (`onCall`).
2. **Has the equipment:** every required code is in `equipment` **with `operational = true`**.
2b. **Manual availability:** availability is *fresh* if `statusUpdatedAt` (or the hospital's `availabilityConfirmedAt`) is newer than `availabilityStaleAfterMin`.
    - Fresh `FULL` / `CLOSED`, or fresh `bedsAvailable = 0`: **exclude**.
    - Fresh `specialistsOnDuty = 0`: exclude for that specialty, unless the hospital is on call for it.
    - Fresh `LIMITED`: +10 penalty.
    - **Stale:** treated as unknown, with a +5 penalty and the reason "availability not confirmed". Never treated as available.
    - **EMERGENCY:** only *fresh* FULL/CLOSED excludes. Stale data never pushes a EMERGENCY patient further away.
3. **Exclude** every facility already in this case's referral chain (rejected, rerouted from, timed out, cancelled), and facilities with an active `FacilityUnavailability` for this specialty or for the whole ED (`until > now`).
4. **ETA:** `distanceKm / 30 * 60` minutes. Tunis traffic is slow; use the Maps API later.
5. **EMERGENCY:** sort by ETA only (after the exclusions above). **Otherwise:** ETA + the penalties above + 5 if the hospital is only on call without its own department.
6. **Fallback:** if nothing matches, return the nearest `hasGeneralEd` facilities with the reason "General emergency". The list is never empty.
6b. **Wait time:** add `estimatedWaitMin` (manual, §28.6) to the score when it is fresh.
7. **Assign the top-ranked hospital automatically** (the patient never chooses) and keep the next ones for re-matching. Store the **score breakdown** (`{ eta, availability, specialty, onCall, wait, total }`, stored in `Referral.scoreBreakdown` and shown to the patient as one line). Return them as `{ facilityId, departmentId, name, distanceKm, etaMinutes, reason, edPhone, lat, lng }`. Example reason: `"Cardiology · on duty tonight · 4.2 km · ~9 min"`.

---

## 24. Referrals and re-matching (`referrals/`)

Every hospital the case is sent to is one `Referral` row. The rows form a chain through `previousReferralId`, so the full path is always visible: *La Rabta (rejected: no specialist) → Charles Nicolle (accepted)*.

```
ReferralsService.send(case, facility, origin, previous?)        ← used by every path below
  1. Create Referral(SENT, origin, distanceKm, etaMinutes, matchReason,
                     previousReferralId, decisionDueAt = now + timeout(level, facility))
  2. Case.status = REFERRED
  3. ReportsService.createVersion(case, PRE_ARRIVAL)  (or reuse the latest version)
  4. live.emit(facilityId, 'referral.new', card)       → the dashboard rings
  5. schedule the backup alert (backupAlertAt = now + alertDelay(level, facility))
  6. notify patient ("Sent to <hospital>"); AuditLog("referral.sent")

assign(case)        ← PUT /cases/:id/location (or a level change to EMERGENCY / HIGH when the location is known)
  EMERGENCY → send(top-1 capable ED by ETA,             origin = AUTO_EMERGENCY)
  HIGH      → send(top-1 by ETA + availability + wait,  origin = AUTO_ASSIGN)
  LOW       → no referral (self-care advice)

Hospital decisions (dashboard, §28.3):
  accept(note, arrivalMode) → ACCEPTED, decidedBy/At, acceptNote, arrivalMode → push patient;
                              AMBULANCE → tracking.dispatchSimulated(referral) (§29.1); SELF → ask the patient to share live location (§29.2)
  requestInfo(question)     → INFO_REQUESTED + InfoRequest row → critical push to all the patient's devices;
                              decisionDueAt paused (extended by up to 10 min)
  reject(reason, unavail?)  → REJECTED + optional FacilityUnavailability → rematch(case, previous = this)
  reroute(target|auto, why) → REROUTED → send(target, origin = HOSPITAL_REROUTE, previous = this)
  timeout (cron)            → TIMED_OUT → rematch(case, previous = this)

rematch(case, previous):
  1. matching(case, exclude = every facility already in this case's chain) (§23)
  2. failed hospitals in chain ≥ 2 (≥ 1 for EMERGENCY) → stop re-matching:
       patient: "Go to the nearest emergency department / call 190" + nearest general ED
       admin: alert; AuditLog("referral.exhausted")
     else → send(next, origin = AUTO_REMATCH, previous)
  3. critical push to the patient's devices: "Go to <next> instead" (§26)

POST /chat/:referralId/messages { text, kind }   (patient ↔ ED chat, while referred)
  1. save ChatMessage (idempotent on clientRequestId) → live 'chat.message' to the hospital (ED + clinicians)
     and push to the other side (patient devices / on-duty staff)
  2. patient messages (incl. kind WORSE from "I feel worse") → AI rules check (safety net):
       AiClient.turn({ …, message, mode: 'monitor' })   ← rules + classifier only, no interviewer question
       critical rule fired → raiseLevel(automatic = true) (below) + RED_FLAG system message in the chat
       new facts in the message (e.g. "he has a fever") → new CaseState version (source AI_CHAT) + re-assessment
         + report UPDATE + system line "New information added to the case: fever" (§29.3)
       otherwise → the ED decides (no automatic level change)

POST /dashboard/referrals/:id/raise-urgency { level, reason, instruction?, alertTeam }   (ED, H17)
  → CasesService.raiseLevel(case, level, { by: staff, reason, instruction })

CasesService.raiseLevel(case, level, ctx):            (shared by ED escalation and the automatic red flag)
  1. refuse if level <= current level (409): only upward
  2. Escalation row + CASE.currentLevel = level + system/instruction messages in the chat
  3. critical push to the patient; EMERGENCY → patient Emergency screen with the instruction
  4. push to the hospital team (ED + clinicians); live 'case.escalated' (red row/card, sound)
  5. createVersion(UPDATE) report; AuditLog; LEARNING_EVENT(stage = escalation)
  6. hospital can't treat the new level (e.g. no cath lab) → the ED uses Reroute; never automatic here

PUT /cases/:id/location (patient corrects the location before acceptance)
  → active referral CANCELLED → live.emit(old facility, 'referral.cancelled')
  → assign again from the new location (origin = LOCATION_CORRECTED, previous = old)

POST /cases/:id/close { arrived } | POST /referrals/:id/arrived
  → Referral ARRIVED → treatment status → outcome → COMPLETED, Case CLOSED (§29)

Clinician override (§22):
  level raised so that the current hospital can't treat → rematch(origin = CLINICIAN_OVERRIDE)
  LOW → HIGH on an unreferred case → matching offered to the patient
```

**Concurrency:** two staff members may click at the same time, or the timeout cron may fire just as someone clicks. Every transition is a conditional update:

```ts
const res = await prisma.referral.updateMany({
  where: { id, status: { in: ['SENT', 'INFO_REQUESTED'] } },   // allowed "from" states
  data: { status: 'ACCEPTED', decidedById: user.sub, decidedAt: new Date(), acceptNote: note },
});
if (res.count === 0) throw new HttpError(409, 'ALREADY_HANDLED', 'This case was already handled');
```

The dashboard shows the 409 as "Already handled by <name> — refreshing".

---

## 25. Reports (`reports/` + AI `/report`)

### 25.1 Who writes what

The **AI service writes the content**: `POST /report` (§6.3) returns a **structured** clinical report generated by `ai/report.py` (an LLM working only from the state, assessment, decision and transcript it is given). The **backend owns everything around it**:

```
ReportsService.createVersion(caseId, kind):          // kind = PRE_ARRIVAL | UPDATE | CANCELLATION | PATIENT
  1. gather: latest CaseState, RiskAssessment, Decision, transcript, latest Review/Override, referral
  2. AiClient.report(...)      → structured report JSON
       └─ AI unavailable → build a minimal report from the stored data (no narrative),
                           marked "narrative unavailable", so the hospital still gets the facts
  3. merge in facts from OUR DB (never from the LLM): referenceCode, risk level + pFinal + uncertainty,
     triggered rules, versions, destination + ETA, review status
  4. save REPORT v+1 (author AI, status FINAL or DRAFT, accessTokenHash), audit
  5. render on demand: report.html (hospital), patient.html (patient), PDF, FHIR
```

**The clinician's draft:** in `CaseWorkspace`, the `ReportViewer` shows the latest version. A clinician edit saves a new version with `author = CLINICIAN` and `editedById`; the hospital always sees the newest FINAL version and a "reviewed by clinician" badge.

**When reports are generated:** a referral is created (PRE_ARRIVAL) · the level changes or an override happens (UPDATE) · the patient changes hospital (CANCELLATION for the old one) · on request (PATIENT version for `Report.tsx` / `/p/`).

**What the hospital report shows** (`templates/report.html`): headline `[EMERGENCY] HC-7K4P2Q — chest pain — ETA 9 min` · summary · timeline · positives / negatives · history, medications · vitals (with source) · red flags (triggered rules) · risk (level, `pFinal`, uncertainty) · clinician review status · recommended actions · open questions · transcript (appendix) · disclaimer · versions.

**The patient version** (`templates/patient.html`): plain-language summary, level, what to do now, the hospital and directions, reference code and QR. No `pFinal`, no internal rule ids.

### 25.2 The secure link

```ts
import { randomBytes, createHash } from 'node:crypto';

const token = randomBytes(32).toString('base64url');            // goes in the URL, never stored
const accessTokenHash = createHash('sha256').update(token).digest('hex'); // stored
const link = `${process.env.PUBLIC_BASE_URL}/r/${token}`;
```

`GET /r/:token`:
1. Hash the token and find the `Report` by `accessTokenHash`.
2. If it isn't found or `accessExpiresAt < now`, return 404 "Link expired". Don't reveal whether the link ever existed.
3. **Always show the latest version of that case.** If the requested report is older, show a banner: "A newer version exists (v3, EMERGENCY)", and render v3. For a CANCELLATION, show a clear "CANCELLED — patient going elsewhere" page.
4. Set `firstViewedAt` on the deliveries of this report if it is null, write `AuditLog("report.viewed")`, and send a push to the patient: "The hospital opened your report".
5. Headers: `Cache-Control: no-store`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`.

The **QR code** in the app is simply this link. Show the latest report's link.

### 25.3 PDF (pdfmake)

```ts
const docDefinition = {
  content: [
    { text: d.headline, style: 'h1', color: levelColor(d.triage.level) },
    { text: `${d.destination.facilityName} · ETA ${d.destination.etaMinutes} min` },
    { table: { widths: ['30%', '70%'], body: [
      ['Symptoms', d.clinical.symptoms.join(', ')],
      ['Onset / duration', `${d.clinical.onset} / ${d.clinical.duration}`],
      ['Severity', d.clinical.severity],
      ['History', d.clinical.history.join(', ')],
      ['Medications', d.clinical.medications.join(', ')],
      ['Red flags', d.triage.safetyReasons.join(', ')],
    ] } },
    { text: 'AI explanation', style: 'h2' }, d.triage.rationale,
    { text: d.disclaimer, italics: true, fontSize: 8 },
    { text: 'Transcript', style: 'h2', pageBreak: 'before' },
    ...d.transcript.map(t => `${t.at} ${t.sender}: ${t.text}`),
  ],
  defaultStyle: { font: 'NotoSans' },
};
```

**Arabic:** register **Noto Naskh Arabic** (or Amiri) for Arabic text. If the letters come out disconnected or reversed, render `report.html` with Puppeteer instead, which handles Arabic shaping. **Test this on day 1.** Patients will write in Arabic and Darija, and the transcript goes into the PDF.

### 25.4 FHIR R4 Bundle (built by hand, no library needed)

| Resource | From |
|---|---|
| `Patient` | sex, approximate birth year, language |
| `Encounter` | status `planned`, class `EMER`, `serviceProvider` = the hospital |
| `Observation` ×N | one per symptom |
| `RiskAssessment` | prediction = level + probabilities |
| `ServiceRequest` | priority `stat` / `urgent` / `routine`, performer = the hospital |
| `DocumentReference` | the secure link + the PDF |

Validate it once at https://validator.fhir.org.

---

## 26. Notifications: push on the person's phone and computer (`notify/`, `delivery/`)

**Rule:** Sahhanito sends **no email and no SMS**. Every notification is a **push notification to the person's own devices**: their **phone** and their **computer**. A person can have several devices; every active one receives the notification.

| Recipient | Phone | Computer |
|---|---|---|
| Patient | `mobile/` app → **Expo push** (FCM / APNs); or `patient-dashboard/` in the phone's browser → **Web Push** | `patient-dashboard/` → **Web Push** |
| ED staff, clinicians, managers | `hospital-dashboard/` in the phone's browser → **Web Push** | `hospital-dashboard/` → **Web Push** (also when the tab is closed, as long as the browser runs) |

### 26.1 What is notified, to whom

| Event | Patient | Hospital staff (of that hospital, on duty) | Clinicians | Critical |
|---|---|---|---|---|
| Emergency instructions / level raised to EMERGENCY | ✓ | ✓ (if referred) | ✓ (gate 2) | **yes** |
| New referral (`referral.new`) | — | ✓ ED staff | — | yes for EMERGENCY |
| No decision after `alertDelaySec` (**backup alert**) | — | ✓ **all** ED staff + clinicians of the hospital | — | yes |
| The hospital has a question | ✓ | — | — | **yes** |
| Patient answered | — | ✓ ED staff | — | no |
| Accepted (+ note) | ✓ | — | — | no |
| Rerouted / re-matched | ✓ | ✓ (new hospital) | — | **yes** |
| Case queued for review (UNCERTAIN, EMERGENCY, degraded) | — | — | ✓ | yes for EMERGENCY |
| Check-in "Did you arrive?" | ✓ | — | — | no |
| Availability stale | — | ✓ ED staff + manager | — | no |

### 26.2 Devices table and registration

```prisma
enum PushKind { EXPO WEB }

model PushSubscription {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  kind        PushKind
  expoToken   String?  @unique   // mobile app
  endpoint    String?  @unique   // Web Push
  p256dh      String?            // Web Push keys
  auth        String?
  deviceLabel String?            // "Chrome · Windows", "iPhone app"
  active      Boolean  @default(true)
  failures    Int      @default(0)
  lastSeenAt  DateTime @default(now())
  createdAt   DateTime @default(now())
  @@index([userId, active])
}
```

Endpoints: `GET /push/vapid-public-key` · `POST /push/subscriptions` (Expo token or Web Push subscription) · `DELETE /push/subscriptions/:id` · `GET /push/subscriptions` (the user's devices, shown in settings with "remove").

**Web Push in the two dashboards** (`public/sw.js` + `lib/push.ts`):

```ts
// lib/push.ts: call it from a button click ("Enable notifications"), never on page load
export async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  const reg = await navigator.serviceWorker.register('/sw.js');
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const { key } = await api.get('/push/vapid-public-key');
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key) });
  await api.post('/push/subscriptions', { kind: 'WEB', subscription: sub.toJSON(), deviceLabel: navigator.userAgent });
  return 'enabled';
}
```

```js
// public/sw.js: shows the notification even when no tab is open
self.addEventListener('push', (e) => {
  const d = e.data.json();
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, tag: d.tag, data: d, requireInteraction: !!d.critical, renotify: !!d.critical,
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  fetch(`/api/notifications/${e.notification.data.notificationId}/opened`, { method: 'POST', credentials: 'include' });
  e.waitUntil(clients.openWindow(e.notification.data.url));   // e.g. /board/ref_123 or /status/case_456
});
```

**Backend sending** (`notify/notify.service.ts`): `web-push` with VAPID keys for WEB, the Expo push API for EXPO.

```ts
async notify(userIds: string[], n: { type: string; title: string; body: string; url: string; critical?: boolean; caseId?: string }) {
  const subs = await this.prisma.pushSubscription.findMany({ where: { userId: { in: userIds }, active: true } });
  for (const s of subs) {
    const log = await this.prisma.notification.create({ data: { userId: s.userId, caseId: n.caseId, type: n.type,
      critical: !!n.critical, channel: s.kind, subscriptionId: s.id } });
    const payload = { ...n, notificationId: log.id, tag: `${n.type}:${n.caseId}` };
    try {
      if (s.kind === 'WEB') await webpush.sendNotification({ endpoint: s.endpoint!, keys: { p256dh: s.p256dh!, auth: s.auth! } },
                                                         JSON.stringify(payload), { urgency: n.critical ? 'high' : 'normal', TTL: 3600 });
      else await this.expo.send({ to: s.expoToken!, title: n.title, body: n.body, data: payload,
                                  priority: n.critical ? 'high' : 'default', channelId: n.critical ? 'critical' : 'default' });
      await this.prisma.notification.update({ where: { id: log.id }, data: { status: 'SENT', sentAt: new Date() } });
    } catch (e: any) {
      const gone = e.statusCode === 404 || e.statusCode === 410;              // Web Push: subscription expired
      await this.prisma.pushSubscription.update({ where: { id: s.id },
        data: gone ? { active: false } : { failures: { increment: 1 } } });
      await this.prisma.notification.update({ where: { id: log.id }, data: { status: 'FAILED', error: String(e.message) } });
    }
  }
}
```

Staff recipients are resolved from memberships: "ED staff of hospital X" = active `STAFF_MEMBERSHIP` rows with `facilityRole` ED_STAFF (and CLINICIAN for backup alerts).

### 26.3 Escalation without SMS (`notify-escalation`, every minute)

A **critical** notification not opened (`openedAt` null) is escalated:
1. **Re-send** to all the person's devices every 2 min, up to 3 times (`renotify`, `requireInteraction`, high priority).
2. **Staff:** widen the audience. A backup alert not opened in 2 min goes to **all** ED staff + clinicians of the hospital, then to the manager.
3. **Patient:** an in-app banner and the local reminders (§27.4). For EMERGENCY the instructions were already on screen.
4. **A person with no active device:**
   - **Staff:** the case is handled by the decision timeout + re-match (§28.5).
   - **Patient:** the case's live status page (`/p/`, §27.3) and the app show everything on next open. The dashboards show "patient has no notifications enabled" so ED staff know not to wait for an answer.

### 26.4 FHIR webhook (optional integration, not a notification)

`delivery/` keeps one channel type, **`WEBHOOK_FHIR`**, for hospitals with an IT system. It sends the report as a signed FHIR bundle, with retries (`ReportDelivery`, max 3):

```ts
const body = JSON.stringify(buildFhirBundle(report.data, link));
const sig = createHmac('sha256', channel.secret!).update(body).digest('hex');
const res = await fetch(channel.target, { method: 'POST',
  headers: { 'Content-Type': 'application/fhir+json', 'X-Signature': `sha256=${sig}`, 'X-Report-Id': report.id }, body });
```

For the demo, point it at https://webhook.site.

### 26.5 Limits to know

- **iPhone + web:** Web Push on iOS only works when the web app is **added to the Home Screen** (iOS 16.4+). iPhone patients should use the `mobile/` app, or install the patient dashboard as a PWA. Both dashboards ship a `manifest.webmanifest` so they are installable.
- **Computer:** web push arrives while the browser is running (no tab needed). On the ED PC, keep the browser open, ideally the dashboard installed as an app (PWA) and started with the session.
- **Permission must come from a click** ("Enable notifications"). Browsers block or hide prompts shown on page load.
- **Battery savers** on some Android phones delay push. Show the one-time settings tip (§27.2).

---

## 27. Staying connected after referral (even with the app closed)

**Goal:** once a patient is referred, the link between the patient, our backend and the hospital keeps working **if the app or the tab is closed, the phone is offline, or the app was removed**, using **push only** (no SMS, no email).

| Layer | Works with the app/tab closed? | Works offline? | What it gives |
|---|---|---|---|
| Server jobs (timeouts, re-matching, check-ins) | yes | n/a | the hospital side never depends on the patient's phone |
| **Push to the phone** (Expo, or Web Push from the browser) | yes | needs data | status, questions, reroutes, check-ins |
| **Push to the computer** (Web Push from `patient-dashboard/`) | yes, while the browser runs | needs data | same events on the patient's computer |
| Patient case page `/p/:token` (+ reference code) | any browser, no login | needs data | status, QR, call ED, questions, "symptoms changed", "I arrived" |
| Local notifications scheduled on the phone | yes | **yes** | check-ins and "have you arrived?" with no network |
| Offline cache (referral, QR, PDF, ED phone) | n/a | **yes** | everything needed at reception, in airplane mode |
| Offline outbox + idempotency | sends when back online | queues | actions never lost, never sent twice |
| Android sticky notification | yes | yes | one-tap access to the referral |

### 27.1 What happens when the patient closes the app

```mermaid
sequenceDiagram
    autonumber
    actor P as Patient phone + computer
    participant B as Backend
    participant H as ED dashboard
    Note over P,B: Referral created while the app was open:<br/>PDF + QR cached, local check-ins scheduled
    B->>H: case on the dashboard (+ web push to ED staff)
    H->>B: Request more info
    B->>P: critical push to every device (phone + computer)
    Note over B: not opened in 2 min
    B->>P: push again (renotify), up to 3 times + in-app banner
    P->>B: answers from the phone notification → app opens
    P->>P: local reminder (+30 min, offline OK): "How do you feel?"
    P->>B: "I'm worse" (outbox, idempotent)
    B->>H: level raised → card turns red + web push to ED staff
```

### 27.2 Mobile push done right

- **Use a development build, not Expo Go.** Remote push on Android is not available in Expo Go on recent SDKs. Build once with `eas build --profile development`, which needs the FCM credentials (`google-services.json`) for Android and an Apple developer account for iOS.
- **Android channels:** `critical` (importance MAX, sound) and `default`.
- **Register on every app start:** `getExpoPushTokenAsync()` → `POST /push/subscriptions { kind: 'EXPO' }`; listen with `addPushTokenListener`.
- **Opening from a killed state:** at startup, `getLastNotificationResponseAsync()` → navigate to `data.url`.
- **Opened:** a tap calls `POST /notifications/:id/opened` (stops escalation).
- **Receipts:** a job reads Expo receipts after ~15 min. `DeviceNotRegistered` → deactivate that subscription; the patient's other devices still receive.
- **Battery savers** (Xiaomi, Oppo, Huawei…): a one-time tip on the Status screen with `Linking.openSettings()`.

### 27.3 Patient case page + reference code

The patient's `/p/:token` link is **not sent anywhere**. It is shown in the app and on the patient dashboard as a button and a QR ("Open my case on another device"), so the patient can open it on a computer or a relative's phone.

**Case reference code** (`Case.referenceCode`):
- Generated once at case creation: `HC-` + 6 characters without look-alikes (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`), e.g. `HC-7K4P2Q`; `@unique`, regenerated on the rare collision.
- The same for the whole case, across reroutes.
- Shown on the Status screen (large, copyable), the `/p/` page, the report and PDF, the dashboard card and in staff push notifications ("[EMERGENCY] HC-7K4P2Q chest pain · ETA 9 min").
- ED staff can search it on the Board (only within their hospitals' cases).
- **An identifier, not a key**: on its own it opens nothing.

```ts
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function newReferenceCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return 'HC-' + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}
```

**`/p/:token`** (served by a Next.js route from `templates/patient.html`): reference code, hospital, ETA, directions, "Call ED", "Emergency 190", the hospital's decision, QR + PDF, open questions with answers, "My symptoms changed", "I arrived" / "I'm not going", and an **"Enable notifications on this device"** button (Web Push). The token is case-scoped, stored hashed, and expires 24 h after the case closes.

### 27.4 Local notifications (offline-proof)

When the referral is created, the mobile app schedules **on the phone itself**:
- check-ins at **+15, +30 and +60 min**: "How are you feeling? Tap if worse" (buttons **"I'm worse"** / **"I'm OK"**)
- at **ETA + 15 min**: "Have you arrived at La Rabta?" (**"I arrived"** / **"Not yet"**)

They fire even with the app killed and no network. Cancel them on arrival, close or hospital change.

### 27.5 Offline cache

At referral time, the app saves the referral JSON (hospital, ED phone, coordinates, ETA, report link, patient link) in AsyncStorage, the **PDF** in `FileSystem.documentDirectory`, and has the emergency text bundled. The QR is drawn from the stored link. At startup the app **shows the cached referral first**, then refreshes from `GET /cases/:id/sync`.

### 27.6 Offline outbox + idempotency (never lost, never twice)

**App side:** every patient action is first written to a local **outbox** with a `clientRequestId` (`Crypto.randomUUID()`), then flushed when online, when the network returns (`@react-native-community/netinfo`), on app start, and in the background (`expo-background-fetch`, best effort). Queued items show "Waiting for network". **Call 190 / Call ED** always work offline.

**Server side:** every mutating endpoint accepts `Idempotency-Key`:

```ts
const key = req.headers['idempotency-key'];
if (key) {
  const prev = await prisma.clientRequest.findUnique({ where: { key } });
  if (prev) return of(prev.response);           // retry → same answer, nothing redone
}
return next.handle().pipe(mergeMap(async (res) => {
  if (key) await prisma.clientRequest.create({ data: { key, userId, endpoint: req.path, response: res } });
  return res;
}));
```

### 27.7 Android sticky notification

While REFERRED: an ongoing local notification "Heading to La Rabta · ETA 9 min · tap for report" (`sticky: true`, `autoDismiss: false`), removed on close.

### 27.8 Server-side check-ins (`patient-checkins`, every 5 min)

While REFERRED, at ETA + 45 min with no patient contact: push "Did you arrive?" to all the patient's devices; again 30 min later. Never silently cancel the referral; auto-close after 24 h. Every patient touch updates `lastPatientContactAt`.

### 27.9 Session longevity

Patient tokens last **30 days**, so reopening the app hours later never shows a login screen mid-referral. The `/p/` link (saved or opened earlier on another device) works without login.

### 27.10 What cannot be guaranteed (say it honestly in the pitch)

- If the phone and the computer are both off or offline, nothing reaches the patient. **The hospital already has the case independently.**
- Push can be delayed by the OS or battery savers; critical pushes are therefore repeated (§26.3).
- Web Push on iPhone needs the web app installed on the Home Screen; desktop push needs the browser running.

---

## 28. Hospital dashboard: ED side (`hospital-dashboard/`, backend `dashboard/`, `live/`, `availability/`, `hospital-admin/`)

**Scope:** `hospital-dashboard/` is one React app with a layout per role. This section covers the ED side (Board, the four decisions, live updates, timeouts, availability, manager pages). Clinician supervision is in §22, and arrival / treatment / outcome in §29. Doctor assignment and beds stay in the hospital's own platform.

### 28.1 Screens

**Incoming board** (the screen that stays open on the ED PC):

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ HackCure ED · [Hôpital La Rabta ▼]           🔔 sound on      ● live      Dr. Ben Ali │
├─────────────────────────┬──────────────────────┬────────────────────┬────────────────┤
│ NEW (2)                 │ WAITING FOR PATIENT  │ ACCEPTED (3)       │ ARRIVED (5)    │
│ ┌─────────────────────┐ │ ┌──────────────────┐ │ ┌────────────────┐ │                │
│ │ EMERGENCY · M 54 · CARDIO │ │ │ HIGH · F 31    │ │ │ HIGH · M 12  │ │                │
│ │ Chest pain + dyspnea│ │ │ "Blood thinners?"│ │ │ ETA 4 min      │ │                │
│ │ ETA 9 min  · 4.2 km │ │ │ asked 1:20 ago   │ │ │ note: entr. B  │ │                │
│ │ decide in 2:41  ⏱   │ │ └──────────────────┘ │ └────────────────┘ │                │
│ │ [Accept][Info][✕][↪]│ │                      │                    │                │
│ └─────────────────────┘ │                      │                    │                │
└─────────────────────────┴──────────────────────┴────────────────────┴────────────────┘
  ▸ Refused / rerouted / cancelled today (4)
```

- Cards are sorted by level (EMERGENCY first), then ETA. A EMERGENCY card is red **and** labelled "EMERGENCY", never color alone.
- The countdowns show the **ETA** and the **time left to decide**, both computed in the browser from `etaAt` and `decisionDueAt`.
- New card: sound + browser notification (`Notification` API) + the tab title becomes "(2) New — HackCure ED".
- Each card shows the **reference code**. A search box finds a case by code within the hospital's own cases (e.g. when the patient arrives and says it).

**Case view** (a drawer opened by clicking a card):
- header: **reference code**, level, headline, ETA, distance, origin ("Rerouted from La Rabta: no cath lab")
- **summary block:** age/sex/pregnancy, symptoms + onset/duration/severity, red flags, history, medications
- AI block: level, explanation, uncertainty, model version, with the label "AI-assisted guidance"
- updates timeline (v1 sent, question asked/answered, level raised…)
- Q&A list
- transcript (collapsed), PDF, Print
- **the action bar:** `Accept` · `Request more info` · `Cannot receive` · `Reroute`

**Action dialogs:**

| Action | Dialog |
|---|---|
| **Accept** | optional note to the patient (e.g. "Use entrance B", "Bring your medications"). One click. |
| **Request more info** | template questions (FR/AR) or free text; answer type *yes/no · choice · text*. Several questions can be sent together. |
| **Cannot receive** | required reason: *No beds · Specialist unavailable · Equipment down · ED saturated · Other*, + optional "Mark us unavailable for [specialty ▼] for [1 h / 2 h / until …]" |
| **Reroute** | ranked list of capable hospitals (from matching, excluding us) with ETA and reason, or "Best available (auto)"; required reason |

Questions are translated for the patient. The staff member writes in French, and the patient sees the question in their language. Use the AI team's service if they offer translation; otherwise send templates in all 3 languages and free text as written.

### 28.2 Data the dashboard reads

`GET /dashboard/referrals?facilityId=…` returns cards:

```json
{
  "id": "ref_…", "caseId": "case_…", "referenceCode": "HC-7K4P2Q", "status": "SENT",
  "level": "EMERGENCY", "headline": "Chest pain + breathing difficulty",
  "patient": { "sex": "M", "age": 54, "pregnant": null, "language": "darija" },
  "specialty": "CARDIO", "etaAt": "2026-10-08T20:51:00Z", "distanceKm": 4.2,
  "decisionDueAt": "2026-10-08T20:45:30Z",
  "origin": "HOSPITAL_REROUTE", "fromFacility": "Hôpital La Rabta", "fromReason": "Specialist unavailable",
  "openInfoRequests": 0, "reportVersion": 1, "updatedAt": "…"
}
```

`GET /dashboard/referrals/:id` returns the card + the full `Report.data` + info requests + timeline.

### 28.3 Backend: the four actions

All four live in `DashboardService` and follow the same pattern:

1. Check that the user is a member of the referral's hospital (`AccessService`).
2. **Conditional status update** (from SENT / INFO_REQUESTED, or ACCEPTED for a reroute). Zero rows updated → **409 "Already handled"** (§24).
3. Side effects: patient notification, re-match or next referral, unavailability flag.
4. `live.emit(...)` to this hospital (and the next one for reroutes).
5. AuditLog with the actor, the reason and before/after.

```ts
async reject(user: StaffUser, id: string, dto: RejectDto) {
  const ref = await this.access.referralForStaff(user, id);                  // 404/403 if not theirs
  const ok = await this.prisma.referral.updateMany({
    where: { id, status: { in: ['SENT', 'INFO_REQUESTED'] } },
    data: { status: 'REJECTED', decidedById: user.sub, decidedAt: new Date(),
            decisionReason: dto.reason, decisionDetail: dto.detail },
  });
  if (!ok.count) throw new HttpError(409, 'ALREADY_HANDLED', 'Already handled');
  if (dto.unavailableFor) {
    await this.prisma.facilityUnavailability.create({ data: {
      facilityId: ref.facilityId, specialtyCode: dto.unavailableFor.specialty,
      reason: dto.reason, until: dto.unavailableFor.until, createdById: user.sub } });
  }
  this.live.emit(ref.facilityId, 'referral.status', { id, status: 'REJECTED' });
  await this.audit.log(user.sub, 'referral.reject', 'Referral', id, dto);
  await this.referrals.rematch(ref.caseId, ref);                             // next hospital + patient notified
}
```

**Request more info:**
- Creates an `InfoRequest` row (question, answerType, options, askedBy).
- Status → INFO_REQUESTED. `decisionDueAt` is extended by up to **10 min**, so the hospital isn't timed out while waiting for the patient.
- Sends a **critical** push to all the patient's devices, repeated until opened (§26.3).
- When the patient answers (`POST /info-requests/:id/answer`, from the app or the `/p/` page), the backend saves the answer, sets the status back to SENT with a fresh short `decisionDueAt` (e.g. 3 min), and emits `info.answered`.
- **No answer in 10 min:** the card shows "No answer from patient". The hospital still decides; if it doesn't, it times out like any other case.

### 28.4 Live updates with SSE, from zero

**The idea:** the dashboard opens **one long HTTP request** (`GET /dashboard/stream`). The server never closes it and writes a small text event into it whenever something happens. The browser's built-in `EventSource` reads those events and **reconnects automatically** if the connection drops. That's all "real time" means here. Actions (accept, reject…) are ordinary REST calls; only the notifications flow through the stream.

**The golden rule:** the database is the truth, and the stream only rings the bell. After every reconnect, the dashboard reloads the board with REST, so nothing is lost if the Wi-Fi drops.

**Backend: an event bus over Postgres + the SSE route (Next.js Route Handler)**

Events are produced by the web process (staff actions) **and** by the worker (timeouts, simulator). So the bus goes through Postgres `LISTEN/NOTIFY`, and every web process forwards events to its open streams.

```ts
// src/server/live/live.ts
import { Client } from 'pg';
type LiveEvent = { facilityId?: string; userId?: string; type: string; data: unknown };
type Sub = { facilityIds: string[]; userId?: string; send: (e: LiveEvent) => void };

const subs = new Set<Sub>();
let listener: Client | null = null;

async function ensureListener() {                       // one LISTEN connection per web process
  if (listener) return;
  listener = new Client({ connectionString: process.env.DATABASE_URL });
  await listener.connect();
  await listener.query('LISTEN live');
  listener.on('notification', (msg) => {
    const e = JSON.parse(msg.payload!) as LiveEvent;
    for (const s of subs) if ((e.facilityId && s.facilityIds.includes(e.facilityId)) || (e.userId && e.userId === s.userId)) s.send(e);
  });
}

export async function emit(e: LiveEvent) {              // callable from web or worker
  await prisma.$executeRaw`SELECT pg_notify('live', ${JSON.stringify(e)})`;   // payload < 8 KB: send ids, refetch details
}

export async function subscribe(sub: Sub) { await ensureListener(); subs.add(sub); return () => subs.delete(sub); }
```

```ts
// src/app/api/dashboard/stream/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route({ auth: 'staff' }, async (req, { user }) => {
  const facilityId = req.nextUrl.searchParams.get('facilityId');
  const mine = user.memberships.map((m) => m.facilityId);
  if (facilityId && !mine.includes(facilityId)) throw new HttpError(403, 'FORBIDDEN', 'Not your hospital');
  const ids = facilityId ? [facilityId] : mine;
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const write = (type: string, data: unknown) => controller.enqueue(enc.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
      const unsubscribe = await subscribe({ facilityIds: ids, send: (e) => write(e.type, e.data) });
      const ping = setInterval(() => write('ping', ''), 25_000);           // keeps proxies from closing it
      req.signal.addEventListener('abort', () => { clearInterval(ping); unsubscribe(); controller.close(); });
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
});
```

`/patient/stream` works the same way with `{ userId }` subscriptions (after the stream-ticket check, §20).

**Events:**

| Event | When | Dashboard does |
|---|---|---|
| `referral.new` | a case is sent to this hospital | add the card, sound, browser notification |
| `referral.status` | any status change (accepted by a colleague, timed out, cancelled…) | move or grey out the card |
| `referral.updated` | patient update / new report version / level raised | update the card; sound + highlight if the level went up |
| `info.answered` | patient answered | show the answer on the card |
| `referral.arrived` | patient or staff marked arrived | move to Arrived |
| `availability.updated` | a colleague changed availability | refresh the Availability page and the header summary |
| `availability.stale` | not confirmed within the threshold | yellow banner + browser notification |
| `ping` | every 25 s | nothing (keeps the connection alive) |

**Frontend: one hook**

```ts
// hospital-dashboard/src/lib/sse.ts
import { useEffect } from 'react';

export function useLive(facilityId: string, on: (type: string, data: any) => void, reload: () => void) {
  useEffect(() => {
    const es = new EventSource(`${API}/dashboard/stream?facilityId=${facilityId}`, { withCredentials: true });
    const types = ['referral.new', 'referral.status', 'referral.updated', 'info.answered', 'referral.arrived'];
    const handlers = types.map((t) => {
      const h = (e: MessageEvent) => on(t, JSON.parse(e.data));
      es.addEventListener(t, h);
      return [t, h] as const;
    });
    es.onopen = () => reload();          // first connect AND every reconnect → refetch the board
    return () => {                       // ALWAYS clean up, or events arrive 2×, 3×…
      handlers.forEach(([t, h]) => es.removeEventListener(t, h));
      es.close();
    };
  }, [facilityId]);
}
```

In the board component:

```ts
const [cards, setCards] = useState<Card[]>([]);
const reload = async () => setCards(await api.get(`/dashboard/referrals?facilityId=${fid}`));
useLive(fid, (type, data) => {
  if (type === 'referral.new') { playSound(); setCards((c) => upsert(c, data)); }
  else reload();                         // simplest correct approach: refetch on any other event
}, reload);
```

**Common mistakes:**

| Symptom | Cause | Fix |
|---|---|---|
| Stream returns 401 | `EventSource` can't send headers | httpOnly cookie + `withCredentials: true` + CORS `credentials: true` with an exact origin |
| Events stop after ~1 min behind nginx | proxy buffering / idle timeout | the 25 s `ping`; nginx `proxy_buffering off;` |
| Duplicate cards | listeners not removed | the cleanup in the hook |
| Missed a case while the Wi-Fi was down | relying on the stream only | `onopen` → reload (golden rule) |
| No sound | browsers block audio until the user clicks once | an "Enable sound" button on first load |
| Works with 1 backend instance, not 2 | the in-memory bus is per process | fine for the hackathon; later use Postgres `LISTEN/NOTIFY` or Redis pub/sub |

### 28.5 Timeouts and backup alerts (`jobs/`)

```ts
// worker/index.ts: cron.schedule('*/15 * * * * *', decisionTimeouts)
async function decisionTimeouts() {
  const due = await prisma.referral.findMany({
    where: { status: { in: ['SENT', 'INFO_REQUESTED'] }, decisionDueAt: { lt: new Date() } },
  });
  for (const r of due) {
    const ok = await prisma.referral.updateMany({
      where: { id: r.id, status: { in: ['SENT', 'INFO_REQUESTED'] } }, data: { status: 'TIMED_OUT' } });
    if (ok.count) { await live.emit({ facilityId: r.facilityId, type: 'referral.status', data: { id: r.id, status: 'TIMED_OUT' } });
                    await referrals.rematch(r.caseId, r); }
  }
}
```

Per-hospital settings on `Facility`: `decisionTimeoutEmergencySec` (default 180), `decisionTimeoutHighSec` (600) and `alertDelaySec` (120). The backup alert job sends a **critical web push to the phones and computers of all ED staff and clinicians** of the hospital (then the manager) when a case has been waiting longer than `alertDelaySec`. It is sent once per referral (`backupAlertSentAt`).

### 28.6 Availability, updated manually by the ED

Nothing is automated: there is no link to the hospital's bed-management system. **ED staff and the manager update availability by hand** on the **Availability** page, and matching uses what they enter.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Availability · Hôpital La Rabta                    last confirmed 20:12 by Dr. Ben Ali │
│ ⚠ Not updated for 3 h 40 — please check and confirm            [ Nothing changed ✓ ]   │
├───────────────────┬─────────────────────────────────┬─────────────┬────────────────────┤
│ Department        │ Status                          │ Free beds   │ Specialists on duty│
├───────────────────┼─────────────────────────────────┼─────────────┼────────────────────┤
│ Emergency (ED)    │ [Available][Limited][FULL][Closed] │  [-] 3 [+] │      [-] 2 [+]     │
│ Cardiology        │ [Available][LIMITED][Full][Closed] │  [-] 1 [+] │      [-] 1 [+]     │
│ Neurology         │ [Available][Limited][Full][CLOSED] │  [-] 0 [+] │      [-] 0 [+]     │
├───────────────────┴─────────────────────────────────┴─────────────┴────────────────────┤
│ Equipment:  CT [✓ working]   Cath lab [✕ down]   ICU [✓ working]                       │
│ Temporary blocks: Cardiology unavailable until 22:00 (set when refusing)   [End now]   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Per department:** status (*Available · Limited · Full · Closed*), free beds and specialists on duty. The general ED is a department with the specialty code `EMERG`.
- **Per equipment:** working / down.
- **One tap per change.** Each change saves immediately, stores who and when, and appends a `CapacitySnapshot` row (history).
- **"Nothing changed ✓"** refreshes all timestamps at once, so confirming takes 2 seconds.
- **Staleness:** if a hospital hasn't updated or confirmed for `availabilityStaleAfterMin` (default **240 min**), the dashboard shows a yellow banner and a browser notification asking for confirmation. Matching then treats the data as **unknown** (§23).
- Changes are broadcast with SSE (`availability.updated`) to the other screens of the **same** hospital.
- Patients see a short, non-sensitive summary on the hospital list: "Beds available · updated 20 min ago" or "Busy" (no exact numbers).

**How it differs from the temporary block (§28.3, "Cannot receive"):** the block is a quick time-boxed "stop sending us cardiology until 22:00", set in one click when refusing. Availability is the ED's ongoing picture. Matching respects both.

### 28.7 Hospital manager console

Each hospital is **managed by its own manager account** (a staff membership with the `MANAGER` role). Our platform admin only creates the hospital and its first manager; after that, the hospital runs itself.

| Page | The manager can |
|---|---|
| **My hospital** | edit the profile (name shown, address, ED phone, coordinates), decision timeouts (EMERGENCY / HIGH), the backup-alert delay, and the staleness threshold |
| **Departments & equipment** | add/remove departments (specialties), set "takes emergencies", add/remove equipment |
| **On-call schedule** | enter the hospital's own on-call shifts (garde) per specialty; overlapping shifts for the same specialty are rejected |
| **Staff** | create ED staff accounts (email + temporary password, must be changed at first login), set the role (ED staff / manager), deactivate, reset a password |
| **Alerts & integrations** | backup-alert delay and recipients (ED staff, clinicians, manager), staff devices with notifications enabled, optional FHIR webhook; "send test push" |
| **Availability** | same page as ED staff (§28.6) |
| **Statistics** | cases received, accepted / refused / rerouted / timed out, refusal reasons, median decision time, by day |
| **Audit** | every decision and change made by this hospital's accounts |

**Permissions:**

| Action | ED staff | Manager | Platform admin |
|---|---|---|---|
| See incoming board, Accept / Info / Cannot receive / Reroute | ✓ | ✓ | — |
| Update availability, equipment status, temporary blocks | ✓ | ✓ | — |
| Edit hospital profile, timeouts, departments, equipment list, on-call | — | ✓ (own hospital) | ✓ (support) |
| Manage staff accounts | — | ✓ (own hospital) | ✓ (first manager only) |
| Backup alert channels | — | ✓ | ✓ |
| Hospital statistics and audit | — | ✓ (own hospital) | ✓ (all) |
| Create a hospital, specialty / equipment reference lists | — | — | ✓ |

**Clinicians** (`facilityRole = CLINICIAN`) see the Board read-only and have full supervision rights (§22); they get no manager rights unless they also hold a MANAGER membership.

Every check uses the membership of **that** hospital, so a manager at La Rabta who is ED staff at a clinic is a manager only at La Rabta.

### 28.8 Project structure (`hospital-dashboard/src`)

- `lib/api.ts` (fetch with `credentials: 'include'`), `lib/sse.ts` (the `useLive` hook from §28.4), `lib/auth.ts` (session, current memberships, hospital switcher)
- `App.tsx`: routing + **role-based layout**. ED: Board, Handoffs, Arrival, Availability. Clinician: + supervision queue, CaseWorkspace, Metrics. Manager: + Admin, Metrics.
- Pages: `Login`, `Board`, `CaseWorkspace`, `Handoffs`, `Arrival`, `Availability`, `Admin`, `Metrics`
- Components: `RiskBadge`, `UncertaintyBar`, `RedFlagList`, `ContributionChart`, `StateEditor`, `TranscriptView`, `ReportViewer`
- Types from `@sahhanito/shared` (`case-state.ts`, `assessment.ts`, `status.ts`, `events.ts`)
- Hide links by role **and** enforce roles in the backend; the UI is never the security
- **Push:** `public/sw.js` + `lib/push.ts` + `manifest.webmanifest` (installable PWA); an "Enable notifications on this device" button after login, and a "My devices" list (§26.2)
- Target screens: 1366×768 ED PC and a 10" tablet; large buttons; FR first, AR/EN labels; `alert.mp3` in `public/`

---

## 29. Arrival mode, live tracking, arrival, outcome & export (`tracking/`, `referrals/`, `exports/`, `feedback/`)

### 29.1 Arrival mode: on their own or by ambulance (simulated)

When ED staff **Accept** a patient, they choose how the patient comes:

| Mode | What happens |
|---|---|
| **The patient comes on their own** (`SELF`) | The patient sees "Accepted — go to La Rabta, entrance B" + directions. Live tracking of the patient's phone starts if they agree (§29.2). |
| **We send an ambulance** (`AMBULANCE`, **simulated**) | The patient sees "An ambulance is coming · ETA 7 min · stay where you are" with the ambulance on a map. A simulated unit leaves the hospital, drives to the patient's confirmed location, waits, then drives back to the hospital. |

**Simulated ambulance (`tracking/ambulance.simulator.ts`):**
- On Accept with `AMBULANCE`, create an `AmbulanceDispatch` (unit name like `AMB-03`, origin = the hospital, pickup = the patient's confirmed location, `simulated = true`).
- **Route:** ask a free routing service (OSRM demo server or OpenRouteService) for the road polyline hospital → patient → hospital. Fall back to a straight line if it fails.
- **The simulator job** (every 2–3 s) moves the unit along the polyline at about 40 km/h. A `DEMO_SPEED_FACTOR` (e.g. ×10) makes it visible during the demo.
- **Status:** `DISPATCHED → EN_ROUTE_TO_PATIENT → AT_PATIENT` (pause 30–60 s) `→ TRANSPORTING → ARRIVED`.
- **Each tick:** stores a `TrackingPoint` (source `AMBULANCE_SIM`) and sends `tracking.position` + `ambulance.status` to the hospital and the patient.
- **On `ARRIVED`:** the referral is marked ARRIVED automatically (§29.4).
- **The UI always shows "SIMULATED"** next to the ambulance. Real ambulance services (SAMU 190) are out of scope.
- For EMERGENCY cases, the Accept dialog **pre-selects the ambulance**. The patient is still told to call 190 if things get worse.

### 29.2 Real-time tracking on the map

Once the patient is on the way, the hospital follows them live.

**Patient side (`mobile/`, `patient-dashboard/`):**
- At acceptance (mode `SELF`), the app asks: **"Share your live location with La Rabta until you arrive?"** Accepting starts tracking; refusing still works (the hospital sees the last confirmed location and the ETA).
- **Mobile:**
  - in the foreground: `Location.watchPositionAsync({ accuracy: High, timeInterval: 15000, distanceInterval: 50 })`
  - with the app in the background, if the patient grants "Always": `Location.startLocationUpdatesAsync` with a task (`expo-task-manager`) and the Android **foreground-service notification** "Sharing your location with La Rabta"
  - points are sent in batches; if offline, they go in the outbox
- **Web:** `navigator.geolocation.watchPosition` while the page is open.
- **Visible at all times:** a "Sharing location · Stop" bar. Stopping is always possible; the hospital then sees "Location sharing stopped".
- With an ambulance, the patient's location is also shared until pickup, so the ambulance goes to the right place.

**Backend (`tracking/` module):**
- `POST /tracking/:referralId/positions` takes a batch of `{ lat, lng, accuracyM, speed?, recordedAt }`, from the patient only, during an active referral
- stores `TrackingPoint` rows and updates `Referral.lastPositionAt`
- **recomputes the ETA** (road routing when available, otherwise distance ÷ average speed) and stores `etaAt`
- sends `tracking.position` to the hospital stream; sends `tracking.stale` if no point has arrived for 2 min
- **Geofence:** a point within 150 m of the hospital → "Patient at the door" on the dashboard, and an "Have you arrived?" prompt for the patient

**Hospital side (`Handoffs` map panel):**
- Leaflet + OpenStreetMap: the hospital marker, the patient or ambulance marker with its trail, the live ETA, "updated 10 s ago" (orange after 2 min)
- an **overview map** of all patients on their way to this hospital

**Privacy rules:**
- only the **referred hospital** sees the position, and **only during the trip**
- tracking stops automatically on arrival, cancellation, reroute or close
- positions are deleted **24 h after the case closes** (only the route length and duration are kept for statistics)

### 29.3 New information from the chat goes into the case

When the patient (or their companion) writes extra information in the chat, e.g. *"3andou skhana"* (he has a fever), the message is linked to the case and checked by the AI service in `monitor` mode (§24):
- new facts are added to the patient's structured state as a **new state version** (source `AI_CHAT`), and the risk is re-assessed
- the report gets a new version (UPDATE)
- the chat shows a system line "New information added to the case: fever"; the case drawer highlights what changed
- a critical red flag escalates automatically (H17 rules); anything else leaves the decision to the ED

**Purpose:** close the loop (steps 15–16, gate 4) without replacing the hospital's own systems. We track **that** the patient arrived, a **coarse** treatment status and the **outcome**, not who treats them or where.

### 29.4 `Handoffs.tsx` (accepted, on the way)

Accepted referrals of this hospital with an ETA countdown, the latest report version, a highlight when the level rose, and "patient marked arrived". Click → the case view.

### 29.5 `Arrival.tsx`

| Step | Action | Endpoint | Effects |
|---|---|---|---|
| Arrival | "Arrived" (or auto when the patient taps "I arrived", shown as *patient-reported*) | `POST /referrals/:id/arrived` | status ARRIVED, `arrivedAt`, live to patient ("Welcome, show code HC-…"), audit |
| Treatment | *In treatment · Admitted · Transferred · Discharged · Left without being seen* | `PUT /referrals/:id/treatment-status` | `treatmentStatus`, audit |
| Outcome | final level, disposition, diagnosis category (short list), optional diagnosis text and notes | `POST /referrals/:id/outcome` | `OUTCOME` row, referral COMPLETED, case CLOSED, `LEARNING_EVENT(stage = outcome)`, gate-4 `REVIEW` |

The outcome form is short (under 30 seconds). If nobody records an outcome within 48 h, the case appears in the hospital's "missing outcomes" list (Metrics), so learning data isn't lost silently.

### 29.6 Hospital feedback API (optional, for hospitals with an IT system)

```
POST /api/hospital-feedback
x-api-key: <per hospital>
{ "reference_code": "HC-7K4P2Q", "arrived": true, "treatment_status": "ADMITTED",
  "final_level": "HIGH", "disposition": "ADMITTED", "diagnosis_category": "cardio_acs" }
```

The backend checks the key against `Facility.apiKeyHash` and that this referral was sent to **this** hospital, then writes the same records as the dashboard with `source = API` and the raw payload.

### 29.7 Data export to the hospital's own system

Hospitals already use their own software (patient records, ED management). They must be able to **take the case data out of Sahhanito and load it there**.

**Per case** (export menu in the case drawer and on the Arrival page):

| Format | Content | Use |
|---|---|---|
| **FHIR R4 JSON** (Bundle) | `Patient`, `Encounter`, `Observation` (symptoms, vitals with source), `Condition` (red flags), `RiskAssessment` (level, `pFinal`), `ServiceRequest` (the referral), `Communication` (chat messages), `DocumentReference` (the PDF) | systems that import FHIR |
| **PDF** | the hospital report (§25) + the chat transcript | printing, attaching to a paper or scanned record |
| **CSV** (1 row) | reference code, dates, level, complaint, symptoms, arrival mode, arrival time, treatment status, outcome | spreadsheets, simple imports |

**Bulk export** (Admin → **Exports** tab, managers and ED staff):
- filters: period, status, level
- formats: **CSV** (one row per case), **FHIR NDJSON** (one Bundle per line), **ZIP of PDFs**
- generated in the background (`ExportJob`): QUEUED → RUNNING → READY, with a download link valid for 24 h

**Automatic push** (optional): the FHIR webhook (§26.4) sends each new or updated case to the hospital's system as it happens.

**Rules:**
- only staff of the hospital the case was referred to can export it
- every export is **audited** (who, what, when, format)
- files contain personal health data: links expire, files are deleted after 24 h, and nothing is exported for cases rerouted away from this hospital

**Endpoints:**
- `GET /exports/referrals/:id?format=fhir|pdf|csv`
- `POST /exports { facilityId, from, to, status?, level?, format }`
- `GET /exports/:id` (status + download URL)
- `GET /exports?facilityId=` (history)

**Open question:** which software do the target hospitals use, and what can it import (FHIR, HL7 v2, CSV)? HL7 v2 (ADT^A04) can be added later as another format.

---

## 30. Patient apps (`patient-dashboard/`, `mobile/`)

Both apps call the same endpoints and use the same flow: **Chat → (Emergency | Status) → InfoRequests → Report**, plus History. They share types from `@sahhanito/shared` and the same translation keys (`i18n/`: Arabic RTL, French, English).

| Flow step | Calls | Notes |
|---|---|---|
| **First open** | `POST /auth/anonymous`, `POST /push/subscriptions` | no login; language from the phone; one-tap consent; **notification permission asked immediately** after a one-line explanation (mobile: `Notifications.requestPermissionsAsync()`; web: the prompt needs a click, so it's on the "Start" button). Refusal never blocks |
| **Location** (before the hospital search) | `PUT /cases/:id/location` | `expo-location` `requestForegroundPermissionsAsync()` → `getCurrentPositionAsync({ accuracy: High })` (10 s timeout, else last known) → `reverseGeocodeAsync` for the address → map with pin + accuracy circle → **Confirm / Adjust** (drag the pin, search, neighborhood list). Web: `navigator.geolocation` + the same map. Accuracy > 200 m → open Adjust. EMERGENCY: use the first fix, confirm afterwards |
| **Chat** | `POST /cases`, `POST /cases/:id/messages` | switch on the response `kind`: `question` → bubble + quick replies · `emergency` → Emergency (replace) · `under_review` → "A clinician is reviewing…" · `result` → Status · `degraded` → safe message + call button |
| **Emergency** | `GET /cases/:id` | call 190, first aid, the hospital that got the case, ED phone, directions. **Hard-coded fallback** content works with no network |
| **Status** | `GET /cases/:id/sync`, facilities, referrals | `RiskBadge` + rationale; the **assigned hospital** (automatic) with why it was chosen, ETA, "From: <address> · correct"; `StatusTimeline` (Sent → Accepted → Arrived), reference code, QR, directions, "I feel worse", "I arrived" |
| **InfoRequests** | `POST /info-requests/:id/answer` | the hospital's questions; yes/no, choice or text |
| **Report** | `GET /cases/:id/report` (PATIENT kind) | patient-facing report + PDF |
| **History** | `GET /cases` | past cases with level, hospital and status; hide a case (`DELETE /cases/:id`) |

**Live updates:**
- Web: **Web Push** when the tab is closed (`public/sw.js`, `lib/push.ts`, PWA manifest, "Enable notifications" button, §26.2); `lib/sse.ts` → stream ticket → `EventSource('/patient/stream?ticket=…')`, reload state on every reconnect (same golden rule as §28.4).
- Mobile: **push** is the main channel (§27). While in the foreground, poll `GET /cases/:id/sync` every 5 s on the Status screen, or use an SSE library such as `react-native-sse`.

**Map:** `react-native-maps` (Apple Maps on iOS without a key; Android needs a Google Maps key in production) or MapLibre + OpenStreetMap tiles; Leaflet + OpenStreetMap on the web. Reverse geocoding: the phone's built-in geocoder (`reverseGeocodeAsync`) or Nominatim with caching.

**Mobile only (`mobile/src/lib`):** push registration, offline cache, outbox + `Idempotency-Key`, local check-in reminders, Android sticky notification (§27). Push needs a development build, not Expo Go (§27.2).

---

## 31. Learning & metrics (`backend/src/learning`, `Metrics.tsx`)

### 31.1 Learning events

Written at three stages, all anonymized (`LEARNING_EVENT`):

| Stage | When | Content |
|---|---|---|
| `assessment` | every AI assessment | scrubbed `CaseState`, language/script, age bucket, sex, `pNlp`, `sRule`, `pFinal`, AI level, uncertainty, versions |
| `review` | clinician approve / override / correction | + final level, `overridden`, (corrected state) |
| `outcome` | hospital records the outcome | + outcome level, disposition |

**Anonymization:** no ids (only `caseHash = HMAC(caseId, LEARNING_HASH_SECRET)`), no names, phones, coordinates or free-text transcript; age as a 10-year bucket; the state snapshot goes through the AI service's PII scrubbing (`preprocess.py`) before storage. Patients consent to this at onboarding (P1).

### 31.2 Metrics (`GET /learning/metrics`)

| Metric | Definition | Why it matters |
|---|---|---|
| **Emergency recall** | true EMERGENCY cases (by outcome, or clinician final level) that the AI flagged EMERGENCY | the safety metric |
| **Under-triage rate** | AI level lower than the final/outcome level | missed risk |
| Precision, F1 | per level | over-triage load on EDs |
| **Override rate** | overrides / reviewed cases, by direction (up / down) | trust and drift signal |
| **Calibration** | reliability curve of `pFinal` (10 bins) + Brier score | needed for the uncertainty thresholds |
| Per language / script | all of the above split by Darija-Arabizi / Darija-Arabic / French / English | finds the weak language |
| Missing outcomes | referrals ARRIVED > 48 h without an outcome | data quality |

`Metrics.tsx` shows them by period, hospital (managers see their own) and model version, so a new classifier or rule version can be compared with the previous one.

### 31.3 Export for the AI team

`GET /learning/export?from&to&format=jsonl` (admin only) produces one line per case with the last assessment, review and outcome joined by `caseHash`. It feeds `ai/scripts/fit_fusion.py` (recalibrate β0, β1, β2) and `train_classifier.py`. Each new model or rule version is deployed with its version in `/health` and stored in every assessment, so metrics can be compared by version.

---

## 32. Platform admin (`backend/src/admin`)

Hospitals manage themselves (§28.7). The platform admin:
- onboards a hospital and its first manager (`POST /admin/facilities`)
- maintains the specialty and equipment lists (codes shared with the AI service)
- sets system settings: uncertain-review timeout, re-match limit, degraded-mode message, the active model/rule versions reported by `/health`
- monitors: cases waiting for review, auto-escalated uncertain cases, stale hospitals, failed deliveries, missing outcomes
- exports anonymized learning data (§31.3) and searches the audit log

For the hackathon, the seed + **Prisma Studio** cover most of this.

---

## 33. Safety checklist (verify before the demo)

- [ ] An emergency on **any** turn shows the emergency screen immediately. The report is sent **after** the screen shows, never before.
- [ ] The emergency screen works with the backend down (hard-coded content).
- [ ] With the AI service stopped, the patient gets the fallback text and the call button.
- [ ] An EMERGENCY referral goes to the nearest **capable** hospital (specialty or on call, with the required equipment).
- [ ] Matching never returns an empty list.
- [ ] A delivery failure shows "call the ED" plus its number to the patient.
- [ ] Two cron runs never send the same report twice (atomic claim in `processOne`).
- [ ] Old secure links show the latest version or "cancelled". Expired links show "expired".
- [ ] A secure link token is not stored in the DB (only its hash) and is not written to logs.
- [ ] The feedback API refuses a report that wasn't sent to that hospital.
- [ ] Demo webhooks go to webhook.site, **never to real hospitals**. No email or SMS code paths exist.
- [ ] Arabic renders correctly in the apps, the PDF, push notifications and the report page.
- [ ] Kill the app: "hospital opened your report" still arrives as a push, and tapping it opens the referral screen.
- [ ] Close the patient tab on the computer: a critical push still appears on the computer and the phone; clicking it opens the right page.
- [ ] Airplane mode: the referral screen shows the hospital, QR, PDF and call buttons. A local check-in reminder still fires.
- [ ] Send "symptoms worse" offline, then reconnect: the hospital gets **exactly one** UPDATE.
- [ ] Critical push not opened → re-sent (max 3); a staff backup alert widens to all ED staff + clinicians, then the manager.
- [ ] An expired Web Push subscription (410) is deactivated and the user's other devices still receive.
- [ ] A new case appears on the right hospital's dashboard within 2 s, and **never** on another hospital's.
- [ ] Two staff members click Accept at the same time: one wins, the other sees "Already handled".
- [ ] Cannot receive / Reroute / timeout always produce a next hospital, never the same one twice. After 2 failures (1 for EMERGENCY), the patient gets the "nearest ED / 190" message.
- [ ] A EMERGENCY patient is never asked to wait for acceptance.
- [ ] Unplug the dashboard's network for 30 s and reconnect: the board reloads and shows what arrived meanwhile.
- [ ] After a reroute, the first hospital no longer sees the full report.
- [ ] "Unavailable for Cardiology 2 h" stops cardiology cases reaching that hospital until it expires.
- [ ] Setting Cardiology to Full (fresh) stops cardiology cases. The same data 5 h old is treated as unknown, not available.
- [ ] A EMERGENCY patient is never moved further away because of **stale** availability.
- [ ] ED staff can't open manager endpoints (call `/hospital/:fid/staff` with an ED account → 403).
- [ ] A manager of hospital A can't edit hospital B (→ 403).
- [ ] A deactivated account loses access immediately, including the live stream.
- [ ] An EMERGENCY decision shows the emergency screen **before** any clinician review or hospital decision.
- [ ] A critical rule always yields EMERGENCY, even when `pNlp` is low (unit tests in `ai/tests`, integration test in the backend).
- [ ] UNCERTAIN is never shown to the patient as Low; without review it becomes HIGH at `reviewDueAt`.
- [ ] A clinician state correction creates a new state version and a new assessment; the AI's original is still visible.
- [ ] Approve/override on an outdated assessment returns 409 ("risk changed, re-check").
- [ ] Overriding down from EMERGENCY requires confirmation + a reason, and appears in Metrics.
- [ ] With the `ai` container stopped: degraded message + 190, the case in the clinician queue, "AI degraded" banner; after restart the case is re-run.
- [ ] The hospital report always shows the risk and red flags from the stored assessment, even if the LLM narrative is missing.
- [ ] Vitals in the state always show their source (patient / clinician).
- [ ] Learning export contains no names, phones, ids, coordinates or raw transcript.
- [ ] A patient's SSE stream only ever receives events for that patient's cases (try another case id → 403).
- [ ] First open: the chat is usable in under 5 s with no login; refusing notifications still lets the patient continue.
- [ ] Refusing location → the Adjust screen (search / neighborhood) works and the hospital list is computed from it.
- [ ] GPS accuracy > 200 m → the app asks to check the location before searching.
- [ ] EMERGENCY with location not yet confirmed: the case still goes to the nearest capable ED from the first fix, and "Change" re-matches.
- [ ] Rate limits stop one device from creating dozens of cases.

---

## 34. Task checklist (by folder, in build order)

### Milestone 1: skeleton
- [ ] Root npm workspaces + `packages/shared` (case-state, assessment, status, events)
- [ ] `docker-compose.yml`, `.env.example`, `README.md`
- [ ] `backend`: Next.js API skeleton (`route()` wrapper, Zod, errors, CORS) + `worker/` + Prisma schema + seed (hospitals, staff, demo patients)
- [ ] `ai-stub`: `/turn`, `/report`, `/health` with the demo conversations
- [ ] Agree `ai/schemas.py` ↔ `packages/shared` with the AI team (§6); write `docs/contracts.md`

### Milestone 2: triage loop
- [ ] `auth` (patient JWT, staff cookie, memberships, `AccessService`)
- [ ] `ai` client (timeout, retry, degraded mode) + `cases` triage loop (§21.2)
- [ ] `live`: `/patient/stream` (ticket) + `/dashboard/stream`
- [ ] `patient-dashboard`: Chat, Emergency, Status
- [ ] `mobile`: Chat, Emergency, Status

### Milestone 3: supervision
- [ ] `supervision` endpoints + `uncertain-timeout` job
- [ ] `CaseWorkspace`: TranscriptView, StateEditor, risk over time, RiskBadge, UncertaintyBar, RedFlagList, ContributionChart, approve/override panel

### Milestone 4: hospitals
- [ ] `matching` (score breakdown) + `referrals` chain + `dashboard` actions + `jobs` (timeouts, backup alerts)
- [ ] `reports` via AI `/report`, templates, PDF, secure links; `ReportViewer`
- [ ] `Board`, `Handoffs`, `InfoRequests` (both patient apps)
- [ ] `Arrival` + outcome; `feedback` API

### Milestone 5: operations & learning
- [ ] `availability` + `Availability.tsx`; `hospital-admin` + `Admin.tsx` (staff accounts first)
- [ ] `learning` events + metrics + export; `Metrics.tsx`
- [ ] `notify`: Expo push + Web Push (VAPID, `sw.js`, subscriptions, escalation); `delivery` (FHIR webhook); offline features (§27)
- [ ] `audit` everywhere; `History.tsx`
- [ ] Swap `ai-stub` → `ai`; run the safety checklist; rehearse `docs/demo-script.md`

---

## 35. Open questions

1. **Clinician staffing:** who are the supervising clinicians? Network clinicians on duty for the platform, each hospital's own clinicians, or both? What review time can they guarantee (the uncertain timeout depends on it)?
2. **Thresholds in `ai/safety.py`:** the `pFinal` cut-offs for EMERGENCY / HIGH / LOW and the uncertainty rule must be set for **high emergency recall**, then validated by a clinician on the Tunisian test set.
3. **Vitals:** which ones do we ask patients for (temperature, SpO₂ if they own an oximeter, glucose for diabetics)? Patient-reported values must never lower the risk on their own.
4. **Report review:** should a clinician approve every report before it reaches the hospital (slower), or only EMERGENCY / overridden cases? The current design: reports go out automatically, and clinician edits create a new version.
5. **Outcome categories:** the short list of diagnosis categories for the outcome form; it must match what the AI team can learn from.
6. **Data protection:** consent wording for clinician access, hospital sharing and anonymized learning (Tunisian law 2004-63 / INPDP). Where is the database hosted?
7. **Hospital devices:** which ED computers/phones will have notifications enabled, and who receives backup alerts?
8. **Decision timeouts and staffing:** are 3 min (EMERGENCY) / 10 min (HIGH) realistic? Who watches the Board?
9. **Translation of hospital questions** to Darija/Arabic/English: through the AI service, or templates only?
10. **Emergency numbers:** verify SAMU 190 / Protection civile 198 and the first-aid content with a clinician.
11. **iPhone patients on the web:** Web Push requires adding the patient dashboard to the Home Screen; do we push iPhone users to the mobile app instead?
12. **Availability updates:** every 4 h or at each shift change; should patients see availability at all?
13. **Chat safety net (AI team):** can `/turn` support `mode: "monitor"` for patient chat messages (rules + classifier only, fast)? Which rules are "critical" enough to escalate automatically without the ED?
14. **Chat translation:** an AI `/translate` endpoint to show Darija/Arabizi ↔ French translations in the chat?
15. **Hospital software:** which systems do target hospitals use, and which import format do they accept (FHIR, HL7 v2, CSV)?
16. **Live tracking consent:** wording for background location sharing; is "Always" permission acceptable for the target users, or foreground-only?
