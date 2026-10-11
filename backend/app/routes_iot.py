"""Simulated IoT devices (iot-sim/): gateway assignments and signed telemetry. See app/iot.py."""
from fastapi import APIRouter, Body, Depends, Header
from sqlalchemy.orm import Session

from app import iot
from app.db import get_db

router = APIRouter(prefix='/api/v1/iot')


@router.get('/assignments')
def assignments(authorization: str | None = Header(None), db: Session = Depends(get_db)):
    iot.check_gateway(authorization)
    return iot.assignments(db)


@router.post('/telemetry')
def telemetry(message: dict = Body(...), authorization: str | None = Header(None), db: Session = Depends(get_db)):
    iot.check_gateway(authorization)
    reading = iot.ingest(db, message)
    return dict(ok=True, seq=reading.seq, alerts=reading.alerts)
