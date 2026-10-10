"""Hospital dashboard API: ED staff of one hospital, clinicians (review queue), managers (availability)."""
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config, hospitals, services
from app.db import get_db
from app.deps import clinician, hospital_staff, staff
from app.events import sse
from app.models import AvailabilityOverride, Case, Referral, StaffSession, StaffUser
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
    reason: str = Field(min_length=2, max_length=500)


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
    services.reject(db, r, user, body.reason)
    return dict(ok=True)


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


@router.get('/hospitals')
def all_hospitals(user: StaffUser = Depends(staff), db: Session = Depends(get_db)):
    return dict(simulator=hospitals.sim_status(), hospitals=[hospital_view(db, k) for k in hospitals.FACILITIES])


# ---- clinician review queue --------------------------------------------------------

@router.get('/reviews')
def reviews(user: StaffUser = Depends(clinician), db: Session = Depends(get_db)):
    cases = db.scalars(select(Case).where(Case.status == 'UNDER_REVIEW').order_by(Case.created_at))
    return [dict(caseId=c.id, referenceCode=c.reference_code, createdAt=services.iso(c.created_at), language=c.language,
                 chiefComplaint=next((x.text for x in c.turns if x.role == 'PATIENT'), ''), decision=c.decision,
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
