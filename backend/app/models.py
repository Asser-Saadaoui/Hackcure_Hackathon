"""Database tables. JSON columns hold AI outputs as returned (decision, assessment, AI state)."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def new_id():
    return uuid.uuid4().hex


def utcnow():
    return datetime.now(timezone.utc)


class PatientSession(Base):
    __tablename__ = 'patient_sessions'
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    device_id: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Case(Base):
    __tablename__ = 'cases'
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(ForeignKey('patient_sessions.id'), index=True)
    reference_code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    public_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default='TRIAGING', index=True)
    level: Mapped[str | None] = mapped_column(String(12), nullable=True)
    language: Mapped[str] = mapped_column(String(8), default='fr')
    decision: Mapped[dict | None] = mapped_column(JSON, nullable=True)      # app-facing Decision
    assessment: Mapped[dict | None] = mapped_column(JSON, nullable=True)    # AI assessment (scores, rules, evidence)
    ai_decision: Mapped[dict | None] = mapped_column(JSON, nullable=True)   # AI decision (actions, basis...)
    ai_state: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ai_question_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    location: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    review: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    turns: Mapped[list['Turn']] = relationship(order_by='Turn.seq', cascade='all, delete-orphan')
    referrals: Mapped[list['Referral']] = relationship(order_by='Referral.created_at', cascade='all, delete-orphan')


class Turn(Base):
    __tablename__ = 'turns'
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    case_id: Mapped[str] = mapped_column(ForeignKey('cases.id'), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    role: Mapped[str] = mapped_column(String(12))
    text: Mapped[str] = mapped_column(Text)
    quick_replies: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Referral(Base):
    __tablename__ = 'referrals'
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    case_id: Mapped[str] = mapped_column(ForeignKey('cases.id'), index=True)
    facility_key: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(16), default='SENT', index=True)
    arrival_mode: Mapped[str | None] = mapped_column(String(12), nullable=True)
    accept_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    eta_minutes: Mapped[int] = mapped_column(Integer)
    distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    match_reason: Mapped[str] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)        # rejection / timeout reason
    decided_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ChatMessage(Base):
    __tablename__ = 'chat_messages'
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    referral_id: Mapped[str] = mapped_column(ForeignKey('referrals.id'), index=True)
    case_id: Mapped[str] = mapped_column(ForeignKey('cases.id'), index=True)
    sender: Mapped[str] = mapped_column(String(12))
    sender_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    kind: Mapped[str] = mapped_column(String(16))
    text: Mapped[str] = mapped_column(Text)
    options: Mapped[list | None] = mapped_column(JSON, nullable=True)
    reply_to: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    image: Mapped['ChatImage | None'] = relationship(uselist=False, lazy='select')


class ChatImage(Base):
    """Photo attached to an IMAGE chat message: sanitized, encrypted (AES-256-GCM), with its SHA-256."""
    __tablename__ = 'chat_images'
    message_id: Mapped[str] = mapped_column(ForeignKey('chat_messages.id'), primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey('cases.id'), index=True)
    content_type: Mapped[str] = mapped_column(String(32))
    data: Mapped[bytes] = mapped_column(LargeBinary)        # AES-256-GCM ciphertext (see photo_security.py)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)      # of the stored (sanitized) image
    encryption: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Ambulance(Base):
    """Simulated ambulance (always labelled SIMULATED). Position is computed from elapsed time."""
    __tablename__ = 'ambulances'
    referral_id: Mapped[str] = mapped_column(ForeignKey('referrals.id'), primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey('cases.id'), index=True)
    unit_name: Mapped[str] = mapped_column(String(32))
    route: Mapped[list] = mapped_column(JSON)
    trip_minutes: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(24), default='DISPATCHED')
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class StaffUser(Base):
    __tablename__ = 'staff_users'
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(16))              # ED_STAFF | MANAGER | CLINICIAN | ADMIN
    hospital_key: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class StaffSession(Base):
    __tablename__ = 'staff_sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('staff_users.id'), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AvailabilityOverride(Base):
    """Values entered by ED staff. They win over the simulator until they expire or are cleared."""
    __tablename__ = 'availability_overrides'
    hospital_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    beds_available: Mapped[int | None] = mapped_column(Integer, nullable=True)
    icu_available: Mapped[int | None] = mapped_column(Integer, nullable=True)
    wait_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    equipment_down: Mapped[list | None] = mapped_column(JSON, nullable=True)
    accepting: Mapped[bool] = mapped_column(Boolean, default=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by: Mapped[str] = mapped_column(String(120))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class HospitalSettings(Base):
    """Per-hospital settings shared by the whole ED team (saved chat replies)."""
    __tablename__ = 'hospital_settings'
    hospital_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    saved_replies: Mapped[list | None] = mapped_column(JSON, nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TriageFeedback(Base):
    """Clinical feedback on the AI's level, mainly false negatives (under-triage), for the AI team."""
    __tablename__ = 'triage_feedback'
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    case_id: Mapped[str] = mapped_column(ForeignKey('cases.id'), index=True)
    referral_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    hospital_key: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(16))                 # FALSE_NEGATIVE | FALSE_POSITIVE
    ai_level: Mapped[str | None] = mapped_column(String(12), nullable=True)
    actual_level: Mapped[str] = mapped_column(String(12))
    missed_signs: Mapped[list | None] = mapped_column(JSON, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)   # AI scores, rules, version at report time
    reported_by: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class AuditLog(Base):
    __tablename__ = 'audit_log'
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    actor: Mapped[str] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(60))
    case_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
