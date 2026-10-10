"""End-to-end API flow on SQLite with a fake AI and fixed simulator values."""
import os
import tempfile

os.environ['DATABASE_URL'] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ['SIM_POLL_S'] = '3600'

import pytest
from fastapi.testclient import TestClient

from app import cli, hospitals, services
from app.db import SessionLocal, init_db
from app.main import app

PASSWORD = 'correct-horse-42'


def fake_ai(case, message, mode='interview'):
    text = message.lower()
    rules = []
    if 'poitrine' in text or 'sadri' in text:
        level, status, specialty, equipment = 'EMERGENCY', 'emergency', 'CARDIO', ['CATH_LAB']
        rules = [dict(id='R-CARD-01', name='Chest pain with breathing difficulty', severity='critical', weight=1.0, evidence=[message])]
    elif 'bizarre' in text:
        level, status, specialty, equipment = 'UNCERTAIN', 'under_review', None, []
    elif mode == 'monitor':
        level, status, specialty, equipment = 'HIGH', 'monitor', 'OBGYN', []
    elif (case.ai_state or {}).get('asked'):
        level, status, specialty, equipment = 'HIGH', 'result', 'OBGYN', []
    else:
        level, status, specialty, equipment = 'HIGH', 'question', 'OBGYN', []
    reply = dict(text='Depuis quand ?', quick_replies=['Je ne sais pas'], question_id='q1') if status == 'question' else None
    return dict(status=status, reply=reply, state=dict(asked=True, facts=[], sahhanito={'llm_notes': {'age': 30}}),
                assessment=dict(p_nlp=0.9, nlp_status='ok', s_rule=1.0 if rules else 0.6, p_final=0.97, uncertainty='LOW',
                                uncertainty_reasons=[], contributions=dict(bias=-1.5, nlp=2, rules=4), triggered_rules=rules),
                decision=dict(level=level, actions=[], suggested_specialty=specialty, required_equipment=equipment,
                              rationale='r', rationale_localized='raison'))


SIM = {k: dict(key=k, bedsAvailable=5, bedsTotal=20, icuAvailable=2, icuTotal=6, waitMinutes=30, equipmentDown=[],
               simulated=True, updatedAt='2026-10-10T00:00:00Z') for k in hospitals.FACILITIES}


@pytest.fixture(scope='module')
def client():
    services.call_ai = fake_ai
    hospitals.notify_incoming = lambda key: None
    hospitals.refresh_sim = lambda: None
    hospitals._sim_cache.update(by_key=SIM, ok=True, at=1.0)
    init_db()
    db = SessionLocal()
    cli.create(db, 'nurse@chn.tn', 'Amira', 'ED_STAFF', 'charles-nicolle', PASSWORD)
    cli.create(db, 'nurse@rabta.tn', 'Sami', 'ED_STAFF', 'la-rabta', PASSWORD)
    cli.create(db, 'dr@sahhanito.tn', 'Dr Review', 'CLINICIAN', None, PASSWORD)
    db.close()
    with TestClient(app) as c:
        yield c


def patient(client):
    token = client.post('/api/v1/session', json={}).json()['token']
    return {'Authorization': f'Bearer {token}'}


def staff(client, email):
    r = client.post('/api/v1/staff/login', json={'email': email, 'password': PASSWORD})
    assert r.status_code == 200, r.text
    return {'Authorization': f"Bearer {r.json()['token']}"}


BAB_SAADOUN = {'lat': 36.8045, 'lng': 10.1601, 'source': 'GPS'}


def test_emergency_flow_to_ambulance(client):
    p = patient(client)
    r = client.post('/api/v1/cases', json={'message': 'douleur poitrine', 'language': 'fr'}, headers=p).json()
    assert r['kind'] == 'emergency' and r['decision']['level'] == 'EMERGENCY'
    case_id = r['caseId']
    assert client.put(f'/api/v1/cases/{case_id}/location', json=BAB_SAADOUN, headers=p).status_code == 200
    case = client.get(f'/api/v1/cases/{case_id}', headers=p).json()
    assert case['status'] == 'REFERRED'
    ref = case['referral']
    assert ref['facilityId'] == 'charles-nicolle' and ref['status'] == 'SENT' and ref['edPhone'] is None
    assert 'simulée' in ref['matchReason']

    s = staff(client, 'nurse@chn.tn')
    rows = client.get('/api/v1/staff/referrals', headers=s).json()
    assert rows[0]['id'] == ref['id'] and rows[0]['level'] == 'EMERGENCY'
    detail = client.get(f"/api/v1/staff/referrals/{ref['id']}", headers=s).json()
    assert detail['case']['assessment']['triggeredRules'][0]['id'] == 'R-CARD-01'
    assert detail['report']['redFlags']
    # Another hospital cannot see it.
    assert client.get(f"/api/v1/staff/referrals/{ref['id']}", headers=staff(client, 'nurse@rabta.tn')).status_code == 404

    client.post(f"/api/v1/staff/referrals/{ref['id']}/accept", json={'arrivalMode': 'AMBULANCE'}, headers=s).raise_for_status()
    case = client.get(f'/api/v1/cases/{case_id}', headers=p).json()
    assert case['referral']['status'] == 'ACCEPTED' and case['referral']['arrivalMode'] == 'AMBULANCE'
    track = client.get(f'/api/v1/cases/{case_id}/tracking', headers=p).json()
    assert track['ambulance']['simulated'] is True and track['ambulance']['status'] == 'DISPATCHED' and len(track['route']) > 2

    # ED asks a question, the patient answers, the ED sees it.
    q = client.post(f"/api/v1/staff/referrals/{ref['id']}/chat", json={'text': 'Anticoagulants ?', 'kind': 'QUESTION',
                                                                        'options': ['Oui', 'Non']}, headers=s).json()
    chat = client.get(f"/api/v1/referrals/{ref['id']}/chat", headers=p).json()
    assert any(m['id'] == q['id'] and m['options'] == ['Oui', 'Non'] for m in chat)
    client.post(f"/api/v1/referrals/{ref['id']}/chat", json={'text': 'Non', 'kind': 'ANSWER', 'questionId': q['id']}, headers=p).raise_for_status()
    detail = client.get(f"/api/v1/staff/referrals/{ref['id']}", headers=s).json()
    assert detail['chat'][-1]['kind'] == 'ANSWER' and detail['chat'][-1]['replyTo'] == q['id']

    report = client.get(f'/api/v1/cases/{case_id}/report', headers=p).json()
    html = client.get(report['caseLink'].replace('http://localhost:8100', '')).text
    assert report['referenceCode'] in html and 'Signes' in html


def test_reject_reroutes_and_override_excludes(client):
    s_chn = staff(client, 'nurse@chn.tn')
    # Staff override: La Rabta reports no free bed, so it must never be chosen.
    s_rabta = staff(client, 'nurse@rabta.tn')
    view = client.put('/api/v1/staff/hospital/availability', json={'bedsAvailable': 0, 'note': 'saturé'}, headers=s_rabta).json()
    assert view['availability']['source'] == 'staff' and view['availability']['bedsAvailable'] == 0

    p = patient(client)
    case_id = client.post('/api/v1/cases', json={'message': 'sadri yoja3ni', 'language': 'darija'}, headers=p).json()['caseId']
    client.put(f'/api/v1/cases/{case_id}/location', json=BAB_SAADOUN, headers=p)
    first = client.get(f'/api/v1/cases/{case_id}', headers=p).json()['referral']
    assert first['facilityId'] == 'charles-nicolle'
    client.post(f"/api/v1/staff/referrals/{first['id']}/reject", json={'reason': 'Salle de cathé occupée'}, headers=s_chn).raise_for_status()
    second = client.get(f'/api/v1/cases/{case_id}', headers=p).json()['referral']
    assert second['id'] != first['id'] and second['facilityId'] not in ('charles-nicolle', 'la-rabta')
    chat = client.get(f"/api/v1/referrals/{first['id']}/chat", headers=p).json()
    assert any('ما ينجمش' in m['text'] for m in chat)   # Darija system message
    client.delete('/api/v1/staff/hospital/availability', headers=s_rabta)


def test_interview_then_high_result_and_assignment(client):
    p = patient(client)
    r = client.post('/api/v1/cases', json={'message': 'ana 7amla', 'language': 'darija'}, headers=p).json()
    assert r['kind'] == 'question' and r['turn']['quickReplies'] == ['Je ne sais pas']
    r = client.post(f"/api/v1/cases/{r['caseId']}/messages", json={'message': 'Je ne sais pas', 'language': 'darija'}, headers=p).json()
    assert r['kind'] == 'result' and r['decision']['level'] == 'HIGH'
    client.put(f"/api/v1/cases/{r['caseId']}/location", json={'lat': 36.86, 'lng': 10.19, 'source': 'MANUAL'}, headers=p)
    ref = client.get(f"/api/v1/cases/{r['caseId']}", headers=p).json()['referral']
    assert ref and ref['status'] == 'SENT'
    assert len(client.get('/api/v1/cases', headers=p).json()) == 1


def test_clinician_review(client):
    p = patient(client)
    r = client.post('/api/v1/cases', json={'message': 'je me sens bizarre', 'language': 'fr'}, headers=p).json()
    assert r['kind'] == 'under_review'
    d = staff(client, 'dr@sahhanito.tn')
    queue = client.get('/api/v1/staff/reviews', headers=d).json()
    assert any(x['caseId'] == r['caseId'] for x in queue)
    assert client.get('/api/v1/staff/reviews', headers=staff(client, 'nurse@chn.tn')).status_code == 403
    client.post(f"/api/v1/staff/reviews/{r['caseId']}", json={'level': 'HIGH', 'note': 'Vu, urgences aujourd’hui'}, headers=d).raise_for_status()
    case = client.get(f"/api/v1/cases/{r['caseId']}", headers=p).json()
    assert case['level'] == 'HIGH' and case['status'] == 'RESULT_READY'


def test_security(client):
    p1, p2 = patient(client), patient(client)
    case_id = client.post('/api/v1/cases', json={'message': 'ana 7amla', 'language': 'fr'}, headers=p1).json()['caseId']
    assert client.get(f'/api/v1/cases/{case_id}', headers=p2).status_code == 404
    assert client.get('/api/v1/cases').status_code == 401
    assert client.post('/api/v1/staff/login', json={'email': 'nurse@chn.tn', 'password': 'wrong'}).status_code == 401
    assert client.get('/api/v1/staff/referrals', headers={'Authorization': 'Bearer nope'}).status_code == 401
