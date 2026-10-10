"""Sahhanito backend: patient app API, hospital dashboard API, live events, background workers.

    uvicorn app.main:app --port 8100
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config, hospitals, workers
from app.db import init_db
from app.events import broker
from app.routes_patient import router as patient_router
from app.routes_public import router as public_router
from app.routes_staff import router as staff_router

logging.basicConfig(level=logging.INFO)
VERSION = 'sahhanito-backend-0.1'


@asynccontextmanager
async def lifespan(_app):
    init_db()
    broker.bind(asyncio.get_running_loop())
    tasks = workers.start()
    yield
    for task in tasks:
        task.cancel()


app = FastAPI(title='Sahhanito backend', version=VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=['GET', 'POST', 'PUT', 'DELETE'],
                   allow_headers=['Authorization', 'Content-Type'])
app.include_router(patient_router)
app.include_router(staff_router)
app.include_router(public_router)


@app.get('/api/v1/health')
def health():
    import httpx
    try:
        ai = httpx.get(f'{config.AI_URL}/health', timeout=3).json()
    except Exception:
        ai = None
    return dict(ok=True, version=VERSION, ai=bool(ai and ai.get('ok')), llm=(ai or {}).get('llm'),
                simulator=hospitals.sim_status(), hospitals=len(hospitals.FACILITIES))
