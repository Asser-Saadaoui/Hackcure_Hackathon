"""Hospital dashboard API: ED staff of one hospital, clinicians (review queue), managers (availability)."""
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config, hospitals, photo_security, services
from app.db import get_db
from app.deps import clinician, hospital_staff, staff
from app.events import sse
from app.models import AvailabilityOverride, Case, HospitalSettings, Referral, StaffSession, StaffUser, TriageFeedback
from app.security import new_token, token_hash, verify_password

router = APIRouter(prefix='/api/v1/staff')
Level = Literal['EMERGENCY', 'HIGH', 'LOW']


class Login(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)


class Accept(BaseModel):
    arrivalMode: Literal['SELF', 'AMBULANCE']
    note: str | None = Field(default=None, max_length=500)


class Reject(BaseModel):
    reason: str = Field(min_length=2, max_length=120)            # category chosen in the dashboard
    explanation: str = Field(min_length=10, max_length=1000)     # required free text: why, for the next team and the audit


class Reroute(BaseModel):
    facilityKey: str | None = Field(default=None, max_length=64)   # None = best remaining hospital
    reason: str = Field(min_length=2, max_length=120)
    explanation: str = Field(min_length=10, max_length=1000)


class ChatIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    kind: Literal['TEXT', 'QUESTION', 'INSTRUCTION'] = 'TEXT'
    options: list[str] | None = Field(default=None, max_length=6)


class Escalate(BaseModel):
    level: Literal['EMERGENCY', 'HIGH']
    instruction: str | None = Field(default=None, max_length=500)


class Review(BaseModel):
    level: Level
    note: str | None = Field(default=None, max_length=500)


class AvailabilityIn(BaseModel):
    bedsAvailable: int | None = Field(default=None, ge=0, le=2000)
    icuAvailable: int | None = Field(default=None, ge=0, le=500)
    waitMinutes: int | None = Field(default=None, ge=0, le=1440)
    equipmentDown: list[str] | None = None
    accepting: bool = True
    note: str | None = Field(default=None, max_length=300)
    hours: float = Field(default=config.OVERRIDE_TTL_H, gt=0, le=48)


def user_view(u):
    f = hospitals.FACILITIES.get(u.hospital_key or '', {})
    return dict(id=u.id, email=u.email, name=u.name, role=u.role, hospitalKey=u.hospital_key, hospitalName=f.get('name'))


def my_referral(db, user, referral_id):
    r = db.get(Referral, referral_id)
    if not r or r.facility_key != user.hospital_key:
        raise HTTPException(404, 'Referral not found.')
    return r


@router.post('/login')
def login(body: Login, db: Session = Depends(get_db)):
    user = db.scalar(select(StaffUser).where(StaffUser.email == body.email.strip().lower()))
    if not user or not user.active or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, 'Wrong email or password.')
    token = new_token()
    db.add(StaffSession(token_hash=token_hash(token), user_id=user.id,
                        expires_at=datetime.now(timezone.utc) + timedelta(hours=config.STAFF_SESSION_H)))
    services.audit(db, user.email, 'staff.login')
    db.commit()
    return dict(token=token, user=user_view(user))


@router.post('/logout')
def logout(request: Request, user: StaffUser = Depends(staff), db: Session = Depends(get_db)):
    raw = request.headers.get('authorization', '')[7:].strip()
    s = db.get(StaffSession, token_hash(raw))
    if s:
        db.delete(s)
        db.commit()
    return dict(ok=True)


@router.get('/me')
def me(user: StaffUser = Depends(staff)):
    return user_view(user)


# ---- incoming patients (ED staff) ------------------------------------------------

@router.get('/referrals')
def referrals(scope: Literal['active', 'history'] = 'active', user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    q = select(Referral).where(Referral.facility_key == user.hospital_key)
    q = q.where(Referral.status.in_(['SENT', 'INFO_REQUESTED', 'ACCEPTED'])) if scope == 'active' else \
        q.where(Referral.status.not_in(['SENT', 'INFO_REQUESTED', 'ACCEPTED']))
    rows = [services.referral_row(db, r) for r in db.scalars(q.order_by(Referral.created_at.desc()).limit(100))]
    order = {'EMERGENCY': 0, 'HIGH': 1, 'UNCERTAIN': 2, 'LOW': 3}
    return sorted(rows, key=lambda x: (x['status'] not in ('SENT', 'INFO_REQUESTED'), order.get(x['level'], 4))) if scope == 'active' else rows


@router.get('/referrals/{referral_id}')
def referral(referral_id: str, user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    return services.staff_case_view(db, my_referral(db, user, referral_id))


@router.post('/referrals/{referral_id}/accept')
def accept(referral_id: str, body: Accept, user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    r = my_referral(db, user, referral_id)
    services.accept(db, r, user, body.arrivalMode, body.note)
    return services.staff_case_view(db, r)


@router.post('/referrals/{referral_id}/reject')
def reject(referral_id: str, body: Reject, user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    r = my_referral(db, user, referral_id)
    services.reject(db, r, user, f'{body.reason.strip()} — {body.explanation.strip()}')
    return dict(ok=True)


@router.get('/referrals/{referral_id}/tracking')
def tracking(referral_id: str, user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    """Live map for the receiving ED: patient position, route, hospital and the simulated ambulance."""
    r = my_referral(db, user, referral_id)
    case = db.get(Case, r.case_id)
    if not case.location:
        raise HTTPException(404, 'Position du patient inconnue.')
    return dict(services.tracking_view(db, case, r), status=r.status)


@router.get('/referrals/{referral_id}/report.pdf')
def report_pdf(referral_id: str, user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    r = my_referral(db, user, referral_id)
    return services.report_pdf(db, db.get(Case, r.case_id), 'staff', referral=r)


@router.get('/referrals/{referral_id}/fhir')
def fhir_export(referral_id: str, user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    r = my_referral(db, user, referral_id)
    services.audit(db, user.email, 'export.fhir', r.case_id)
    db.commit()
    return services.fhir_response(db.get(Case, r.case_id), r)


@router.get('/referrals/{referral_id}/alternatives')
def alternatives(referral_id: str, user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    r = my_referral(db, user, referral_id)
    case = db.get(Case, r.case_id)
    if not case.location:
        return []
    tried = {x.facility_key for x in case.referrals}
    d = case.decision or {}
    rows = hospitals.rank(case.location, case.level, d.get('suggestedSpecialty'), d.get('requiredEquipment'),
                          services.overrides(db), exclude=tried, relax=True)
    return sorted(rows, key=lambda x: (not x['capable'], x['score']))[:10]


@router.post('/referrals/{referral_id}/reroute')
def reroute(referral_id: str, body: Reroute, user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    r = my_referral(db, user, referral_id)
    new = services.reroute(db, r, user, body.facilityKey, f'{body.reason.strip()} — {body.explanation.strip()}')
    return dict(ok=True, facilityName=hospitals.FACILITIES[new.facility_key]['name'] if new else None)


@router.post('/referrals/{referral_id}/arrived')
def arrived(referral_id: str, user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    r = my_referral(db, user, referral_id)
    services.mark_arrived(db, r, user.email)
    return services.staff_case_view(db, r)


@router.post('/referrals/{referral_id}/escalate')
def escalate(referral_id: str, body: Escalate, user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    r = my_referral(db, user, referral_id)
    services.escalate(db, db.get(Case, r.case_id), body.level, body.instruction, user)
    return services.staff_case_view(db, r)


@router.post('/referrals/{referral_id}/chat')
def chat(referral_id: str, body: ChatIn, user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    r = my_referral(db, user, referral_id)
    return services.chat_view(services.staff_chat(db, r, user, body.text.strip(), body.kind, body.options))


@router.get('/referrals/{referral_id}/photos/{image_id}')
def case_photo(referral_id: str, image_id: str, user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    """Photo the patient added during triage (case-level), for the hospital the case is referred to."""
    r = my_referral(db, user, referral_id)
    img, data = services.read_case_photo(db, r.case_id, image_id)
    services.audit(db, user.email, 'case.image_viewed', r.case_id, sha256=img.sha256)
    db.commit()
    return Response(data, media_type=img.content_type, headers={**photo_security.HEADERS, 'X-Content-SHA256': img.sha256})


@router.get('/referrals/{referral_id}/chat/{message_id}/image')
def chat_image(referral_id: str, message_id: str, user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    my_referral(db, user, referral_id)
    img, data = services.chat_image(db, referral_id, message_id)
    services.audit(db, user.email, 'chat.image_viewed', img.case_id, sha256=img.sha256)
    db.commit()
    return Response(data, media_type=img.content_type, headers={**photo_security.HEADERS, 'X-Content-SHA256': img.sha256 or ''})


# ---- availability (simulator + staff override) -----------------------------------

def hospital_view(db, key):
    f = hospitals.FACILITIES[key]
    return dict(key=key, name=f['name'], nameAr=f.get('nameAr'), type=f['type'], lat=f['lat'], lng=f['lng'],
                specialties=sorted(hospitals.specialties(f)), equipment=f.get('equipment', []),
                availability=hospitals.availability(key, db.get(AvailabilityOverride, key)))


@router.get('/hospital')
def my_hospital(user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    return hospital_view(db, user.hospital_key)


@router.put('/hospital/availability')
def set_availability(body: AvailabilityIn, user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    unknown = set(body.equipmentDown or []) - set(hospitals.FACILITIES[user.hospital_key].get('equipment', []))
    if unknown:
        raise HTTPException(422, f'Unknown equipment for this hospital: {sorted(unknown)}')
    o = db.get(AvailabilityOverride, user.hospital_key) or AvailabilityOverride(hospital_key=user.hospital_key)
    o.beds_available, o.icu_available, o.wait_minutes = body.bedsAvailable, body.icuAvailable, body.waitMinutes
    o.equipment_down, o.accepting, o.note = body.equipmentDown, body.accepting, body.note
    o.updated_by, o.updated_at = user.name, datetime.now(timezone.utc)
    o.expires_at = datetime.now(timezone.utc) + timedelta(hours=body.hours)
    db.merge(o)
    services.audit(db, user.email, 'availability.override', None, hospital=user.hospital_key, **body.model_dump(exclude={'hours'}))
    db.commit()
    return hospital_view(db, user.hospital_key)


@router.delete('/hospital/availability')
def clear_availability(user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    o = db.get(AvailabilityOverride, user.hospital_key)
    if o:
        db.delete(o)
        services.audit(db, user.email, 'availability.cleared', None, hospital=user.hospital_key)
        db.commit()
    return hospital_view(db, user.hospital_key)


RANK = {'LOW': 0, 'UNCERTAIN': 1, 'HIGH': 2, 'EMERGENCY': 3}
MISSED_SIGNS = ['Douleur thoracique', 'Détresse respiratoire', 'Signes neurologiques (AVC)', 'Trouble de conscience',
                'Hémorragie', 'Sepsis / infection grave', 'Traumatisme grave', 'Urgence obstétricale', 'Urgence pédiatrique',
                'Intoxication', 'Douleur sévère', 'Constantes anormales']


class FeedbackIn(BaseModel):
    kind: Literal['FALSE_NEGATIVE', 'FALSE_POSITIVE'] = 'FALSE_NEGATIVE'
    actualLevel: Literal['EMERGENCY', 'HIGH', 'LOW']
    missedSigns: list[str] = Field(default_factory=list, max_length=12)
    note: str | None = Field(default=None, max_length=1000)


def feedback_view(f):
    return dict(id=f.id, caseId=f.case_id, referralId=f.referral_id, hospitalKey=f.hospital_key,
                hospitalName=hospitals.FACILITIES.get(f.hospital_key or '', {}).get('name'), kind=f.kind, aiLevel=f.ai_level,
                actualLevel=f.actual_level, missedSigns=f.missed_signs or [], note=f.note, reportedBy=f.reported_by,
                createdAt=services.iso(f.created_at), snapshot=f.snapshot)


@router.get('/feedback/options')
def feedback_options(user: StaffUser = Depends(staff)):
    return dict(missedSigns=MISSED_SIGNS)


@router.post('/referrals/{referral_id}/feedback')
def report_feedback(referral_id: str, body: FeedbackIn, user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    """Report that the AI under-triaged (false negative) or over-triaged (false positive) this patient."""
    r = my_referral(db, user, referral_id)
    case = db.get(Case, r.case_id)
    ai = case.level or 'UNCERTAIN'
    if body.kind == 'FALSE_NEGATIVE' and RANK[body.actualLevel] <= RANK.get(ai, 1):
        raise HTTPException(422, f'A false negative needs an actual level higher than the AI level ({ai}).')
    if body.kind == 'FALSE_POSITIVE' and RANK[body.actualLevel] >= RANK.get(ai, 1):
        raise HTTPException(422, f'Over-triage needs an actual level lower than the AI level ({ai}).')
    a = case.assessment or {}
    f = TriageFeedback(case_id=case.id, referral_id=r.id, hospital_key=r.facility_key, kind=body.kind, ai_level=ai,
                       actual_level=body.actualLevel, missed_signs=[s.strip()[:120] for s in body.missedSigns if s.strip()],
                       note=(body.note or '').strip() or None, reported_by=user.name,
                       snapshot=dict(p_nlp=a.get('p_nlp'), s_rule=a.get('s_rule'), p_final=a.get('p_final'), uncertainty=a.get('uncertainty'),
                                     rules=[x['id'] for x in a.get('triggered_rules', [])], chief_complaint=services.chief_complaint(case),
                                     language=case.language, versions=(case.ai_decision or {}).get('decision_version')))
    db.add(f)
    services.audit(db, user.email, f'feedback.{body.kind.lower()}', case.id, ai_level=ai, actual_level=body.actualLevel)
    db.commit()
    return feedback_view(f)


@router.get('/referrals/{referral_id}/feedback')
def referral_feedback(referral_id: str, user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    r = my_referral(db, user, referral_id)
    rows = db.scalars(select(TriageFeedback).where(TriageFeedback.case_id == r.case_id).order_by(TriageFeedback.created_at.desc()))
    return [feedback_view(f) for f in rows]


@router.get('/feedback')
def all_feedback(kind: str | None = None, user: StaffUser = Depends(clinician), db: Session = Depends(get_db)):
    """All triage feedback (clinicians / AI team). ?kind=FALSE_NEGATIVE to filter."""
    q = select(TriageFeedback).order_by(TriageFeedback.created_at.desc()).limit(500)
    if kind:
        q = q.where(TriageFeedback.kind == kind)
    return [feedback_view(f) for f in db.scalars(q)]


@router.get('/feedback.csv')
def feedback_csv(user: StaffUser = Depends(clinician), db: Session = Depends(get_db)):
    import csv
    import io
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(['date', 'type', 'hospital', 'ai_level', 'actual_level', 'missed_signs', 'note', 'p_nlp', 's_rule', 'p_final',
                'uncertainty', 'rules', 'chief_complaint', 'language', 'reported_by'])
    for f in db.scalars(select(TriageFeedback).order_by(TriageFeedback.created_at)):
        snap = f.snapshot or {}
        w.writerow([services.iso(f.created_at), f.kind, f.hospital_key, f.ai_level, f.actual_level, '; '.join(f.missed_signs or []),
                    f.note or '', snap.get('p_nlp'), snap.get('s_rule'), snap.get('p_final'), snap.get('uncertainty'),
                    ' '.join(snap.get('rules') or []), snap.get('chief_complaint'), snap.get('language'), f.reported_by])
    return Response(buf.getvalue(), media_type='text/csv; charset=utf-8',
                    headers={'Content-Disposition': 'attachment; filename="sahhanito-triage-feedback.csv"'})


DEFAULT_REPLIES = [
    "Ne mangez pas et ne buvez pas avant d'être examiné.",
    "Présentez-vous à l'accueil des urgences avec ce code de dossier.",
    "Restez allongé et ne restez pas seul.",
    "Apportez vos médicaments ou leur liste.",
    "Si votre état s'aggrave, appelez le 190 immédiatement.",
]


class RepliesIn(BaseModel):
    replies: list[str] = Field(max_length=30)


@router.get('/hospital/replies')
def saved_replies(user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    s = db.get(HospitalSettings, user.hospital_key)
    return dict(replies=s.saved_replies if s and s.saved_replies is not None else DEFAULT_REPLIES,
                updatedBy=s.updated_by if s else None)


@router.put('/hospital/replies')
def set_saved_replies(body: RepliesIn, user: StaffUser = Depends(hospital_staff), db: Session = Depends(get_db)):
    replies = [r.strip()[:500] for r in body.replies if r.strip()]
    s = db.get(HospitalSettings, user.hospital_key) or HospitalSettings(hospital_key=user.hospital_key)
    s.saved_replies, s.updated_by, s.updated_at = replies, user.name, datetime.now(timezone.utc)
    db.merge(s)
    services.audit(db, user.email, 'settings.saved_replies', None, hospital=user.hospital_key, count=len(replies))
    db.commit()
    return dict(replies=replies, updatedBy=user.name)


@router.get('/hospitals')
def all_hospitals(user: StaffUser = Depends(staff), db: Session = Depends(get_db)):
    return dict(simulator=hospitals.sim_status(), hospitals=[hospital_view(db, k) for k in hospitals.FACILITIES])


# ---- simulation scenario (clinicians / admins drive the hospital simulator) ----------------

def _audit_sim(email, method, path, body):
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        services.audit(db, email, 'simulation.change', None, method=method, path=path, body=body)
        db.commit()
    finally:
        db.close()


@router.api_route('/sim/{path:path}', methods=['GET', 'POST', 'PUT', 'DELETE'])
async def simulator_proxy(path: str, request: Request, user: StaffUser = Depends(clinician)):
    """Forwards /staff/sim/<path> to the hospital simulator, then refreshes the availability cache at once."""
    import asyncio
    import httpx
    if not (path == 'scenario' or path.startswith('scenario/') or (path.startswith('hospitals/') and path.endswith('/settings'))):
        raise HTTPException(404, 'Not found')
    body = await request.body()
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.request(request.method, f'{config.SIM_URL}/{path}', params=dict(request.query_params),
                                        content=body or None, headers={'content-type': 'application/json'})
    except httpx.HTTPError:
        raise HTTPException(503, 'Simulateur injoignable.')
    if request.method != 'GET':
        await asyncio.to_thread(hospitals.refresh_sim)
        await asyncio.to_thread(_audit_sim, user.email, request.method, path, body.decode('utf-8', 'replace')[:500])
    if resp.status_code >= 400:
        detail = resp.json().get('detail') if resp.headers.get('content-type', '').startswith('application/json') else resp.text
        raise HTTPException(resp.status_code, detail if isinstance(detail, str) else str(detail))
    return resp.json()


# ---- clinician review queue --------------------------------------------------------

@router.get('/reviews')
def reviews(user: StaffUser = Depends(clinician), db: Session = Depends(get_db)):
    cases = db.scalars(select(Case).where(Case.status == 'UNDER_REVIEW').order_by(Case.created_at))
    return [dict(caseId=c.id, referenceCode=c.reference_code, createdAt=services.iso(c.created_at), language=c.language,
                 chiefComplaint=services.chief_complaint(c), decision=c.decision,
                 assessment=c.assessment, transcript=[services.turn_view(x) for x in c.turns],
                 report=services.structured_report(c)) for c in cases]


@router.post('/reviews/{case_id}')
def do_review(case_id: str, body: Review, user: StaffUser = Depends(clinician), db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(404, 'Case not found.')
    services.review(db, case, user, body.level, body.note)
    return dict(ok=True)


# ---- live events ---------------------------------------------------------------------

@router.get('/events')
async def events(request: Request, user: StaffUser = Depends(staff)):
    topic = f'hospital:{user.hospital_key}' if user.hospital_key else 'reviews'
    return StreamingResponse(sse(topic, request), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})
