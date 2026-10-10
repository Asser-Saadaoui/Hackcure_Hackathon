# Implementation Guide — App, Backend, Integration, Reports

This is the "how to build it" guide for my part: everything except the NLP/ML model. Read `app-spec.md` (what to build) and `database-schema.md` (diagrams) first.

**Scope reminder:** there is no doctor or hospital-staff interaction in our app. We triage, match a hospital in Grand Tunis, and **deliver the report**. Hospitals manage the patient in their own tools.

Stack: **Expo (React Native) + NestJS + PostgreSQL/Prisma**, with the **FastAPI AI service** owned by the AI team. There is no Socket.IO and no web frontend project.

---

## 0. What "done" looks like (the demo script)

1. A patient opens the app, picks Darija and types *"n7ess rou7i mkhanou9 w sderi yo9jani"*.
2. The app shows a follow-up question; the patient answers.
3. **Scenario RED:** the app shows the full-screen emergency screen ("Call 190"). Within seconds it also shows "Report sent to Hôpital La Rabta (Cardiology on duty) · ED 71 xxx xxx". The team's "La Rabta" inbox receives an email: **[RED] Pre-arrival — chest pain — ETA 9 min** with the PDF and a secure link.
4. **Scenario ORANGE:** the app shows the explanation and 3 Grand Tunis hospitals, each with its reason. The patient picks one, and the report is sent the same way.
5. The patient's referral screen shows **Sent ✓**. Someone opens the secure link on a laptop and the patient's app shows **"Seen by hospital"**.
6. The app shows a QR code. Scanning it opens the same report page, as the reception desk would.
7. The patient taps "My symptoms got worse". The hospital inbox receives **UPDATE v2 — level raised to RED**.
8. The patient taps "Change hospital". The old inbox receives **CANCELLED**, and the new one receives the report.
9. Stop the AI service and send a message. The app shows the safe fallback with the emergency number, not an error.
10. Point one hospital's email at an invalid address. The delivery fails, the app shows the ED phone number, and Prisma Studio shows the failed delivery with its error.

---

## 1. Repository layout

```
hackcure/
├── docs/
├── docker-compose.yml        # postgres
├── ai-stub/main.py           # fake AI service (until the real one is ready)
├── backend/                  # NestJS
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts           # Grand Tunis directory + delivery channels
│   ├── templates/
│   │   ├── report.html       # secure report page (+ printable)
│   │   └── email.html        # email body
│   └── src/
│       ├── prisma/           # PrismaService
│       ├── auth/             # phone login, JWT guard, roles guard (PATIENT / ADMIN)
│       ├── ai/               # AiClient → FastAPI
│       ├── cases/            # cases, triage turns, updates, close
│       ├── matching/         # rank Grand Tunis hospitals
│       ├── referrals/        # create / change / cancel referral
│       ├── reports/          # build report data, PDF, FHIR, secure link
│       ├── delivery/         # channels: email, webhook, sms + retry cron
│       ├── public/           # GET /r/:token (no auth, token only)
│       ├── feedback/         # optional POST /api/hospital-feedback
│       ├── push/             # Expo push to patient
│       ├── audit/
│       └── admin/            # small JSON endpoints (or just use Prisma Studio)
└── mobile/                   # Expo app
```

---

## 2. Local setup

### docker-compose.yml

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: hackcure
      POSTGRES_PASSWORD: hackcure
      POSTGRES_DB: hackcure
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
volumes:
  pgdata:
```

### backend/.env

```
DATABASE_URL=postgresql://hackcure:hackcure@localhost:5432/hackcure
JWT_SECRET=change-me
AI_SERVICE_URL=http://localhost:8000
AI_TIMEOUT_MS=10000
PUBLIC_BASE_URL=http://192.168.1.20:3000     # LAN IP, so the QR works from a phone
REPORT_LINK_TTL_HOURS=24
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=...
SMTP_PASS=...
MAIL_FROM="HackCure Triage <triage@hackcure.tn>"
PORT=3000
```

**Mailtrap** (free) gives you a fake inbox, so every hospital email lands there during development. You can't spam a real hospital by mistake.

### Start order

1. `docker compose up -d`
2. `cd ai-stub && uvicorn main:app --reload --port 8000`
3. `cd backend && npx prisma migrate dev && npx prisma db seed && npm run start:dev`
4. `npx prisma studio`: your admin console for the hackathon
5. `cd mobile && npx expo start`

**Phone gotcha:** on a real phone, `localhost` is the phone itself. Use the laptop's LAN IP in `mobile/.env` (`EXPO_PUBLIC_API_URL=http://192.168.1.20:3000`), on the same Wi-Fi. The Android emulator uses `10.0.2.2`.

### Packages (for reference, install when ready)

- backend: `@nestjs/jwt @nestjs/schedule @nestjs/config class-validator class-transformer @prisma/client pdfmake nodemailer handlebars` + dev `prisma @types/pdfmake @types/nodemailer`
- mobile: `expo-location expo-notifications expo-secure-store expo-file-system expo-sharing react-native-qrcode-svg react-native-svg @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context`
- ai-stub: `fastapi uvicorn`

The current Nest CLI generates an **ESM** project, so local imports need `.js` (`import { X } from './x.js'`). If `npm install` fails with `Cannot read properties of null (reading 'edgesOut')`, use `npm install --legacy-peer-deps`.

---

## 3. Prisma schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role { PATIENT ADMIN }
enum FacilityType { CHU REGIONAL SPECIALIZED_INSTITUTE MILITARY PRIVATE_CLINIC }
enum Governorate { TUNIS ARIANA BEN_AROUS MANOUBA }
enum Level { GREEN YELLOW ORANGE RED }
enum Action { EMERGENCY URGENT_ASSESSMENT ASK_FOLLOWUP ROUTINE }
enum CaseStatus { TRIAGING EMERGENCY RESULT_READY REFERRED CLOSED }
enum Sender { PATIENT AI SYSTEM }
enum ReferralStatus { ACTIVE CANCELLED ARRIVED }
enum ReferralOrigin { PATIENT_CHOICE AUTO_EMERGENCY PATIENT_CHANGE }
enum ReportKind { PRE_ARRIVAL UPDATE CANCELLATION }
enum ChannelType { EMAIL WEBHOOK_FHIR SMS }
enum DeliveryStatus { QUEUED SENT DELIVERED FAILED }

// ---------- Hospital directory (maintained by us) ----------

model Facility {
  id           String       @id @default(uuid())
  name         String
  shortName    String?
  type         FacilityType
  governorate  Governorate
  city         String?
  address      String?
  lat          Float
  lng          Float
  hasGeneralEd Boolean      @default(true)
  edPhone      String?
  isActive     Boolean      @default(true)
  apiKeyHash   String?      // only if the hospital sends feedback
  departments  Department[]
  equipment    FacilityEquipment[]
  onCall       OnCallShift[]
  channels     DeliveryChannel[]
  referrals    Referral[]
}

model Specialty {
  code        String        @id   // CARDIO, NEURO, PEDIA, TRAUMA, OPHTA, OBGYN, BURNS...
  nameFr      String
  nameAr      String
  departments Department[]
  onCall      OnCallShift[]
  cases       Case[]
}

model Department {
  id            String     @id @default(uuid())
  facilityId    String
  facility      Facility   @relation(fields: [facilityId], references: [id])
  specialtyCode String
  specialty     Specialty  @relation(fields: [specialtyCode], references: [code])
  hasEmergency  Boolean    @default(true)
  notes         String?
  referrals     Referral[]
  @@unique([facilityId, specialtyCode])
}

model Equipment {
  code       String              @id   // CT, MRI, CATH_LAB, ICU, NICU, DIALYSIS...
  nameFr     String
  nameAr     String
  facilities FacilityEquipment[]
}

model FacilityEquipment {
  facilityId    String
  facility      Facility  @relation(fields: [facilityId], references: [id])
  equipmentCode String
  equipment     Equipment @relation(fields: [equipmentCode], references: [code])
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

model DeliveryChannel {
  id         String           @id @default(uuid())
  facilityId String
  facility   Facility         @relation(fields: [facilityId], references: [id])
  type       ChannelType
  target     String           // email, URL or phone
  secret     String?          // HMAC key for webhooks
  priority   Int              @default(1)
  active     Boolean          @default(true)
  deliveries ReportDelivery[]
}

// ---------- Patients and cases ----------

model User {
  id             String    @id @default(uuid())
  phone          String    @unique
  role           Role      @default(PATIENT)
  language       String    @default("fr")   // fr | ar | darija
  birthYear      Int?
  sex            String?
  pregnant       Boolean?
  consentVersion String?
  consentAt      DateTime?
  pushToken      String?
  createdAt      DateTime  @default(now())
  cases          Case[]
}

model Case {
  id                 String     @id @default(uuid())
  patientId          String
  patient            User       @relation(fields: [patientId], references: [id])
  status             CaseStatus @default(TRIAGING)
  language           String
  level              Level?
  action             Action?
  suggestedSpecialty String?
  specialty          Specialty? @relation(fields: [suggestedSpecialty], references: [code])
  requiredEquipment  String[]
  lat                Float?
  lng                Float?
  latestState        Json?
  createdAt          DateTime   @default(now())
  closedAt           DateTime?
  messages           Message[]
  aiResults          AiResult[]
  referrals          Referral[]
  reports            Report[]
}

model Message {
  id        String   @id @default(uuid())
  caseId    String
  case      Case     @relation(fields: [caseId], references: [id])
  sender    Sender
  text      String
  createdAt DateTime @default(now())
  @@index([caseId, createdAt])
}

model AiResult {
  id           String   @id @default(uuid())
  caseId       String
  case         Case     @relation(fields: [caseId], references: [id])
  turn         Int
  request      Json
  response     Json
  modelVersion String
  latencyMs    Int
  createdAt    DateTime @default(now())
}

model Referral {
  id                 String          @id @default(uuid())
  caseId             String
  case               Case            @relation(fields: [caseId], references: [id])
  facilityId         String
  facility           Facility        @relation(fields: [facilityId], references: [id])
  departmentId       String?
  department         Department?     @relation(fields: [departmentId], references: [id])
  previousReferralId String?         @unique
  previous           Referral?       @relation("Change", fields: [previousReferralId], references: [id])
  next               Referral?       @relation("Change")
  status             ReferralStatus  @default(ACTIVE)
  origin             ReferralOrigin  @default(PATIENT_CHOICE)
  distanceKm         Float?
  etaMinutes         Int?
  matchReason        String?
  createdAt          DateTime        @default(now())
  cancelledAt        DateTime?
  deliveries         ReportDelivery[]
  feedback           HospitalFeedback?
}

model Report {
  id              String           @id @default(uuid())
  caseId          String
  case            Case             @relation(fields: [caseId], references: [id])
  version         Int
  kind            ReportKind
  data            Json             // source of truth
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
  acknowledgedAt DateTime?
  createdAt      DateTime        @default(now())
  @@index([status, attempts])
}

model HospitalFeedback {
  referralId         String   @id
  referral           Referral @relation(fields: [referralId], references: [id])
  arrived            Boolean?
  finalLevel         String?
  confirmedDiagnosis String?
  raw                Json
  receivedAt         DateTime @default(now())
}

model AuditLog {
  id        String   @id @default(uuid())
  actorId   String?
  action    String   // ai.result, referral.create, report.sent, report.viewed...
  entity    String
  entityId  String
  data      Json?
  createdAt DateTime @default(now())
  @@index([entity, entityId])
}
```

**Seed** (`prisma/seed.ts`):
- 8–12 Grand Tunis hospitals (candidate list in `database-schema.md` §8; verify names and coordinates).
- 2–5 departments each, the specialties and equipment with FR/AR names, and one week of on-call shifts for 2–3 rotating specialties.
- **One EMAIL channel per hospital, pointing at Mailtrap or team addresses** (e.g. `rabta@demo.hackcure.tn`). Never use real hospital addresses during the hackathon.
- One ADMIN user.

---

## 4. Auth

- `POST /auth/login { phone }`: finds or creates a PATIENT and returns a JWT `{ sub, role }`. There is no OTP for the demo; say so in the pitch.
- The ADMIN user comes from the seed. During the hackathon, Prisma Studio is enough for admin work.
- Guards: `JwtAuthGuard` + `@Roles('ADMIN')` on `/admin/*`.
- **Access rule:** a patient only touches their own cases. The check is `case.patientId === user.sub` in every case service method.
- The **public report page** `/r/:token` has **no JWT**. The random token in the URL *is* the permission (§8).
- Hospital feedback uses an **API key per hospital** (`x-api-key` header, compared to `Facility.apiKeyHash`).
- On mobile, store the token in `expo-secure-store`.

---

## 5. AI integration

### `ai/ai.client.ts`

```ts
@Injectable()
export class AiClient {
  async turn(req: AiTurnRequest): Promise<AiTurnResponse> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), Number(process.env.AI_TIMEOUT_MS ?? 10000));
    try {
      const res = await fetch(`${process.env.AI_SERVICE_URL}/v1/triage/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`AI ${res.status}`);
      return (await res.json()) as AiTurnResponse;
    } finally {
      clearTimeout(t);
    }
  }
}
```

The types come from `app-spec.md` §3. Later, generate them: `npx openapi-typescript http://localhost:8000/openapi.json -o src/ai/ai.types.ts`.

### The patient turn (`CasesService.addPatientMessage`)

```
1. Check the case belongs to the patient and is TRIAGING.
2. Save Message(PATIENT).
3. AiClient.turn(...)
   └─ error/timeout → save Message(SYSTEM, fallback text + 190), return { kind: "fallback" }
4. Save AiResult + AuditLog("ai.result").
5. Update the case: latestState, level, action, suggestedSpecialty, requiredEquipment.
6. Branch:
   ├─ safety.triggered OR action == EMERGENCY
   │     → status = EMERGENCY
   │     → ReferralsService.autoEmergency(case)   (nearest capable ED, report sent)
   │     → return { kind: "emergency", referral }
   ├─ action == ASK_FOLLOWUP → Message(AI, next_question) → return { kind: "question", question, quickReplies }
   └─ else → status = RESULT_READY → return { kind: "result", level, action, rationale }
```

**Important:** in the emergency branch, **return to the app first**, then send the report. The patient must see "Call 190" with zero delay. `autoEmergency` creates the referral and queues the delivery; the cron (or an immediate fire-and-forget call) sends it.

### ai-stub/main.py

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Turn(BaseModel):
    case_id: str
    turn: int
    message: str
    language_hint: str | None = None
    previous_state: dict | None = None
    patient_context: dict | None = None

RED = ["sder", "poitrine", "صدر", "mkhanou9", "souffle", "تنفس"]

@app.post("/v1/triage/turn")
def turn(t: Turn):
    msg = t.message.lower()
    red = any(k in msg for k in RED)
    ask = not red and t.turn == 1
    level, action = ("RED", "EMERGENCY") if red else (("ORANGE", "ASK_FOLLOWUP") if ask else ("ORANGE", "URGENT_ASSESSMENT"))
    return {
        "language": t.language_hint or "fr",
        "state": {"symptoms": [t.message], "onset": "", "duration": "", "severity": "",
                  "medical_history": [], "medications": [], "uncertainty": [], "evidence": [t.message]},
        "state_version": t.turn,
        "missing_fields": ["duration"] if ask else [],
        "safety": {"triggered": red, "reasons": ["chest pain + breathing difficulty"] if red else []},
        "classification": {"probs": {"low": .08, "moderate": .17, "high": .60, "emergency": .15}, "uncertainty": .21},
        "decision": {"action": action, "level": level,
                     "suggested_specialty": "CARDIO" if red else "TRAUMA",
                     "required_equipment": ["CATH_LAB"] if red else [],
                     "rationale": "Stub rationale", "rationale_localized": "Stub rationale"},
        "next_question": "Depuis combien de temps ?" if ask else None,
        "quick_replies": ["< 1h", "1-24h", "> 1 jour"] if ask else None,
        "model_version": "stub-0.1",
    }

@app.get("/health")
def health():
    return {"ok": True}
```

---

## 6. Matching across Grand Tunis (`matching/`)

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
2. **Has the equipment:** every required code is in `equipment`.
3. **Exclude** facilities of earlier referrals of this case that were cancelled because the patient changed hospital (`excludeIds` parameter).
4. **ETA:** `distanceKm / 30 * 60` minutes. Tunis traffic is slow; use the Maps API later.
5. **EMERGENCY:** sort by ETA only. **Otherwise:** ETA + 5 if the hospital is only on call without its own department.
6. **Fallback:** if nothing matches, return the nearest `hasGeneralEd` facilities with the reason "General emergency". The list is never empty.
7. Return the top 3 as `{ facilityId, departmentId, name, distanceKm, etaMinutes, reason, edPhone, lat, lng }`. Example reason: `"Cardiology · on duty tonight · 4.2 km · ~9 min"`.

---

## 7. Referrals (`referrals/`)

```
POST /cases/:id/referrals { facilityId }       (patient choice)
ReferralsService.autoEmergency(case)           (EMERGENCY, top-1 match)
  1. Create Referral(ACTIVE, origin, distanceKm, etaMinutes, matchReason)
  2. Case.status = REFERRED
  3. ReportsService.createVersion(case, kind = PRE_ARRIVAL)  → Report + token
  4. DeliveryService.enqueue(report, referral)               → ReportDelivery(QUEUED) for the top-priority channel
  5. AuditLog("referral.create")
  6. return { referral, report: { link, qrLink }, delivery: { status } }

POST /cases/:id/update { text }   (symptoms changed while referred)
  1. Same AI turn as §5 with previous_state
  2. If the level went up (or the action changed): createVersion(kind = UPDATE) → enqueue to the SAME referral's hospital
  3. If now EMERGENCY and the current hospital can't treat it (re-run matching) → change hospital automatically (below)

POST /cases/:id/referrals/change { facilityId }
  1. Old referral → CANCELLED; createVersion(kind = CANCELLATION) → enqueue to the old hospital
  2. New Referral(previousReferralId = old.id, origin = PATIENT_CHANGE) → PRE_ARRIVAL → enqueue

POST /cases/:id/close { arrived: boolean }
  → Referral ARRIVED (if arrived), Case CLOSED, expire the token (accessExpiresAt = now)
```

---

## 8. Reports (`reports/`)

### 8.1 One data object, three outputs

`ReportsService.build(caseId, kind)` builds the JSON once and saves it in `Report.data`:

```ts
{
  kind, version, generatedAt,
  headline: "[RED] Pre-arrival — chest pain — ETA 9 min",
  patient: { ageApprox, sex, pregnant, language, phone /* only if consented */ },
  triage: { level, action, rationale, probabilities, uncertainty, safetyReasons, suggestedSpecialty },
  clinical: { symptoms, onset, duration, severity, history, medications, missingFields },
  destination: { facilityName, department, distanceKm, etaMinutes, matchReason },
  previous: kind === 'UPDATE' ? { level: oldLevel } : null,
  transcript: messages.map(m => ({ at: m.createdAt, sender: m.sender, text: m.text })),
  modelVersion,
  disclaimer: "AI-assisted triage guidance. Clinical decisions remain with the receiving hospital.",
}
```

1. **HTML page** at `/r/:token`, rendered from `templates/report.html` (Handlebars)
2. **PDF**, generated from the same data (pdfmake), attached to emails and downloadable
3. **FHIR R4 Bundle**, generated from the same data, sent to webhook channels and served at `/r/:token/fhir`

### 8.2 The secure link

```ts
import { randomBytes, createHash } from 'node:crypto';

const token = randomBytes(32).toString('base64url');            // goes in the URL, never stored
const accessTokenHash = createHash('sha256').update(token).digest('hex'); // stored
const link = `${process.env.PUBLIC_BASE_URL}/r/${token}`;
```

`GET /r/:token`:
1. Hash the token and find the `Report` by `accessTokenHash`.
2. If it isn't found or `accessExpiresAt < now`, return 404 "Link expired". Don't reveal whether the link ever existed.
3. **Always show the latest version of that case.** If the requested report is older, show a banner: "A newer version exists (v3, RED)", and render v3. For a CANCELLATION, show a clear "CANCELLED — patient going elsewhere" page.
4. Set `firstViewedAt` on the deliveries of this report if it is null, write `AuditLog("report.viewed")`, and send a push to the patient: "The hospital opened your report".
5. Headers: `Cache-Control: no-store`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`.

The **QR code** in the app is simply this link. Show the latest report's link.

### 8.3 PDF (pdfmake)

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

### 8.4 FHIR R4 Bundle (built by hand, no library needed)

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

## 9. Delivery (`delivery/`): the heart of the integration

### 9.1 One interface, three channels

```ts
export interface DeliveryResult { ok: boolean; externalRef?: string; error?: string }

export interface Channel {
  send(report: ReportWithData, channel: DeliveryChannel, link: string, pdf: Buffer): Promise<DeliveryResult>;
}
```

**Email** (`email.channel.ts`, Nodemailer):

```ts
const info = await transporter.sendMail({
  from: process.env.MAIL_FROM,
  to: channel.target,
  subject: report.data.headline,                       // "[RED] Pre-arrival — chest pain — ETA 9 min"
  html: renderEmail(report.data, link),                // summary + big "Open report" button
  attachments: [{ filename: `pre-arrival-v${report.version}.pdf`, content: pdf }],
});
return { ok: true, externalRef: info.messageId };
```

**Webhook FHIR** (`webhook.channel.ts`), for hospitals with an IT system:

```ts
const body = JSON.stringify(buildFhirBundle(report.data, link));
const sig = createHmac('sha256', channel.secret!).update(body).digest('hex');
const res = await fetch(channel.target, {
  method: 'POST',
  headers: { 'Content-Type': 'application/fhir+json', 'X-Signature': `sha256=${sig}`, 'X-Report-Id': report.id },
  body,
});
return res.ok ? { ok: true, externalRef: res.headers.get('x-request-id') ?? undefined }
              : { ok: false, error: `HTTP ${res.status}` };
```

For the demo, point it at https://webhook.site, which shows the received request live on screen.

**SMS** (`sms.channel.ts`): optional. Send the headline + link through any SMS API. Skip it if there's no time.

### 9.2 Queue + retry (no Redis needed)

`enqueue` only inserts a `ReportDelivery(QUEUED)` row and then calls `processOne(id)` immediately (fire-and-forget), so delivery takes seconds. A cron catches anything that failed:

```ts
@Cron('*/30 * * * * *')   // every 30 s
async retry() {
  const due = await this.prisma.reportDelivery.findMany({
    where: { status: { in: ['QUEUED', 'FAILED'] }, attempts: { lt: 3 } },
    include: { report: true, channel: true, referral: true },
  });
  for (const d of due) await this.processOne(d.id);
}

async processOne(id: string) {
  // 1. Re-read the row; skip if already SENT (two runs at once must not send twice):
  //    claim it with updateMany({ where: { id, status: { in: ['QUEUED','FAILED'] } }, data: { attempts: { increment: 1 } } })
  //    and stop if count === 0
  // 2. Build the link + PDF, call the channel's send()
  // 3. ok → status SENT, sentAt, externalRef; push to patient "Report sent to <hospital>"
  //    fail → status FAILED, lastError
  // 4. 3rd failure → enqueue on the hospital's next channel (priority + 1) if any;
  //    otherwise push to patient "Delivery failed — call the ED: <edPhone>" and audit "report.delivery_failed"
  // 5. AuditLog every attempt
}
```

### 9.3 What the patient sees

`GET /cases/:id/referral` returns:

```json
{
  "facility": { "name": "Hôpital La Rabta", "edPhone": "71 xxx xxx", "lat": 36.80, "lng": 10.16 },
  "etaMinutes": 9,
  "matchReason": "Cardiology · on duty tonight · 4.2 km",
  "report": { "version": 2, "kind": "UPDATE", "link": "https://…/r/…" },
  "delivery": { "status": "SENT", "sentAt": "…", "seenAt": null }
}
```

The app shows **Sending… → Sent ✓ → Seen by hospital ✓✓** (or **Failed — call the ED**). It refreshes on screen focus, on a pull-to-refresh, and when a push arrives. There is no WebSocket. While the status is still "Sending", poll every 3 s; it only lasts a few seconds.

---

## 10. Optional: hospital feedback API (`feedback/`)

Only for a hospital that wants to send outcomes back (step 15 → 16):

```
POST /api/hospital-feedback
x-api-key: <per hospital>
{ "report_id": "...", "arrived": true, "final_level": "ORANGE", "diagnosis": "NSTEMI" }
```

The backend checks the key against `Facility.apiKeyHash` and that the report was sent to **this** hospital, then stores a `HospitalFeedback` row with the raw payload. For the demo, call it once with curl to show the loop is closed.

---

## 11. Mobile app (Expo), screen by screen

Navigation: one native stack. `Language → Consent → Home → TriageChat → (Emergency | Result → Hospitals) → Referral`.

| Screen | Calls | Notes |
|---|---|---|
| Language | none | stores the language, sets RTL |
| Consent + profile | `POST /auth/login`, `PATCH /me` | consent text says the report is shared with the chosen hospital |
| Home | `GET /cases` | "Describe your problem" + past cases |
| TriageChat | `POST /cases`, `POST /cases/:id/messages` | **switch on the response `kind`**: `question` → append + quick replies; `emergency` → replace with Emergency; `result` → Result; `fallback` → show the fallback text + call button |
| **Emergency** | `GET /cases/:id/referral` | red full screen, `Linking.openURL('tel:190')`, first aid text, then "Report sent to X · ED phone · Directions". The number and first aid are **hard-coded in the app**, so this screen works offline |
| Result | none | level badge (color + text), rationale, disclaimer, "Find a hospital" |
| Hospitals | `GET /cases/:id/facilities?lat&lng` | `expo-location` (fallback: pick a neighborhood), 3 cards with reasons, "Go to this hospital" |
| **Referral** | `POST /cases/:id/referrals`, `GET /cases/:id/referral`, `/update`, `/referrals/change`, `/close` | delivery status, **QR code** (`react-native-qrcode-svg` with `report.link`), "Open PDF" (`expo-file-system` download + `expo-sharing`), Directions (`https://maps.google.com/?daddr=lat,lng`), "Call ED", "My symptoms changed", "Change hospital", "I arrived" |
| MyCases | `GET /cases` | list → Referral screen |

Keep all UI strings (buttons, disclaimers, emergency text) in `i18n.ts` with `fr`, `ar` and `darija`. The AI provides the questions.

**Push:** use `expo-notifications` → `getExpoPushTokenAsync()` → `PATCH /me { pushToken }`. The backend POSTs to `https://exp.host/--/api/v2/push/send` with `{ to, title, body, data: { caseId } }`. Tapping a notification opens the Referral screen.

---

## 12. Admin (hackathon version)

Use **Prisma Studio** (`npx prisma studio`) to edit hospitals, channels and on-call shifts, and to watch `ReportDelivery` rows live during the demo. If there's time, add three JSON endpoints and one small HTML page served by Nest:
- `GET /admin/deliveries?status=FAILED`
- `POST /admin/deliveries/:id/retry`
- `POST /admin/channels/:id/test`, which sends a sample report so you can check that a hospital's address works

---

## 13. Safety checklist (verify before the demo)

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
- [ ] All demo channels point at Mailtrap, webhook.site or team addresses, **never at real hospitals**.
- [ ] Arabic renders correctly in the app, the PDF, the email and the report page.

---

## 14. Task checklist (in build order)

### Milestone 1: skeleton
- [ ] docker-compose + Postgres
- [ ] NestJS + Prisma schema + first migration
- [ ] Seed: Grand Tunis directory, specialties, equipment, on-call, Mailtrap channels, admin
- [ ] ai-stub running
- [ ] Agree the AI contract with the AI team (`app-spec.md` §3)

### Milestone 2: triage end-to-end
- [ ] Auth (phone login, JWT)
- [ ] `POST /cases`, `POST /cases/:id/messages` with the AI call + fallback
- [ ] Expo: Language → Consent → Home → TriageChat → Emergency / Result

### Milestone 3: matching + referral + delivery (the core)
- [ ] Matching + Hospitals screen
- [ ] Referral creation + auto-emergency referral
- [ ] Report builder + secure link + `/r/:token` page
- [ ] PDF (test Arabic!)
- [ ] Email channel + delivery queue + retry cron
- [ ] Referral screen: status, QR, PDF, directions, call

### Milestone 4: changes over time
- [ ] Symptoms update → UPDATE report
- [ ] Change hospital → CANCELLATION + new referral
- [ ] Close / auto-close + link expiry
- [ ] Push notifications (sent, seen, failed)

### Milestone 5: integration extras + polish
- [ ] FHIR bundle + webhook channel (demo with webhook.site)
- [ ] Hospital feedback API + export for the AI team
- [ ] Swap the stub for the real AI service; run the safety checklist; rehearse the demo script (§0)

---

## 15. Questions to settle with the team

1. Which delivery channel is realistic for Grand Tunis EDs: email, SMS or an API? (This decides what we pitch as real versus "future integration".)
2. Who validates the AI, given there's no clinician in our app? Agree on the "guidance only, hospital decides" wording.
3. Can the AI service return `suggested_specialty` and `required_equipment` using our codes, plus `quick_replies`?
4. Does the AI service check red flags **before** asking follow-up questions? What is the maximum number of rounds?
5. Emergency numbers: verify SAMU 190 and Protection civile 198.
6. Is there any hospital partner willing to send outcomes back for step 16?
7. Consent and data protection wording (Tunisian law 2004-63 / INPDP): check with a mentor.
