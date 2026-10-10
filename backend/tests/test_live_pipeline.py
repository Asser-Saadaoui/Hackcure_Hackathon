"""Opt-in synthetic contracts against the actual local backend + AI + hospital simulator.

LIVE_API_URL=http://localhost:8100 pytest tests/test_live_pipeline.py -q
Never point this at a production service: tests create fictional patient cases.
"""
import os
import httpx
import pytest

BASE = os.environ.get('LIVE_API_URL', '')
pytestmark = pytest.mark.skipif(not BASE, reason='LIVE_API_URL not configured')


@pytest.fixture
def patient():
    with httpx.Client(base_url=BASE, timeout=30) as client:
        session = client.post('/api/v1/session', json={})
        session.raise_for_status()
        client.headers['Authorization'] = f"Bearer {session.json()['token']}"
        yield client


@pytest.mark.parametrize('language,message', [
    ('en', 'I have chest pain and cannot breathe'),
    ('darija', '3andi wja3 fi sadri w ma najamch netnaffes'),
    ('ar', 'صدري يوجعني وما نجمش نتنفس'),
])
def test_critical_interrupts_and_matches_hospital(patient, language, message):
    response = patient.post('/api/v1/cases', json={'message': message, 'language': language})
    response.raise_for_status()
    result = response.json()
    assert result['kind'] == 'emergency', result
    case_id = result['caseId']
    location = patient.put(f'/api/v1/cases/{case_id}/location', json={
        'lat': 36.8065, 'lng': 10.1815, 'source': 'MANUAL', 'address': 'Synthetic Tunis Centre',
    })
    location.raise_for_status()
    case = patient.get(f'/api/v1/cases/{case_id}').json()
    assert case['level'] == 'EMERGENCY'
    assert case['referral'] is not None
    assert case['referral']['status'] == 'SENT'


def test_unfamiliar_input_requests_clarification(patient):
    response = patient.post('/api/v1/cases', json={'message': '3andi 7aja ghriba', 'language': 'darija'})
    response.raise_for_status()
    result = response.json()
    assert result['kind'] == 'question', result
    assert result['turn']['text']
    case = patient.get(f"/api/v1/cases/{result['caseId']}").json()
    assert case['status'] == 'TRIAGING'
