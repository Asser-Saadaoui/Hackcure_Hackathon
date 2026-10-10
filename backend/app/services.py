"""Case lifecycle: AI triage turns, automatic hospital assignment, referrals, ED chat, clinician
review, simulated ambulance and the structured report.

Every state change is committed, audited and published as a live event:
  case:<id>       -> patient app (PatientEvent shapes of mobile/src/lib/types.ts)
  hospital:<key>  -> ED dashboard of that hospital
  reviews         -> clinician review queue
"""
import math
import re
import secrets
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config, hospitals
from app.events import broker
from app.models import Ambulance, AuditLog, AvailabilityOverride, Case, ChatMessage, Referral, Turn, utcnow

CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
ACTIVE_REFERRAL = ('SENT', 'INFO_REQUESTED', 'ACCEPTED')

TEXT = {
    'sent': {'fr': 'Dossier envoyé à {h}', 'en': 'Case sent to {h}', 'ar': 'تم إرسال الملف إلى {h}', 'darija': 'الملف تبعث لـ {h}'},
    'accepted': {'fr': 'Accepté par {h}', 'en': 'Accepted by {h}', 'ar': 'تم القبول من {h}', 'darija': 'قبلوك في {h}'},
    'rerouted': {'fr': '{h} ne peut pas vous recevoir. Nous cherchons un autre hôpital.', 'en': '{h} cannot receive you. We are finding another hospital.',
                 'ar': '{h} لا يستطيع استقبالك. نبحث عن مستشفى آخر.', 'darija': '{h} ما ينجمش يستقبلك. قاعدين نلوجو على سبيطار آخر.'},
    'moved': {'fr': 'Votre dossier est transféré à {h}.', 'en': 'Your case is transferred to {h}.',
              'ar': 'تم تحويل ملفك إلى {h}.', 'darija': 'الملف متاعك تحوّل لـ {h}.'},
    'none': {'fr': 'Aucun hôpital disponible pour le moment. Appelez le 190.', 'en': 'No hospital is available right now. Call 190.',
             'ar': 'لا يوجد مستشفى متاح حاليًا. اتصل بالرقم 190.', 'darija': 'ما فماش سبيطار متاح توا. عيّط للـ190.'},
    'arrived': {'fr': 'Arrivé à {h}', 'en': 'Arrived at {h}', 'ar': 'الوصول إلى {h}', 'darija': 'وصلت لـ {h}'},
    'ambulance_note': {'fr': 'Une ambulance (simulée) est en route. Restez où vous êtes.', 'en': 'An ambulance (simulated) is on its way. Stay where you are.',
                       'ar': 'سيارة إسعاف (محاكاة) في الطريق. ابق في مكانك.', 'darija': 'كرهبة إسعاف (محاكاة) جاية. أقعد في بلاصتك.'},
    'self_note': {'fr': 'Présentez-vous aux urgences.', 'en': 'Please come to the emergency department.',
                  'ar': 'توجه إلى قسم الاستعجالي.', 'darija': 'إمشي للاستعجالي.'},
    'red_flag': {'fr': 'Signe d’alerte détecté dans votre message. Appelez le 190 maintenant.', 'en': 'Warning sign detected in your message. Call 190 now.',
                 'ar': 'تم رصد علامة خطر في رسالتك. اتصل بالرقم 190 الآن.', 'darija': 'فما علامة خطر في الميساج متاعك. عيّط للـ190 توا.'},
    'ai_down': {'fr': "Nous ne pouvons pas analyser votre message pour l'instant. En cas de douleur thoracique, difficulté à respirer, saignement important ou malaise, appelez le 190.",
                'en': 'We cannot analyse your message right now. For chest pain, breathing difficulty, heavy bleeding or fainting, call 190.',
                'ar': 'لا يمكننا تحليل رسالتك حاليًا. في حالة ألم الصدر أو صعوبة التنفس أو نزيف قوي أو إغماء، اتصل بالرقم 190.',
                'darija': 'ما نجموش نحللو الميساج متاعك توا. كان عندك وجيعة في الصدر، صعوبة في التنفس، نزيف قوي ولا دوخة، عيّط للـ190.'},
}


def t(key, lang, **kw):
    return TEXT[key].get(lang, TEXT[key]['fr']).format(**kw)


def iso(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def audit(db, actor, action, case_id=None, **data):
    db.add(AuditLog(actor=actor, action=action, case_id=case_id, data=data or None))


def overrides(db):
    return {o.hospital_key: o for o in db.scalars(select(AvailabilityOverride))}


# ---------------------------------------------------------------------------- views

def decision_view(case):
    return case.decision


def referral_view(r):
    f = hospitals.FACILITIES.get(r.facility_key, {})
    return dict(id=r.id, caseId=r.case_id, facilityId=r.facility_key, facilityName=f.get('name', r.facility_key),
                edPhone=f.get('edPhone'), lat=f.get('lat'), lng=f.get('lng'), status=r.status,
                arrivalMode=r.arrival_mode, acceptNote=r.accept_note, etaMinutes=r.eta_minutes,
                matchReason=r.match_reason, createdAt=iso(r.created_at))


def current_referral(case):
    """The referral the patient follows: the active one, else the latest that ended well."""
    for r in reversed(case.referrals):
        if r.status in ACTIVE_REFERRAL or r.status in ('ARRIVED', 'COMPLETED'):
            return r
    return case.referrals[-1] if case.referrals and case.referrals[-1].status not in ('REJECTED', 'TIMED_OUT', 'REROUTED') else None


def turn_view(tr):
    return dict(id=tr.id, role=tr.role, text=tr.text, createdAt=iso(tr.created_at), quickReplies=tr.quick_replies or None)


def case_view(case):
    r = current_referral(case)
    return dict(id=case.id, referenceCode=case.reference_code, status=case.status, level=case.level,
                decision=decision_view(case), turns=[turn_view(x) for x in case.turns], location=case.location,
                referral=referral_view(r) if r else None, createdAt=iso(case.created_at), closedAt=iso(case.closed_at))


def summary_view(case):
    r = current_referral(case)
    return dict(id=case.id, referenceCode=case.reference_code, status=case.status, level=case.level,
                facilityName=hospitals.FACILITIES.get(r.facility_key, {}).get('name') if r else None, createdAt=iso(case.created_at))


def chat_view(m):
    out = dict(id=m.id, referralId=m.referral_id, sender=m.sender, kind=m.kind, text=m.text, createdAt=iso(m.created_at))
    if m.sender_name:
        out['senderName'] = m.sender_name
    if m.options is not None:
        out['options'] = m.options
    if m.reply_to:
        out['replyTo'] = m.reply_to
    return out


def publish_case(case, event):
    broker.publish(f'case:{case.id}', dict(caseId=case.id, **event))


def publish_hospital(key, event):
    broker.publish(f'hospital:{key}', event)


# ---------------------------------------------------------------------------- AI

def to_decision(ai):
    a, d = ai['assessment'], ai['decision']
    return dict(level=d['level'], uncertainty=a['uncertainty'], pFinal=a['p_final'], rationale=d['rationale_localized'],
                suggestedSpecialty=d['suggested_specialty'], requiredEquipment=d['required_equipment'],
                triggeredRules=[dict(id=r['id'], name=r['name'], severity=r['severity']) for r in a['triggered_rules']])


def call_ai(case, message, mode='interview'):
    body = dict(message=message, state=case.ai_state, previous_question_id=case.ai_question_id if mode == 'interview' else None,
                language=case.language, mode=mode, case_id=case.id)
    resp = httpx.post(f'{config.AI_URL}/turn', json=body, timeout=config.AI_TIMEOUT_S)
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------- triage

def _add_turn(db, case, role, text, quick=None):
    tr = Turn(case_id=case.id, seq=len(case.turns), role=role, text=text, quick_replies=quick)
    db.add(tr)
    case.turns.append(tr)
    return tr


def _reference_code(db):
    while True:
        code = 'SH-' + ''.join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        if not db.scalar(select(Case.id).where(Case.reference_code == code)):
            return code


def create_case(db, session, message, language):
    case = Case(session_id=session.id, reference_code=_reference_code(db), public_token=secrets.token_urlsafe(24),
                language=language if language in ('fr', 'en', 'ar', 'darija') else 'fr')
    db.add(case)
    db.flush()
    return triage(db, case, message)


def triage(db, case, message):
    # A patient waiting for a clinician can still add information ("my symptoms are getting worse"):
    # the AI re-evaluates and may escalate before the clinician has decided.
    if case.status not in ('TRIAGING', 'UNDER_REVIEW'):
        raise HTTPException(409, 'This case is no longer in triage.')
    _add_turn(db, case, 'PATIENT', message)
    try:
        ai = call_ai(case, message)
    except (httpx.HTTPError, ValueError, KeyError):
        text = t('ai_down', case.language)
        _add_turn(db, case, 'SYSTEM', text)
        audit(db, 'system', 'ai.degraded', case.id)
        db.commit()
        return dict(kind='degraded', caseId=case.id, message=text)

    case.ai_state = ai['state']
    case.assessment = ai['assessment']
    case.ai_decision = ai['decision']
    case.ai_question_id = (ai.get('reply') or {}).get('question_id')
    decision = to_decision(ai)
    case.decision = decision
    case.level = decision['level']
    audit(db, 'ai', 'triage.turn', case.id, status=ai['status'], level=decision['level'], p_final=decision['pFinal'])

    status = ai['status']
    if status == 'question':
        tr = _add_turn(db, case, 'ASSISTANT', ai['reply']['text'], ai['reply'].get('quick_replies') or None)
        db.commit()
        return dict(kind='question', caseId=case.id, turn=turn_view(tr))
    if status == 'emergency':
        case.status = 'EMERGENCY'
        result = dict(kind='emergency', caseId=case.id, decision=decision)
    elif status == 'under_review':
        case.status = 'UNDER_REVIEW'
        result = dict(kind='under_review', caseId=case.id, decision=decision)
    else:
        case.status = 'RESULT_READY'
        result = dict(kind='result', caseId=case.id, decision=decision)
    db.commit()
    if case.status == 'UNDER_REVIEW':
        broker.publish('reviews', dict(type='review.new', caseId=case.id))
    assign_if_needed(db, case)
    return result


def needs_hospital(case):
    return case.status == 'EMERGENCY' or (case.status == 'RESULT_READY' and case.level in ('HIGH', 'EMERGENCY'))


def set_location(db, case, location):
    case.location = location
    db.commit()
    assign_if_needed(db, case)


# ---------------------------------------------------------------------------- referrals

def assign_if_needed(db, case):
    if not case.location or not needs_hospital(case):
        return None
    if any(r.status in ACTIVE_REFERRAL or r.status in ('ARRIVED', 'COMPLETED') for r in case.referrals):
        return None
    return route_case(db, case)


def alternatives(db, case):
    """Hospitals the case could go to now (best first), excluding every hospital already tried."""
    tried = {r.facility_key for r in case.referrals}
    d = case.decision or {}
    return hospitals.rank(case.location, case.level, d.get('suggestedSpecialty'), d.get('requiredEquipment'), overrides(db), exclude=tried)


def route_case(db, case, target=None, actor='system'):
    """Send the case to `target` (chosen by ED staff) or to the best remaining hospital."""
    if target:
        ranked = [x for x in hospitals.rank(case.location, case.level, (case.decision or {}).get('suggestedSpecialty'),
                                            (case.decision or {}).get('requiredEquipment'), overrides(db), relax=True)
                  if x['key'] == target]
        if not ranked:
            raise HTTPException(409, 'This hospital cannot receive patients right now.')
    else:
        ranked = alternatives(db, case)
    if not ranked:
        last = case.referrals[-1] if case.referrals else None
        if last:
            add_chat(db, case, last, 'SYSTEM', 'SYSTEM', t('none', case.language))
        audit(db, 'system', 'referral.none_available', case.id)
        db.commit()
        return None
    best = ranked[0]
    r = Referral(case_id=case.id, facility_key=best['key'], eta_minutes=best['eta'], distance_km=best['km'], match_reason=best['reason'])
    db.add(r)
    case.referrals.append(r)
    case.status = 'REFERRED'
    db.flush()
    add_chat(db, case, r, 'SYSTEM', 'SYSTEM', t('sent', case.language, h=best['name']))
    audit(db, getattr(actor, 'email', actor), 'referral.sent', case.id, hospital=best['key'], score=best['score'], chosen_by_staff=bool(target))
    db.commit()
    hospitals.notify_incoming(best['key'])
    publish_case(case, dict(type='referral.status', referral=referral_view(r)))
    publish_hospital(best['key'], dict(type='referral.new', referralId=r.id, caseId=case.id, level=case.level))
    return r


def accept(db, r, user, arrival_mode, note):
    case = db.get(Case, r.case_id)
    if r.status not in ('SENT', 'INFO_REQUESTED'):
        raise HTTPException(409, f'Referral is {r.status}.')
    if arrival_mode == 'AMBULANCE' and not case.location:
        raise HTTPException(409, 'No patient location: cannot dispatch an ambulance.')
    r.status = 'ACCEPTED'
    r.arrival_mode = arrival_mode
    r.accept_note = note or t('ambulance_note' if arrival_mode == 'AMBULANCE' else 'self_note', case.language)
    r.decided_by, r.decided_at = user.name, utcnow()
    name = hospitals.FACILITIES[r.facility_key]['name']
    add_chat(db, case, r, 'SYSTEM', 'SYSTEM', t('accepted', case.language, h=name))
    if arrival_mode == 'AMBULANCE':
        start_ambulance(db, case, r)
    audit(db, user.email, 'referral.accepted', case.id, arrival_mode=arrival_mode)
    db.commit()
    publish_case(case, dict(type='referral.status', referral=referral_view(r)))
    publish_hospital(r.facility_key, dict(type='referral.updated', referralId=r.id, status=r.status))


def reject(db, r, actor, reason, status='REJECTED'):
    case = db.get(Case, r.case_id)
    if r.status not in ('SENT', 'INFO_REQUESTED'):
        raise HTTPException(409, f'Referral is {r.status}.')
    r.status, r.reason, r.decided_at = status, reason, utcnow()
    r.decided_by = getattr(actor, 'name', actor)
    name = hospitals.FACILITIES[r.facility_key]['name']
    add_chat(db, case, r, 'SYSTEM', 'SYSTEM', t('rerouted', case.language, h=name))
    audit(db, getattr(actor, 'email', actor), f'referral.{status.lower()}', case.id, reason=reason)
    db.commit()
    publish_hospital(r.facility_key, dict(type='referral.updated', referralId=r.id, status=r.status))
    case.status = 'EMERGENCY' if case.level == 'EMERGENCY' else 'RESULT_READY'
    db.commit()
    route_case(db, case)


def reroute(db, r, user, target, reason):
    """ED staff move a case (pending or already accepted) to another hospital, chosen or automatic."""
    case = db.get(Case, r.case_id)
    if r.status not in ('SENT', 'INFO_REQUESTED', 'ACCEPTED'):
        raise HTTPException(409, f'Referral is {r.status}.')
    if target == r.facility_key or target in {x.facility_key for x in case.referrals}:
        raise HTTPException(409, 'This hospital already had this case.')
    if not case.location:
        raise HTTPException(409, 'No patient location: cannot reroute.')
    if not target and not alternatives(db, case):
        raise HTTPException(409, 'No other hospital can receive this patient right now. Keep the case or call the SAMU (190).')
    r.status, r.reason, r.decided_by, r.decided_at = 'REROUTED', reason, user.name, utcnow()
    amb = db.get(Ambulance, r.id)
    if amb and amb.status != 'ARRIVED':
        amb.status = 'CANCELLED'
    audit(db, user.email, 'referral.rerouted', case.id, reason=reason, target=target or 'auto')
    db.flush()
    try:
        new = route_case(db, case, target=target, actor=user)
    except HTTPException:
        db.rollback()
        raise
    if new:
        name = hospitals.FACILITIES[new.facility_key]['name']
        add_chat(db, case, r, 'SYSTEM', 'SYSTEM', t('moved', case.language, h=name))
        db.commit()
    publish_hospital(r.facility_key, dict(type='referral.updated', referralId=r.id, status=r.status))
    return new


def expire_referrals(db):
    """Background: a hospital that does not answer in time is skipped (TIMED_OUT -> next hospital)."""
    now = datetime.now(timezone.utc)
    for r in db.scalars(select(Referral).where(Referral.status == 'SENT')):
        case = db.get(Case, r.case_id)
        limit = config.REFERRAL_TIMEOUT_S.get(case.level or 'HIGH', config.REFERRAL_TIMEOUT_S['HIGH'])
        created = r.created_at if r.created_at.tzinfo else r.created_at.replace(tzinfo=timezone.utc)
        if (now - created).total_seconds() > limit:
            reject(db, r, 'system', f'No answer within {int(limit)} s', status='TIMED_OUT')


def mark_arrived(db, r, actor):
    case = db.get(Case, r.case_id)
    if r.status not in ('ACCEPTED', 'SENT', 'INFO_REQUESTED'):
        return
    r.status = 'ARRIVED'
    amb = db.get(Ambulance, r.id)
    if amb:
        amb.status = 'ARRIVED'
    add_chat(db, case, r, 'SYSTEM', 'SYSTEM', t('arrived', case.language, h=hospitals.FACILITIES[r.facility_key]['name']))
    audit(db, actor, 'referral.arrived', case.id)
    db.commit()
    publish_case(case, dict(type='referral.status', referral=referral_view(r)))
    publish_hospital(r.facility_key, dict(type='referral.updated', referralId=r.id, status=r.status))


def close_case(db, case, arrived):
    r = current_referral(case)
    if r and arrived:
        mark_arrived(db, r, 'patient')
    elif r and r.status in ACTIVE_REFERRAL:
        r.status = 'CANCELLED'
        publish_hospital(r.facility_key, dict(type='referral.updated', referralId=r.id, status=r.status))
    case.status, case.closed_at = 'CLOSED', utcnow()
    audit(db, 'patient', 'case.closed', case.id, arrived=arrived)
    db.commit()


def escalate(db, case, level, instruction, actor):
    rank_ = {'LOW': 0, 'UNCERTAIN': 1, 'HIGH': 2, 'EMERGENCY': 3}
    if rank_.get(level, 0) <= rank_.get(case.level or 'LOW', 0):
        return
    case.level = level
    case.decision = dict(case.decision or {}, level=level)
    if case.status in ('RESULT_READY', 'UNDER_REVIEW'):
        case.status = 'EMERGENCY' if level == 'EMERGENCY' else 'RESULT_READY'
    r = current_referral(case)
    if r and instruction:
        add_chat(db, case, r, 'STAFF', 'INSTRUCTION', instruction, sender_name=getattr(actor, 'name', None))
    audit(db, getattr(actor, 'email', actor), 'case.escalated', case.id, level=level)
    db.commit()
    publish_case(case, dict(type='case.escalated', level=level, instruction=instruction))
    if r:
        publish_hospital(r.facility_key, dict(type='case.escalated', referralId=r.id, level=level))
    assign_if_needed(db, case)


def review(db, case, user, level, note):
    if case.status != 'UNDER_REVIEW':
        raise HTTPException(409, 'Case is not waiting for review.')
    decision = dict(case.decision or {}, level=level, uncertainty='LOW',
                    rationale=note or (case.decision or {}).get('rationale', ''))
    if level in ('HIGH', 'EMERGENCY') and not decision.get('suggestedSpecialty'):
        decision['suggestedSpecialty'] = 'EMERG'
    case.decision, case.level = decision, level
    case.status = 'EMERGENCY' if level == 'EMERGENCY' else 'RESULT_READY'
    case.review = dict(by=user.name, at=iso(utcnow()), level=level, note=note)
    audit(db, user.email, 'case.reviewed', case.id, level=level)
    db.commit()
    publish_case(case, dict(type='case.reviewed', level=level, decision=decision))
    broker.publish('reviews', dict(type='review.done', caseId=case.id))
    assign_if_needed(db, case)


# ---------------------------------------------------------------------------- chat

def add_chat(db, case, r, sender, kind, text, options=None, reply_to=None, sender_name=None):
    m = ChatMessage(referral_id=r.id, case_id=case.id, sender=sender, kind=kind, text=text, options=options,
                    reply_to=reply_to, sender_name=sender_name)
    db.add(m)
    db.flush()
    view = chat_view(m)
    publish_case(case, dict(type='chat.message', message=view))
    publish_hospital(r.facility_key, dict(type='chat.message', referralId=r.id, message=view))
    return m


def patient_chat(db, case, r, text, kind, question_id):
    if kind not in ('TEXT', 'WORSE', 'ANSWER'):
        raise HTTPException(422, 'Invalid message kind.')
    m = add_chat(db, case, r, 'PATIENT', kind, text, reply_to=question_id)
    if r.status == 'INFO_REQUESTED' and kind == 'ANSWER':
        r.status = 'SENT'
    db.commit()
    # Every patient message after referral is screened by the AI (monitor mode: rules + NLP, no question).
    try:
        ai = call_ai(case, text, mode='monitor')
        case.ai_state = ai['state']
        level = ai['decision']['level']
        db.commit()
        if level == 'EMERGENCY' and case.level != 'EMERGENCY':
            add_chat(db, case, r, 'SYSTEM', 'RED_FLAG', t('red_flag', case.language))
            escalate(db, case, 'EMERGENCY', None, 'ai')
    except (httpx.HTTPError, ValueError, KeyError):
        pass
    if kind == 'WORSE':
        publish_hospital(r.facility_key, dict(type='patient.worse', referralId=r.id, caseId=case.id))
    return m


def staff_chat(db, r, user, text, kind, options):
    if kind not in ('TEXT', 'QUESTION', 'INSTRUCTION'):
        raise HTTPException(422, 'Invalid message kind.')
    case = db.get(Case, r.case_id)
    m = add_chat(db, case, r, 'STAFF', kind, text, options=options if kind == 'QUESTION' else None,
                 sender_name=f"{user.name} · {hospitals.FACILITIES[r.facility_key]['shortName'] or 'Urgences'}")
    if kind == 'QUESTION' and r.status == 'SENT':
        r.status = 'INFO_REQUESTED'
        publish_case(case, dict(type='referral.status', referral=referral_view(r)))
    audit(db, user.email, f'chat.{kind.lower()}', case.id)
    db.commit()
    return m


# ---------------------------------------------------------------------------- ambulance (simulated)

def build_route(a, b, points=30):
    """Smooth bent line between two points (a routing engine such as OSRM can replace it)."""
    bend = dict(lat=(b['lng'] - a['lng']) * 0.15, lng=-(b['lat'] - a['lat']) * 0.15)
    out = []
    for i in range(points + 1):
        s = i / points
        k = 4 * s * (1 - s)
        out.append(dict(lat=a['lat'] + (b['lat'] - a['lat']) * s + bend['lat'] * k,
                        lng=a['lng'] + (b['lng'] - a['lng']) * s + bend['lng'] * k))
    return out


def start_ambulance(db, case, r):
    if db.get(Ambulance, r.id):
        return
    f = hospitals.FACILITIES[r.facility_key]
    route = build_route(dict(lat=f['lat'], lng=f['lng']), case.location)
    km = hospitals.distance_km(case.location, f)
    db.add(Ambulance(referral_id=r.id, case_id=case.id, unit_name=f"AMB-{secrets.randbelow(90) + 10}",
                     route=route, trip_minutes=max(4.0, km / 40 * 60)))


DISPATCH_MIN, AT_PATIENT_MIN = 1.0, 4.0


def ambulance_view(amb, r):
    """Pure function of elapsed time, so it survives restarts.
    etaMinutes = until the ambulance reaches the patient (before pickup), then until the hospital."""
    started = amb.started_at if amb.started_at.tzinfo else amb.started_at.replace(tzinfo=timezone.utc)
    elapsed = (datetime.now(timezone.utc) - started).total_seconds() / 60 * config.AMBULANCE_TIME_SCALE
    trip, route = amb.trip_minutes, amb.route
    f = hospitals.FACILITIES[r.facility_key]
    at_patient = DISPATCH_MIN + trip            # minute the ambulance reaches the patient
    leaves = at_patient + AT_PATIENT_MIN        # minute it leaves with the patient
    arrives = leaves + trip                     # minute it reaches the hospital

    def point(path, frac):
        return path[min(len(path) - 1, math.floor(max(0.0, frac) * (len(path) - 1)))]

    if elapsed < DISPATCH_MIN:
        status, pos, eta = 'DISPATCHED', route[0], at_patient - elapsed
    elif elapsed < at_patient:
        status, pos, eta = 'EN_ROUTE_TO_PATIENT', point(route, (elapsed - DISPATCH_MIN) / trip), at_patient - elapsed
    elif elapsed < leaves:
        status, pos, eta = 'AT_PATIENT', route[-1], arrives - elapsed
    elif elapsed < arrives:
        status, pos, eta = 'TRANSPORTING', point(route[::-1], (elapsed - leaves) / trip), arrives - elapsed
    else:
        status, pos, eta = 'ARRIVED', dict(lat=f['lat'], lng=f['lng']), 0
    return dict(unitName=amb.unit_name, status=status, position=pos, etaMinutes=max(0, round(eta)), simulated=True)


def tick_ambulances(db):
    for amb in db.scalars(select(Ambulance).where(Ambulance.status.not_in(['ARRIVED', 'CANCELLED']))):
        r = db.get(Referral, amb.referral_id)
        case = db.get(Case, amb.case_id)
        view = ambulance_view(amb, r)
        publish_case(case, dict(type='tracking.position', ambulance=view))
        if view['status'] != amb.status:
            amb.status = view['status']
            db.commit()
            publish_hospital(r.facility_key, dict(type='ambulance.status', referralId=r.id, status=view['status']))
        if view['status'] == 'ARRIVED':
            mark_arrived(db, r, 'ambulance')


def tracking_view(db, case):
    r = current_referral(case)
    if not r:
        raise HTTPException(404, 'No hospital assigned yet.')
    f = hospitals.FACILITIES[r.facility_key]
    hospital = dict(lat=f['lat'], lng=f['lng'], name=f['name'], edPhone=f.get('edPhone'))
    loc = case.location
    patient = dict(lat=loc['lat'], lng=loc['lng'], address=loc.get('address')) if loc else None
    amb = db.get(Ambulance, r.id)
    view = ambulance_view(amb, r) if amb else None
    return dict(caseId=case.id, referralId=r.id, arrivalMode=r.arrival_mode, hospital=hospital, patient=patient,
                ambulance=view, route=build_route(hospital, patient) if patient else [],
                distanceKm=round(hospitals.distance_km(patient, hospital), 1) if patient else None,
                etaMinutes=view['etaMinutes'] if view else r.eta_minutes)


# ---------------------------------------------------------------------------- report

ACTIONS = {
    'EMERGENCY': ['Appeler le 190 si ce n’est pas déjà fait.', 'Ne pas conduire. Rester accompagné.', 'Prise en charge immédiate aux urgences.'],
    'HIGH': ['Se rendre aux urgences aujourd’hui.', 'Apporter la liste des médicaments en cours.'],
    'LOW': ['Repos et surveillance à domicile.', 'Consulter un médecin si les symptômes persistent ou s’aggravent.'],
    'UNCERTAIN': ['Un médecin vérifie la situation.', 'Appeler le 190 en cas d’aggravation.'],
}
FIELD_LABELS = {'age': 'Âge', 'duration': 'Durée', 'onset': 'Début', 'severity': 'Intensité'}
# French labels for the extractor's concepts, so reports never show a bare "Yes" from a linked answer.
FR_CONCEPTS = {
    'chest': 'Douleur thoracique', 'breath': 'Difficulté à respirer', 'breath_functional_impairment': 'Essoufflement empêchant de parler',
    'headache': 'Maux de tête', 'confusion': 'Confusion', 'fever': 'Fièvre', 'cough': 'Toux', 'nausea': 'Nausées', 'vomiting': 'Vomissements',
    'diarrhea': 'Diarrhée', 'dizziness': 'Vertiges', 'weakness': 'Faiblesse', 'numbness': 'Engourdissement', 'palpitations': 'Palpitations',
    'rash': 'Éruption cutanée', 'wheeze': 'Sifflement respiratoire', 'seizure': 'Convulsions', 'fatigue': 'Fatigue', 'syncope': 'Malaise / perte de connaissance',
    'dysuria': 'Brûlures urinaires', 'hematuria': 'Sang dans les urines', 'hemoptysis': 'Crachats de sang', 'edema': 'Œdème / gonflement',
    'vision_loss': 'Perte de vision', 'neck_stiffness': 'Raideur de la nuque', 'melena': 'Selles noires', 'abdominal_pain': 'Douleur abdominale',
    'photophobia': 'Gêne à la lumière', 'speech': 'Difficulté à parler', 'dysphagia': 'Difficulté à avaler', 'itching': 'Démangeaisons',
    'asthma': 'Asthme', 'copd': 'BPCO', 'diabetes': 'Diabète', 'hypertension': 'Hypertension', 'stroke': 'AVC', 'heart_attack': 'Infarctus',
    'pregnancy': 'Grossesse', 'epilepsy': 'Épilepsie', 'cancer': 'Cancer', 'kidney_disease': 'Maladie rénale', 'heart_failure': 'Insuffisance cardiaque',
    'atrial_fibrillation': 'Fibrillation atriale', 'anxiety': 'Anxiété', 'migraine': 'Migraine',
    'bleeding': 'Saignement', 'bleeding_heavily': 'Saignement abondant', 'heavy_bleeding': 'Saignement abondant',
    'bleed_severe': 'Saignement abondant', 'uncontrolled_bleeding': 'Saignement non contrôlé', 'unconscious': 'Perte de connaissance',
    'unresponsive': 'Ne répond pas', 'cannot_breathe': 'Impossibilité de respirer', 'face_drooping': 'Visage affaissé',
    'itching': 'Démangeaisons', 'one_side': 'Faiblesse d\'un côté du corps',
}
YES_NO = re.compile(r'^\s*(yes|no|not sure|oui|non|ey|le|إي|لا|نعم)\b', re.I)


def concept_label(f):
    """French clinical label of an extracted concept. Reports never quote the patient's messages."""
    for name in [f['name'], *(f.get('concept_aliases') or [])]:
        if name in FR_CONCEPTS:
            return FR_CONCEPTS[name]
    text = (f.get('text') or '').strip()
    return text if text and not YES_NO.match(text) else f['name'].replace('_', ' ')


def rule_label(r):
    return (r.get('rationale') or {}).get('fr', '').rstrip('.') or r['name']


def chief_complaint(case):
    """Reason for the visit from what triage recognized (warning signs, then symptoms), never the raw first message."""
    a = case.assessment or {}
    rules = sorted(a.get('triggered_rules', []), key=lambda r: {'critical': 0, 'high': 1, 'moderate': 2}.get(r['severity'], 3))
    labels = list(dict.fromkeys(rule_label(r) for r in rules))[:2]
    if not labels:
        state = case.ai_state or {}
        labels = list(dict.fromkeys(concept_label(f) for f in state.get('facts', [])
                                    if f.get('kind') == 'symptom' and f.get('status') == 'confirmed'
                                    and f.get('temporality') == 'current'))[:3]
    return ' · '.join(labels) if labels else 'Plainte non précisée'


INTAKE_LABELS = {'intake.context': 'Circonstances', 'intake.red_flags': 'Signes recherchés', 'intake.onset': 'Depuis', 'intake.severity': 'Intensité (/10)', 'intake.warning_signs': 'Autres signes',
                 'intake.age': 'Âge', 'intake.history': 'Antécédents / grossesse / traitements'}


def structured_report(case):
    """Deterministic report from stored data: the facts the NLP extracted (in French clinical terms), the rules
    that fired, the answers collected and the routing events. It does not contain the message history."""
    level = case.level or 'UNCERTAIN'
    d = case.decision or {}
    a = case.assessment or {}
    state = case.ai_state or {}
    facts = [f for f in state.get('facts', []) if f.get('experiencer', 'patient') == state.get('patient_experiencer', 'patient')
             and f.get('temporality', 'current') == 'current']
    positives = sorted({concept_label(f) for f in facts if f.get('kind') == 'symptom' and f.get('status') == 'confirmed'})
    negatives = sorted({concept_label(f) for f in facts if f.get('kind') == 'symptom' and f.get('status') == 'negated'} - set(positives))
    history = sorted({concept_label(f) for f in facts if f.get('kind') == 'condition' and f.get('status') == 'confirmed'})
    meds = sorted({f.get('text') or f['name'] for f in facts if f.get('kind') == 'medication' and f.get('status') == 'confirmed'})
    notes = (state.get('sahhanito') or {}).get('llm_notes') or {}
    meds = sorted(set(meds) | {str(m) for m in notes.get('medications', []) or []})
    red_flags = list(dict.fromkeys(rule_label(r) for r in a.get('triggered_rules', [])))
    reported = [f"{FIELD_LABELS.get(k, k)} : {v}" for k, v in notes.items() if k in FIELD_LABELS and v]
    intake = (state.get('sahhanito') or {}).get('intake') or {}
    reported += [f"{INTAKE_LABELS.get(k) or ('Précision' if k.startswith('intake.clarify') else k)} : {v}" for k, v in intake.items() if v]

    # Timeline of events (no messages): triage, level, referrals, review.
    timeline = [dict(at=iso(case.created_at), event='Début du triage')]
    last_patient = next((x for x in reversed(case.turns) if x.role == 'PATIENT'), None)
    if case.level:
        timeline.append(dict(at=iso(last_patient.created_at if last_patient else case.created_at), event=f"Niveau évalué : {LEVEL_FR.get(case.level, case.level)}"))
    for j in journey(case):
        timeline.append(dict(at=j['sentAt'], event=f"Dossier envoyé à {j['facilityName']}"))
        if j['decidedAt'] and j['status'] not in ('SENT', 'INFO_REQUESTED'):
            timeline.append(dict(at=j['decidedAt'], event=f"{j['statusLabel']} · {j['facilityName']}"))
    if case.review:
        timeline.append(dict(at=case.review['at'], event=f"Vérifié par {case.review['by']}"))

    complaint = chief_complaint(case)
    summary = f"Motif : {complaint}. Niveau : {LEVEL_FR.get(level, level)}"
    if d.get('pFinal') is not None:
        summary += f" (p={d['pFinal']:.2f})"
    # Reports are in French for every reader; the AI keeps the rationale in all four languages.
    rationale_fr = ((case.ai_decision or {}).get('rationale_all') or {}).get('fr') or d.get('rationale') or ''
    summary += f". {rationale_fr}".rstrip()
    if case.review:
        summary += f" Vérifié par {case.review['by']}."
    missing = (state.get('sahhanito') or {}).get('missing') or []
    return dict(summary=summary, chiefComplaint=complaint, timeline=timeline,
                positives=positives, negatives=negatives, history=history + reported, medications=meds,
                redFlags=red_flags, risk=dict(level=level, pFinal=d.get('pFinal'), uncertainty=d.get('uncertainty', 'HIGH')),
                recommendedActions=ACTIONS[level], openQuestions=missing or ['Durée exacte des symptômes', 'Traitements en cours'],
                disclaimer='Triage assisté par IA. Les décisions cliniques appartiennent à l’équipe qui reçoit le patient.')


def report_view(case):
    r = current_referral(case)
    return dict(caseId=case.id, referenceCode=case.reference_code,
                facilityName=hospitals.FACILITIES.get(r.facility_key, {}).get('name') if r else None,
                version=1 + len([x for x in case.turns if x.role == 'PATIENT']), author='CLINICIAN' if case.review else 'AI',
                reviewedByClinician=bool(case.review), generatedAt=iso(utcnow()),
                caseLink=f'{config.PUBLIC_BASE_URL}/p/{case.public_token}', pdfUrl=f'{config.PUBLIC_BASE_URL}/p/{case.public_token}.pdf',
                report=structured_report(case))


def fhir_bundle(case, referral=None):
    """HL7 FHIR R4 document Bundle for the case (see app/fhir.py)."""
    from app import fhir
    return fhir.build_bundle(case, structured_report(case), referral or current_referral(case))


def fhir_response(case, referral=None):
    from fastapi.responses import JSONResponse
    bundle = fhir_bundle(case, referral)
    return JSONResponse(bundle, media_type='application/fhir+json', headers={
        'Content-Disposition': f'attachment; filename="sahhanito-{case.reference_code}-fhir.json"', 'Cache-Control': 'no-store'})


def report_pdf(db, case, audience='patient', referral=None):
    """French PDF: patient version, or staff version (decision details, journey, transcript, ED chat)."""
    from fastapi.responses import Response
    from app import fhir, pdf
    report = report_view(case)
    r = referral or current_referral(case)
    staff_view = staff_case_view(db, r) if audience == 'staff' and r else None
    fhir_summary = fhir.summary(fhir_bundle(case, r))
    content = pdf.build(case_view(case), report, referral_view(r) if r else None, audience, staff_view, fhir_summary)
    return Response(content, media_type='application/pdf', headers={
        'Content-Disposition': f'inline; filename="{pdf.filename(report, audience)}"', 'Cache-Control': 'no-store'})


LEVEL_FR = {'EMERGENCY': 'Urgence vitale', 'HIGH': 'Urgent', 'LOW': 'Peu urgent', 'UNCERTAIN': 'À vérifier'}
CONFIDENCE_FR = {'LOW': ('élevée', 'Les signaux concordent.'), 'MEDIUM': ('moyenne', 'À confirmer cliniquement.'),
                 'HIGH': ('faible', 'Informations insuffisantes : jugement clinique nécessaire.')}


FACTOR_FR = {
    'other_symptom': 'Symptôme(s) signalé(s)', 'severe_headache': 'Maux de tête sévères', 'age_missing': 'Âge non précisé',
    'age_given': 'Âge du patient', 'duration_given': 'Durée des symptômes', 'duration_missing': 'Durée non précisée',
    'sex_missing': 'Sexe non précisé', 'sex_given': 'Sexe du patient', 'severity_missing': 'Intensité non précisée',
    'severity_given': 'Intensité décrite', 'vitals_missing': 'Constantes non mesurées',
    'third_person_report': 'Signalé par un proche', 'episodic_presentation': 'Épisodes répétés',
}
VITAL_FR = {'oxygen_saturation': 'saturation en oxygène', 'heart_rate': 'fréquence cardiaque', 'systolic': 'tension artérielle',
            'diastolic': 'tension artérielle', 'temperature_c': 'température', 'respiratory_rate': 'fréquence respiratoire', 'glucose': 'glycémie'}


def model_factors(case):
    """NLP explanation (leave-one-group-out, computed by the AI) with French labels."""
    exp = (case.assessment or {}).get('nlp_explanation') or {}
    out = []
    for f in exp.get('factors', []):
        c = f['concept']
        if f['kind'] == 'vital' and f['group'].startswith('vital.'):
            label = f"Constante mesurée : {VITAL_FR.get(c, c)}"
        else:
            label = FACTOR_FR.get(c) or FR_CONCEPTS.get(c) or c.replace('_', ' ')
        if f.get('status') == 'absent':
            label = f'Absence : {label.lower()}'
        elif f.get('status') == 'uncertain':
            label = f'{label} (incertain)'
        out.append(dict(label=label, contribution=f['contribution'], direction='up' if f['contribution'] > 0 else 'down'))
    return dict(factors=out, saturated=bool(exp.get('saturated')), method=exp.get('method'))


def explanation(case):
    """Plain-French reasons for the level, for ED staff (the raw scores stay available as technical details)."""
    a, d, ai = case.assessment or {}, case.decision or {}, case.ai_decision or {}
    level = case.level or 'UNCERTAIN'
    points = []
    for r in a.get('triggered_rules', []):
        why = (r.get('rationale') or {}).get('fr') or r['name']
        words = ', '.join(r.get('evidence') or [])
        kind = {'critical': 'signe d\'alerte majeur', 'high': 'signe de gravité', 'moderate': 'facteur de risque'}.get(r['severity'], '')
        points.append(f"{why} ({kind})" + (f" — le patient a écrit « {words} »" if words else ''))
    p = a.get('p_nlp')
    if p is None:
        points.append("Le modèle de langage n'a pas compris le message : le niveau repose sur les règles de sécurité.")
    elif p >= 0.5:
        points.append('Le modèle de langage estime aussi un risque élevé.')
    elif p < 0.1 and not a.get('triggered_rules'):
        points.append("Le modèle de langage n'a pas détecté de signe de gravité.")
    else:
        points.append('Le modèle de langage estime un risque modéré.')
    mf = model_factors(case)
    if mf['factors']:
        ups = [f['label'] for f in mf['factors'] if f['direction'] == 'up'][:3]
        downs = [f['label'] for f in mf['factors'] if f['direction'] == 'down'][:2]
        text = 'Pour le modèle de langage, ont surtout compté'
        if ups:
            text += ' vers l\'urgence : ' + ', '.join(ups)
        if downs:
            text += (' ; ' if ups else ' ') + 'dans l\'autre sens : ' + ', '.join(downs)
        points.append(text + '.')
    elif mf['saturated']:
        points.append('Le modèle de langage s\'appuie sur plusieurs éléments concordants (aucun élément seul ne change son score).')
    if ai.get('basis') == 'rule_floor':
        points.append('Le niveau minimum imposé par les règles de sécurité s\'applique.')
    if case.review:
        points.append(f"Vérifié par {case.review['by']}" + (f" : {case.review['note']}" if case.review.get('note') else '.'))
    rationale = (ai.get('rationale_all') or {}).get('fr') or d.get('rationale') or ''
    conf, conf_note = CONFIDENCE_FR.get(a.get('uncertainty') or 'HIGH', CONFIDENCE_FR['HIGH'])
    return dict(headline=f"{LEVEL_FR.get(level, level)} : {rationale}".strip(' :'), points=points,
                confidence=conf, confidenceNote=conf_note, modelFactors=mf['factors'], modelSaturated=mf['saturated'])


def patient_age(case):
    state = case.ai_state or {}
    fact = next((f for f in reversed(state.get('facts', [])) if f.get('kind') == 'demographic' and f.get('name') == 'age'
                 and isinstance(f.get('value'), (int, float))), None)
    if fact:
        return f"{int(fact['value'])} ans"
    meta = state.get('sahhanito') or {}
    age = (meta.get('llm_notes') or {}).get('age') or (meta.get('intake') or {}).get('intake.age')
    return f"{age} ans" if isinstance(age, (int, float)) else age


def unread_for_staff(db, r):
    """Patient messages since the last staff message."""
    msgs = db.scalars(select(ChatMessage).where(ChatMessage.referral_id == r.id, ChatMessage.sender != 'SYSTEM')
                      .order_by(ChatMessage.created_at)).all()
    n = 0
    for m in msgs:
        n = 0 if m.sender == 'STAFF' else n + 1
    return n


def staff_case_view(db, r):
    case = db.get(Case, r.case_id)
    a = case.assessment or {}
    chat = db.scalars(select(ChatMessage).where(ChatMessage.referral_id == r.id).order_by(ChatMessage.created_at)).all()
    amb = db.get(Ambulance, r.id)
    return dict(
        referral=dict(referral_view(r), reason=r.reason, decidedBy=r.decided_by, decidedAt=iso(r.decided_at), distanceKm=r.distance_km),
        case=dict(id=case.id, referenceCode=case.reference_code, status=case.status, level=case.level, language=case.language,
                  createdAt=iso(case.created_at), location=case.location, decision=case.decision, review=case.review,
                  assessment=dict(pNlp=a.get('p_nlp'), nlpStatus=a.get('nlp_status'), sRule=a.get('s_rule'), pFinal=a.get('p_final'),
                                  uncertainty=a.get('uncertainty'), uncertaintyReasons=a.get('uncertainty_reasons', []),
                                  contributions=a.get('contributions'), triggeredRules=a.get('triggered_rules', [])),
                  actions=(case.ai_decision or {}).get('actions', [])),
        transcript=[turn_view(x) for x in case.turns],
        explanation=explanation(case),
        patientAge=patient_age(case),
        journey=journey(case),
        report=structured_report(case),
        chat=[chat_view(m) for m in chat],
        ambulance=ambulance_view(amb, r) if amb else None,
    )


JOURNEY_STATUS = {'SENT': 'Envoyé', 'INFO_REQUESTED': 'Question posée', 'ACCEPTED': 'Accepté', 'REJECTED': 'Refusé',
                  'TIMED_OUT': 'Sans réponse dans le délai', 'REROUTED': 'Réorienté', 'CANCELLED': 'Annulé', 'ARRIVED': 'Arrivé',
                  'COMPLETED': 'Terminé'}


def journey(case):
    """Every hospital that had the case, in order, with who decided what and why."""
    return [dict(referralId=r.id, facilityName=hospitals.FACILITIES.get(r.facility_key, {}).get('name', r.facility_key),
                 status=r.status, statusLabel=JOURNEY_STATUS.get(r.status, r.status), reason=r.reason, decidedBy=r.decided_by,
                 sentAt=iso(r.created_at), decidedAt=iso(r.decided_at)) for r in case.referrals]


def referral_row(db, r):
    case = db.get(Case, r.case_id)
    d = case.decision or {}
    last = db.scalars(select(ChatMessage).where(ChatMessage.referral_id == r.id).order_by(ChatMessage.created_at.desc()).limit(1)).first()
    return dict(id=r.id, caseId=case.id, referenceCode=case.reference_code, level=case.level, status=r.status,
                arrivalMode=r.arrival_mode, chiefComplaint=chief_complaint(case),
                pFinal=d.get('pFinal'), uncertainty=d.get('uncertainty'), suggestedSpecialty=d.get('suggestedSpecialty'),
                redFlags=[x['name'] for x in d.get('triggeredRules', []) if x.get('severity') == 'critical'],
                etaMinutes=r.eta_minutes, distanceKm=r.distance_km, createdAt=iso(r.created_at),
                lastMessage=chat_view(last) if last else None, unread=unread_for_staff(db, r), patientAge=patient_age(case))


def expire_overrides_now():
    return datetime.now(timezone.utc) + timedelta(hours=config.OVERRIDE_TTL_H)
