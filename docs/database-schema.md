# Database Schema — Grand Tunis referral network

PostgreSQL schema for the triage app.

**The model:** the app triages the patient and picks the right hospital among all major hospitals of Grand Tunis (Tunis, Ariana, Ben Arous, Manouba). It **sends the pre-arrival report** to that hospital. The hospital then manages the patient, the case state and its staff **in its own existing tools**. The app has no doctor or hospital-staff users, no hospital dashboard and no chat.

The diagrams are Mermaid. They render on GitHub, GitLab and in VS Code (with the "Markdown Preview Mermaid Support" extension).

---

## 1. Who is in the database

| Actor | In our DB? | How they interact |
|---|---|---|
| Patient | yes (`USER`, role PATIENT) | mobile app |
| Our team (admin) | yes (`USER`, role ADMIN) | admin console / Prisma Studio: hospital directory, delivery channels, on-call schedule |
| Hospital | **as a directory entry** (`FACILITY` + `DELIVERY_CHANNEL`), not as users | receives reports by email / secure link / API, in its own tools |
| Doctors, nurses | **no** | assigned by the hospital in its own systems |

---

## 2. Overview: tables and relationships

```mermaid
erDiagram
    FACILITY ||--o{ DEPARTMENT : "has"
    SPECIALTY ||--o{ DEPARTMENT : "type of"
    FACILITY ||--o{ FACILITY_EQUIPMENT : "owns"
    EQUIPMENT ||--o{ FACILITY_EQUIPMENT : "type of"
    FACILITY ||--o{ ON_CALL_SHIFT : "on duty"
    SPECIALTY ||--o{ ON_CALL_SHIFT : "covered for"
    FACILITY ||--o{ DELIVERY_CHANNEL : "receives reports via"

    USER ||--o{ CASE : "patient creates"
    SPECIALTY |o--o{ CASE : "suggested specialty"
    CASE ||--o{ MESSAGE : "triage chat"
    CASE ||--o{ AI_RESULT : "scored by AI each turn"
    CASE ||--o{ REFERRAL : "sent to hospital"
    FACILITY ||--o{ REFERRAL : "receives"
    DEPARTMENT |o--o{ REFERRAL : "target department"
    REFERRAL |o--o| REFERRAL : "replaced by"
    CASE ||--o{ REPORT : "versioned reports"
    REPORT ||--o{ REPORT_DELIVERY : "sent as"
    REFERRAL ||--o{ REPORT_DELIVERY : "for"
    DELIVERY_CHANNEL ||--o{ REPORT_DELIVERY : "through"
    REFERRAL ||--o| HOSPITAL_FEEDBACK : "optional outcome"

    USER ||..o{ AUDIT_LOG : "actor"
```

Legend: a solid line is a real foreign key. A dotted line is a logical reference (an id without a DB constraint). `||` means exactly one, `|o` zero or one, and `o{` zero or many.

---

## 3. Full schema: hospital directory

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
    }

    EQUIPMENT {
        string code PK "CT, MRI, CATH_LAB, ICU, NICU, DIALYSIS..."
        string nameFr
        string nameAr
    }

    FACILITY_EQUIPMENT {
        uuid facilityId PK, FK
        string equipmentCode PK, FK
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
        enum type "EMAIL | WEBHOOK_FHIR | SMS"
        string target "email address, URL or phone"
        string secret "HMAC key for webhooks"
        int priority "1 = try first"
        boolean active
    }

    FACILITY ||--o{ DEPARTMENT : "facilityId"
    SPECIALTY ||--o{ DEPARTMENT : "specialtyCode"
    FACILITY ||--o{ FACILITY_EQUIPMENT : "facilityId"
    EQUIPMENT ||--o{ FACILITY_EQUIPMENT : "equipmentCode"
    FACILITY ||--o{ ON_CALL_SHIFT : "facilityId"
    SPECIALTY ||--o{ ON_CALL_SHIFT : "specialtyCode"
    FACILITY ||--o{ DELIVERY_CHANNEL : "facilityId"
```

## 4. Full schema: patients, cases, referrals, reports

```mermaid
erDiagram
    USER {
        uuid id PK
        string phone UK
        enum role "PATIENT | ADMIN"
        string language "fr | ar | darija"
        int birthYear
        string sex
        boolean pregnant
        string consentVersion
        datetime consentAt
        string pushToken
        datetime createdAt
    }

    CASE {
        uuid id PK
        uuid patientId FK
        enum status "TRIAGING | EMERGENCY | RESULT_READY | REFERRED | CLOSED"
        string language
        enum level "GREEN | YELLOW | ORANGE | RED"
        enum action "EMERGENCY | URGENT_ASSESSMENT | ASK_FOLLOWUP | ROUTINE"
        string suggestedSpecialty FK
        float lat
        float lng
        json latestState "patient state from AI"
        datetime createdAt
        datetime closedAt
    }

    MESSAGE {
        uuid id PK
        uuid caseId FK
        enum sender "PATIENT | AI | SYSTEM"
        text text
        datetime createdAt "indexed with caseId"
    }

    AI_RESULT {
        uuid id PK
        uuid caseId FK
        int turn
        json request
        json response
        string modelVersion
        int latencyMs
        datetime createdAt
    }

    REFERRAL {
        uuid id PK
        uuid caseId FK
        uuid facilityId FK
        uuid departmentId FK "optional"
        uuid previousReferralId FK "patient changed hospital"
        enum status "ACTIVE | CANCELLED | ARRIVED"
        enum origin "PATIENT_CHOICE | AUTO_EMERGENCY | PATIENT_CHANGE"
        float distanceKm
        int etaMinutes
        string matchReason "Cardiology on duty, 4.2 km"
        datetime createdAt
        datetime cancelledAt
    }

    REPORT {
        uuid id PK
        uuid caseId FK
        int version "unique with caseId"
        enum kind "PRE_ARRIVAL | UPDATE | CANCELLATION"
        json data "source of truth, PDF and FHIR built from it"
        string accessTokenHash "secure link /r/:token"
        datetime accessExpiresAt
        datetime createdAt
    }

    REPORT_DELIVERY {
        uuid id PK
        uuid reportId FK
        uuid referralId FK
        uuid channelId FK
        enum status "QUEUED | SENT | DELIVERED | FAILED"
        int attempts
        string lastError
        string externalRef "message id / API response id"
        datetime sentAt
        datetime firstViewedAt "secure link opened"
        datetime acknowledgedAt "API ack, optional"
    }

    HOSPITAL_FEEDBACK {
        uuid referralId PK, FK
        boolean arrived
        string finalLevel
        string confirmedDiagnosis
        json raw "payload as received"
        datetime receivedAt
    }

    AUDIT_LOG {
        uuid id PK
        uuid actorId "null = system"
        string action "ai.result, referral.create, report.sent, report.viewed..."
        string entity
        uuid entityId "indexed with entity"
        json data
        datetime createdAt
    }

    USER ||--o{ CASE : "patientId"
    CASE ||--o{ MESSAGE : "caseId"
    CASE ||--o{ AI_RESULT : "caseId"
    CASE ||--o{ REFERRAL : "caseId"
    REFERRAL |o--o| REFERRAL : "previousReferralId"
    CASE ||--o{ REPORT : "caseId"
    REPORT ||--o{ REPORT_DELIVERY : "reportId"
    REFERRAL ||--o{ REPORT_DELIVERY : "referralId"
    REFERRAL ||--o| HOSPITAL_FEEDBACK : "referralId"
```

`REFERRAL.facilityId → FACILITY`, `REFERRAL.departmentId → DEPARTMENT`, `CASE.suggestedSpecialty → SPECIALTY` and `REPORT_DELIVERY.channelId → DELIVERY_CHANNEL` connect these tables to section 3. They appear in the overview diagram.

---

## 5. How a report reaches the hospital

```mermaid
sequenceDiagram
    autonumber
    actor P as Patient app
    participant B as Backend
    participant AI as AI service (FastAPI)
    participant H as Hospital (own tools)
    P->>B: symptoms, answers
    B->>AI: triage turn
    AI-->>B: level, state, specialty
    B-->>P: result + ranked hospitals
    P->>B: choose hospital (or auto for EMERGENCY)
    B->>B: REFERRAL + REPORT v1 + secure link
    B->>H: deliver via channel (email PDF+link / FHIR webhook / SMS link)
    B-->>P: "Report sent to Charles Nicolle" + QR code of the report
    H-->>B: (optional) link opened → firstViewedAt
    P->>B: "symptoms got worse"
    B->>AI: re-score
    B->>H: REPORT v2 (UPDATE), same channel
    H-->>B: (optional) outcome via API → HOSPITAL_FEEDBACK
```

**The patient always carries the report too.** The app shows a QR code of the secure link plus the PDF. If an email is not read in time, the reception desk scans the QR code on arrival, so delivery never depends on one channel only.

---

## 6. Referral and case lifecycle

```mermaid
stateDiagram-v2
    [*] --> TRIAGING
    TRIAGING --> TRIAGING: follow-up question
    TRIAGING --> EMERGENCY: safety triggered (call 190 shown)
    TRIAGING --> RESULT_READY: decision made
    EMERGENCY --> REFERRED: nearest capable ED, report sent automatically
    RESULT_READY --> REFERRED: patient picks hospital, report sent
    RESULT_READY --> CLOSED: routine / self-care
    REFERRED --> REFERRED: symptoms update (new report version) or patient changes hospital (cancellation + new referral)
    REFERRED --> CLOSED: patient marks "arrived" / hospital feedback / 24h expiry
    CLOSED --> [*]
```

---

## 7. Matching (all of Grand Tunis)

For a case with `suggestedSpecialty = CARDIO`:

1. **Candidates:** every active `FACILITY`.
2. **Can treat it:** it has a `DEPARTMENT` for that specialty with `hasEmergency`, **or** it is on duty in `ON_CALL_SHIFT` for that specialty right now.
3. **Equipment:** if the AI asks for it (e.g. `CATH_LAB`), require a `FACILITY_EQUIPMENT` row.
4. **Rank:** EMERGENCY by ETA only; otherwise ETA plus small penalties (e.g. on-call only).
5. **Fallback:** if nothing matches the specialty, return the nearest `hasGeneralEd` facilities. The list is never empty.

There is no live bed capacity, because hospitals don't update anything in our system. If a hospital later offers a capacity API, add a `DEPARTMENT_STATUS` table fed by it.

---

## 8. Seed data: Grand Tunis hospitals (candidates, verify before use)

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

For the demo, point each hospital's `DELIVERY_CHANNEL` at **team email addresses** (or a Mailtrap inbox), never at the real hospitals.

---

## 9. Design notes

- **`REFERRAL`, not "handoff".** The hospital doesn't accept or reject in our system. A referral is simply "this case was sent to this hospital". If the patient changes hospital, the old referral is cancelled (and a CANCELLATION report is sent), and a new one points back to it.
- **`REPORT_DELIVERY` is the core of the integration.** It holds one row per report, per channel, per attempt cycle, with its status and errors. This table shows whether the hospital actually received the report.
- **Secure link:** only a **hash** of the token is stored. The link expires (e.g. after 24 h). Opening it sets `firstViewedAt`, a passive "the hospital saw it" signal with no action required from the hospital.
- **`HOSPITAL_FEEDBACK` is optional.** It is filled only if a hospital sends outcomes back through an API. Without it, the feedback loop (step 16) has no ground truth: see the open questions in `app-spec.md`.
- **Reports are append-only.** Every change creates a new version and a new delivery.
- **The triage chat is the only chat** (`MESSAGE` = patient ↔ AI).
- **Indexes:** `DEPARTMENT(facilityId, specialtyCode)` unique, `ON_CALL_SHIFT(specialtyCode, startsAt, endsAt)`, `REPORT_DELIVERY(status, attempts)` for the retry job, `MESSAGE(caseId, createdAt)`, `AUDIT_LOG(entity, entityId)`.
