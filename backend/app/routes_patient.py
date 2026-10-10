"""Patient app API (mobile/src/lib/api.ts PatientApi). Anonymous device sessions, no account."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import services
from app.db import get_db
from app.deps import patient
from app.events import sse
from app.models import Case, ChatMessage, PatientSession, Referral
from app.security import new_token, token_hash

router = APIRouter(prefix='/api/v1')
Lang = Literal['fr', 'en', 'ar', 'darija']


class NewSession(BaseModel):
    deviceId: str | None = Field(default=None, max_length=64)


class Message(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    language: Lang = 'fr'


class Location(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    accuracyM: float | None = None
    source: Literal['GPS', 'ADJUSTED', 'MANUAL', 'LAST_KNOWN']
    address: str | None = Field(default=None, max_length=200)


class Close(BaseModel):
    arrived: bool


class ChatIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    kind: Literal['TEXT', 'WORSE', 'ANSWER'] = 'TEXT'
    questionId: str | None = None


def own_case(db, s, case_id):
    case = db.get(Case, case_id)
    if not case or case.session_id != s.id:
        raise HTTPException(404, 'Case not found.')
    return case


def own_referral(db, s, referral_id):
    r = db.get(Referral, referral_id)
    if not r:
        raise HTTPException(404, 'Referral not found.')
    return own_case(db, s, r.case_id), r


@router.post('/session')
def start_session(body: NewSession | None = None, db: Session = Depends(get_db)):
    token = new_token()
    s = PatientSession(token_hash=token_hash(token), device_id=(body.deviceId if body and body.deviceId else new_token()[:16]))
    db.add(s)
    db.commit()
    return dict(userId=s.id, token=token, deviceId=s.device_id)


@router.post('/cases')
def create_case(body: Message, s: PatientSession = Depends(patient), db: Session = Depends(get_db)):
    return services.create_case(db, s, body.message.strip(), body.language)


@router.post('/cases/{case_id}/messages')
def send_message(case_id: str, body: Message, s: PatientSession = Depends(patient), db: Session = Depends(get_db)):
    case = own_case(db, s, case_id)
    case.language = body.language
    return services.triage(db, case, body.message.strip())


@router.get('/cases')
def list_cases(s: PatientSession = Depends(patient), db: Session = Depends(get_db)):
    cases = db.scalars(select(Case).where(Case.session_id == s.id).order_by(Case.created_at.desc()).limit(50))
    return [services.summary_view(c) for c in cases]


@router.get('/cases/{case_id}')
def get_case(case_id: str, s: PatientSession = Depends(patient), db: Session = Depends(get_db)):
    return services.case_view(own_case(db, s, case_id))


@router.post('/cases/{case_id}/close')
def close_case(case_id: str, body: Close, s: PatientSession = Depends(patient), db: Session = Depends(get_db)):
    services.close_case(db, own_case(db, s, case_id), body.arrived)
    return dict(ok=True)


@router.put('/cases/{case_id}/location')
def set_location(case_id: str, body: Location, s: PatientSession = Depends(patient), db: Session = Depends(get_db)):
    services.set_location(db, own_case(db, s, case_id), body.model_dump(exclude_none=True))
    return dict(ok=True)


@router.get('/cases/{case_id}/report')
def report(case_id: str, s: PatientSession = Depends(patient), db: Session = Depends(get_db)):
    return services.report_view(own_case(db, s, case_id))


@router.get('/cases/{case_id}/report.pdf')
def report_pdf(case_id: str, s: PatientSession = Depends(patient), db: Session = Depends(get_db)):
    return services.report_pdf(db, own_case(db, s, case_id), 'patient')


@router.get('/cases/{case_id}/tracking')
def tracking(case_id: str, s: PatientSession = Depends(patient), db: Session = Depends(get_db)):
    return services.tracking_view(db, own_case(db, s, case_id))


@router.get('/referrals/{referral_id}/chat')
def get_chat(referral_id: str, s: PatientSession = Depends(patient), db: Session = Depends(get_db)):
    own_referral(db, s, referral_id)
    msgs = db.scalars(select(ChatMessage).where(ChatMessage.referral_id == referral_id).order_by(ChatMessage.created_at))
    return [services.chat_view(m) for m in msgs]


@router.post('/referrals/{referral_id}/chat')
def send_chat(referral_id: str, body: ChatIn, s: PatientSession = Depends(patient), db: Session = Depends(get_db)):
    case, r = own_referral(db, s, referral_id)
    return services.chat_view(services.patient_chat(db, case, r, body.text.strip(), body.kind, body.questionId))


@router.get('/cases/{case_id}/events')
async def events(case_id: str, request: Request, s: PatientSession = Depends(patient), db: Session = Depends(get_db)):
    own_case(db, s, case_id)
    return StreamingResponse(sse(f'case:{case_id}', request), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})
