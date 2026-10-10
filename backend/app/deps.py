from datetime import datetime, timezone

from fastapi import Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import PatientSession, StaffSession, StaffUser
from app.security import token_hash


def _bearer(authorization, token):
    if authorization and authorization.lower().startswith('bearer '):
        return authorization[7:].strip()
    return token  # EventSource cannot set headers: SSE passes ?token=


def patient(authorization: str | None = Header(None), token: str | None = Query(None), db: Session = Depends(get_db)):
    raw = _bearer(authorization, token)
    s = db.query(PatientSession).filter_by(token_hash=token_hash(raw)).first() if raw else None
    if not s:
        raise HTTPException(401, 'Invalid or missing patient session.')
    return s


def staff(authorization: str | None = Header(None), token: str | None = Query(None), db: Session = Depends(get_db)):
    raw = _bearer(authorization, token)
    s = db.get(StaffSession, token_hash(raw)) if raw else None
    if not s or s.expires_at.replace(tzinfo=s.expires_at.tzinfo or timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(401, 'Session expired. Please sign in again.')
    user = db.get(StaffUser, s.user_id)
    if not user or not user.active:
        raise HTTPException(401, 'Account disabled.')
    return user


def hospital_staff(user: StaffUser = Depends(staff)):
    if user.role not in ('ED_STAFF', 'MANAGER') or not user.hospital_key:
        raise HTTPException(403, 'Hospital staff only.')
    return user


def clinician(user: StaffUser = Depends(staff)):
    if user.role not in ('CLINICIAN', 'ADMIN'):
        raise HTTPException(403, 'Clinicians only.')
    return user
