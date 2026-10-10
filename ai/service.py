"""Sahhanito AI HTTP service (FastAPI).

    uvicorn service:app --port 8000          # from ai/, with the venv active

POST /turn    one patient message -> status, reply, assessment, decision, state (send state back next time)
GET  /health  readiness + versions

Stateless: the caller (backend, or the patient app in dev) stores `state` per case.
CORS is open to the Expo web dev server by default (SAHHANITO_CORS, comma-separated).
"""
import os
from pathlib import Path
from typing import Any, Literal, Optional


def _load_env(path=Path(__file__).resolve().parent / '.env'):
    """KEY=value lines from ai/.env (git-ignored). Real environment variables win."""
    if not path.exists():
        return
    for line in path.read_text(encoding='utf-8').splitlines():
        key, sep, value = line.strip().partition('=')
        if sep and key and not key.startswith('#'):
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import logging

import decision
import fusion
import interviewer
import sahhanito
from rule_engine.engine import default_engine
from triage_pipeline import _cached_state_model

logging.basicConfig(level=logging.INFO)
app = FastAPI(title='Sahhanito AI', version=sahhanito.VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get('SAHHANITO_CORS', 'http://localhost:8081,http://127.0.0.1:8081').split(','),
    allow_methods=['GET', 'POST'],
    allow_headers=['*'],
)


class TurnRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    state: Optional[dict[str, Any]] = None
    previous_question_id: Optional[str] = None
    language: Literal['fr', 'en', 'ar', 'darija'] = 'fr'
    mode: Literal['interview', 'monitor'] = 'interview'
    case_id: Optional[str] = None


@app.on_event('startup')
def warm_up():
    default_engine()
    try:
        _cached_state_model('experimental_v3')
    except Exception:
        pass  # /turn still answers: rules decide alone and the uncertainty says so


@app.post('/turn')
def turn(body: TurnRequest):
    try:
        result = sahhanito.triage_turn(body.state, body.message, body.previous_question_id,
                                       language=body.language, mode=body.mode)
    except (ValueError, TypeError) as error:
        raise HTTPException(status_code=422, detail=str(error))
    result['case_id'] = body.case_id
    return result


@app.get('/health')
def health():
    try:
        _cached_state_model('experimental_v3')
        nlp = 'ok'
    except Exception as error:
        nlp = f'unavailable: {type(error).__name__}'
    llm = interviewer.Interviewer()
    return dict(ok=True, nlp_model=nlp, llm='on' if llm.enabled else 'off (templates)',
                llm_provider=llm.provider if llm.enabled else None, llm_model=llm.model if llm.enabled else None,
                llm_models=llm.models if llm.enabled else [], llm_status=interviewer.llm_status() if llm.enabled else None,
                versions=dict(turn=sahhanito.VERSION, rules=default_engine().version, fusion=fusion.VERSION,
                              decision=decision.VERSION, interviewer=interviewer.VERSION))
