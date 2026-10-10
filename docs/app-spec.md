# Triage App — Product & Backend Spec

As of 2026-10-08. Based on the final 16-step "AI-Powered Medical Triage System" architecture.

This spec covers the **mobile app, the backend, how the services connect, and report generation and delivery**. The NLP/ML model belongs to the AI team.

**Key assumption:** the app has **no interaction with doctors or hospital staff**. It triages the patient, picks the right hospital among all major hospitals of Grand Tunis, and **sends the report**. The hospital receives it and manages the patient's state and staffing **in its own existing tools**.

---

## 1. Ownership: who builds which step

| Step (infographic) | Owner | In our scope |
|---|---|---|
| 1 Patient message | **App** (mobile + backend) | text input, language, session |
| 2–5 Preprocessing, NLP, state, validation | AI service | the backend stores each result |
| 6 LLM follow-up | AI service generates the question; **App** displays it | |
| 7 Rule-based safety engine | AI service (recommended) | the app reacts to an emergency at **any** turn (§7) |
| 8–9 ML classifier, decision policy | AI service | returns one action + level + specialty |
| 10 Triage output & explanation | **App** | |
| 11 Smart facility matching | **Backend** | all Grand Tunis hospitals: departments, on-call schedule (garde), equipment, ETA |
| 12 Pre-arrival case generation | **Backend** | report JSON → PDF + FHIR + secure link |
| 13 Hospital handoff | **Backend**, **one-way** | report delivered by email / FHIR webhook / SMS link, plus a QR code the patient carries |
| 14 Pre-arrival monitoring | **Backend + mobile** | the patient reports changes, gets re-scored, and an updated report is sent |
| 15 Hospital arrival & outcome | **Hospital's own tools** | optional: receive the outcome via an API if a hospital offers it |
| 16 Feedback loop | Backend stores the data; the AI team consumes it | depends on step 15 data |
| Human supervision gates 1–4 | **Hospital side**, outside our app | see §7 for what this means for safety |

### Changes from the infographic (tell the team)

- **Step 13 becomes one-way.** There is no hospital dashboard and no Accept / Request info / Cannot receive / Reroute buttons. The hospital simply receives the report.
- **Step 15 and the review gates happen at the hospital,** in its own tools. Our app has no clinician users.
- **Step 16** needs real outcomes. Without hospital feedback, the AI team only gets AI predictions and patient-reported arrival. This is an open question (§9).

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Patient mobile app | **React Native + Expo** (TypeScript) | Android + iOS, RTL for Arabic, easy push notifications |
| Backend API | **NestJS + PostgreSQL + Prisma** (TypeScript) | modules, validation, typed DB access |
| AI | **FastAPI (AI team)**, internal only | only the backend calls it |
| Email delivery | Nodemailer + SMTP (Mailtrap or Gmail for the demo) | |
| PDF | pdfmake, or Puppeteer if Arabic shaping is an issue | |
| Secure report page | served by NestJS (one HTML template) | the hospital opens it in any browser, with no login |
| Admin | **Prisma Studio** for the hackathon; a small admin web app later | the hospital directory is mostly seed data |
| Background jobs | `@nestjs/schedule` (cron) | delivery retries, link expiry |
| Push to patient | Expo Push | |

**Not needed any more:** Socket.IO and real-time chat, the hospital dashboard, staff accounts. The patient's screens update from REST responses and push notifications.

---

## 3. How the services connect

```
┌────────────────┐   HTTPS REST    ┌──────────────────────────────┐  internal HTTP  ┌──────────────────┐
│ Patient app    │ ──────────────▶ │ Backend (NestJS)             │ ──────────────▶ │ AI service       │
│ (Expo)         │ ◀── push ────── │ cases · matching · referrals │ ◀────────────── │ (FastAPI) 2–9    │
└────────────────┘                 │ reports · delivery · audit   │                 └──────────────────┘
                                   └──────┬───────────┬───────────┘
                                          │           │  email (PDF + secure link)
                                   ┌──────▼─────┐     │  FHIR webhook (JSON, signed)
                                   │ PostgreSQL │     │  SMS (secure link)
                                   └────────────┘     ▼
                                              ┌──────────────────────┐
                                              │ Hospitals' own tools │
                                              │ (no login to our app)│
                                              └──────────┬───────────┘
                                                         │ opens  https://…/r/<token>
                                                         ▼
                                              Secure report page (read-only)
```

### Contract with the AI service (agree on this first)

`POST /v1/triage/turn`

```json
{
  "case_id": "uuid",
  "turn": 3,
  "message": "n7ess rou7i mkhanou9",
  "language_hint": "darija",
  "previous_state": { "...": "the state returned last turn, or null" },
  "patient_context": { "age": 54, "sex": "M", "pregnant": null }
}
```

Response:

```json
{
  "language": "darija",
  "state": {
    "symptoms": [], "onset": "", "duration": "", "severity": "",
    "medical_history": [], "medications": [], "uncertainty": [], "evidence": []
  },
  "state_version": 3,
  "missing_fields": ["duration"],
  "safety": { "triggered": true, "reasons": ["chest pain + breathing difficulty"] },
  "classification": {
    "probs": { "low": 0.08, "moderate": 0.17, "high": 0.60, "emergency": 0.15 },
    "uncertainty": 0.21
  },
  "decision": {
    "action": "EMERGENCY",
    "level": "RED",
    "suggested_specialty": "CARDIO",
    "required_equipment": ["CATH_LAB"],
    "rationale": "Chest pain with breathing difficulty is a red flag.",
    "rationale_localized": "..."
  },
  "next_question": null,
  "quick_replies": null,
  "model_version": "nlp-0.3.1+clf-0.2.0+rules-2026-10-01"
}
```

Rules:
- `next_question` is non-null only when `action == ASK_FOLLOWUP`.
- `suggested_specialty` and `required_equipment` use the codes in our `Specialty` / `Equipment` tables.
- There is a 10 s timeout. On a timeout or error, the patient gets a safe fallback message plus the emergency number, never a spinner.

---

## 4. Actors

| Actor | App | Main job |
|---|---|---|
| Patient | Mobile | describe symptoms, get guidance, go to the right hospital with the report sent ahead |
| Hospital (organization) | none, receives reports in its own tools | read the report before the patient arrives |
| Our team (admin) | Prisma Studio / small admin page | maintain the hospital directory, delivery channels and on-call schedule; watch delivery failures |

---

## 5. User stories

Format: **ID — As a … I want … so that …** followed by acceptance criteria (AC). The infographic step is in brackets.

### Patient (mobile)

**P1 — Onboarding & consent.** As a patient I want to pick my language (French, Arabic or Darija) and accept a short consent notice, so that I understand this is guidance and that my report will be sent to a hospital.
- AC: Arabic switches the layout to RTL. The consent explicitly mentions sharing the report with the chosen hospital. Consent is stored with its version and a timestamp. Age, sex and pregnancy are optional.

**P2 — Describe symptoms [1].** As a patient I want to type my problem in my own words, including Arabizi, so that I don't fill out a medical form.
- AC: Text only, 1–1000 characters, a "thinking" state, retry on failure without losing the text.

**P3 — Answer follow-up questions [6].** As a patient I want only the questions that matter, in my language, so that triage is quick.
- AC: A chat thread with quick-reply buttons when provided. At most N rounds.

**P4 — Emergency interrupt [7, 9].** As a patient with red-flag symptoms I want to be told **immediately** to call 190, so that I don't lose time.
- AC: An emergency result at **any** turn shows a full-screen red emergency screen with one-tap calling (190) and first aid in my language. In parallel, the backend auto-selects the nearest capable emergency department and **sends the report automatically**. The screen shows "Report sent to <hospital>" and the ED phone number. It works even if the backend is down (hard-coded number and text).

**P5 — Understand my result [10].** As a patient I want my urgency level and a plain-language explanation, so that I know why I'm going somewhere.
- AC: Level shown as color + text, the action, the localized rationale and a disclaimer.

**P6 — Choose a hospital [11].** As a patient I want the 3 best hospitals in Grand Tunis for my problem, with distance, ETA and the reason, so that I go to one that can treat me.
- AC: Location permission with a fallback to picking a neighborhood. Each option shows its reason ("Cardiology on duty tonight · 4.2 km · ~9 min") and a "Directions" button. One option is marked "Recommended".

**P7 — Send my report ahead [12, 13].** As a patient I want my report sent to the hospital I chose, so that they are ready when I arrive.
- AC: Tapping "Go to this hospital" creates the referral and sends the report. The patient sees the delivery status (*Sending → Sent → Seen by hospital* when the link is opened). On failure, the app says so and shows the ED phone number.

**P8 — Carry my report.** As a patient I want a QR code and the PDF of my report, so that the reception desk can see it even if they missed the email.
- AC: The QR code encodes the secure link. The PDF is viewable offline after the first download.

**P9 — Report changes on the way [14].** As a patient I want to tell the app if I feel worse, so that my urgency is updated and the hospital gets the update.
- AC: A "My symptoms changed" button is visible while referred. A re-score that goes up sends an UPDATE report through the same channel. If the result is now an emergency, the emergency screen shows.

**P10 — Change hospital.** As a patient I want to switch to another hospital (e.g. it's closer to where I am now), so that the right hospital gets my report.
- AC: The old hospital receives a CANCELLATION notice and the new one receives the report. The referral chain is kept.

**P11 — Arrived / close.** As a patient I want to mark "I arrived" or "I didn't go", so that the case closes.
- AC: The case closes. Without any action, it auto-closes after 24 h and the secure link expires.

**P12 — My cases.** As a patient I want to see my past cases and reports.

### Hospital (no app; receives only)

**H1 — Receive the report [13].** As a hospital I want the pre-arrival report in a channel we already use, so that we can prepare without a new tool.
- AC: Per hospital, one or more delivery channels: email (PDF attached + secure link), FHIR R4 webhook (signed JSON), or SMS (secure link). The subject or first line reads, e.g., "[RED] Pre-arrival — chest pain — ETA 12 min".

**H2 — Receive updates [14].** As a hospital I want updates and cancellations clearly marked, so that we don't confuse versions.
- AC: "UPDATE v2 — level raised to RED" / "CANCELLED — patient going elsewhere". The secure link always shows the latest version and marks older ones.

**H3 — Open the report without an account.** As hospital staff I want to open the link in any browser, so that no login or installation is needed.
- AC: A read-only, mobile-friendly page that is printable. The link expires after 24 h. Opening it is logged (`firstViewedAt`).

**H4 — (Optional) Send outcomes back [15].** As a hospital with an IT system I can send arrival and outcome data to an API, so that the triage model improves.
- AC: `POST /api/hospital-feedback` with an API key per hospital. The payload is stored as-is plus normalized fields.

### Our team (admin)

**A1 — Hospital directory.** Maintain hospitals, departments, equipment and the on-call schedule (seed + Prisma Studio for the demo).
**A2 — Delivery channels.** Set each hospital's channels, and send a "test delivery".
**A3 — Delivery monitoring.** See failed deliveries and retry them, and see which reports were never opened.
**A4 — Audit & export.** Search the audit log, and export AI results plus patient-reported arrival plus hospital feedback for the AI team [16].

---

## 6. Necessary elements

### 6.1 Mobile screens

1. Language picker
2. Consent + basic profile
3. Home ("Describe your problem" + my cases)
4. Triage chat
5. **Emergency screen** (interrupts anything; shows the hospital that got the report)
6. Result & explanation
7. Hospital list + map
8. **Referral screen:** the hospital, directions, delivery status, QR code, PDF, "Symptoms changed", "Change hospital", "I arrived"
9. Case history
10. Settings

### 6.2 Web pages (served by the backend, no frontend project needed)

- `GET /r/:token`: the secure report page (read-only, printable, latest version)
- Admin: Prisma Studio for the demo; optionally a small admin page for delivery monitoring

### 6.3 Data model

See `database-schema.md`: `User`, `Facility`, `Specialty`, `Department`, `Equipment`, `FacilityEquipment`, `OnCallShift`, `DeliveryChannel`, `Case`, `Message`, `AiResult`, `Referral`, `Report`, `ReportDelivery`, `HospitalFeedback`, `AuditLog`.

### 6.4 API endpoints

```
POST  /auth/login                     GET/PATCH /me

POST  /cases                          → create case (first message)
POST  /cases/:id/messages             → patient turn → AI → question | result | emergency
GET   /cases   GET /cases/:id
GET   /cases/:id/facilities?lat&lng   → top 3 matches
POST  /cases/:id/referrals {facilityId}     → referral + report + delivery
POST  /cases/:id/update {text}        → re-score; UPDATE report if needed
POST  /cases/:id/close {arrived}
GET   /cases/:id/report.pdf           GET /cases/:id/referral (status + delivery + QR link)

GET   /r/:token                       → secure report page (public, token-protected)
GET   /r/:token/pdf  GET /r/:token/fhir

POST  /api/hospital-feedback          → optional, API key per hospital

Admin (role ADMIN): /admin/facilities, /admin/channels, /admin/channels/:id/test,
                    /admin/deliveries?status=FAILED, /admin/deliveries/:id/retry,
                    /admin/on-call, /admin/audit, /admin/export
```

### 6.5 Background jobs (cron)

- `deliver-reports` (every 30 s): sends QUEUED deliveries and retries FAILED ones (max 3 attempts, then tries the next channel)
- `close-stale-cases` (hourly): auto-closes referred cases after 24 h and expires their links

### 6.6 Notifications to the patient (Expo push)

"Report delivered to Charles Nicolle", "The hospital opened your report", "Delivery failed — call the ED: 71 xxx xxx".

---

## 7. Safety rules

1. **Emergency wins, at every turn.** The emergency screen interrupts everything. The report goes out automatically to the nearest capable ED.
2. **AI down = safe fallback:** the emergency number plus a retry, never silence.
3. **Never rely on one delivery channel.** Retry, fall back to the next channel, and the patient always carries the QR code and PDF.
4. **Delivery failure is visible** to the patient (with the ED phone number) and to the admin.
5. **No human reviews the AI in our app.** That makes the safety rules and the emergency path critical, and the app must always present results as guidance, with the hospital making the clinical decisions. Say this explicitly in the consent text and the pitch.
6. **Privacy:** reports go only to the chosen hospital, after consent. Secure links are random tokens, stored hashed, expiring and read-only. All traffic is HTTPS. The AI service is not public.
7. **Store everything needed to replay a decision:** AI request and response, model version, report versions, delivery log.

---

## 8. MVP cut and build order

**Must have (demo path):** P1–P8, H1, H3, the secure report page, email delivery, PDF.
**Nice to have:** P9–P11, H2 updates and cancellations, the FHIR webhook, SMS, H4 feedback API, the admin delivery page.
**Mock:** ETA (straight line ÷ 30 km/h), auth (phone login without OTP), the AI service (a stub with 3 scripted scenarios).

Order:
1. Agree the AI contract; build the stub.
2. Backend skeleton + Prisma + seed of the Grand Tunis directory.
3. Triage turn end-to-end + mobile chat + emergency screen.
4. Matching + hospital list.
5. Referral → report → PDF → secure page → email delivery.
6. Referral screen (status, QR, PDF).
7. Updates, cancellation, close; FHIR; feedback API.
8. Swap in the real AI service.

---

## 9. Open questions

1. **How does each hospital want to receive reports?** An ED email inbox, an SMS to the ED phone, or an existing API? This decides which channel is real and which is demo-only.
2. **Who validates the AI if there is no clinician in our app?** Is "guidance only + hospital decides" acceptable to the jury and the team? Does any hospital want a reviewer role later?
3. **Step 16 ground truth:** without hospital feedback, the only signal is patient-reported arrival. Can at least one hospital agree to send outcomes, even as a spreadsheet?
4. Do the safety rules and decision policy (7, 9) live in the AI service? Does it check red flags **before** asking follow-ups?
5. Emergency numbers to show: verify SAMU 190 and Protection civile 198.
6. Legal: patient consent wording for sharing health data with a hospital (Tunisian law 2004-63 on personal data, and INPDP). Check with a mentor.
