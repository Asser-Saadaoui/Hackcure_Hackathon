"""Sahhanito triage turn: NLP model + rule engine -> fusion -> decision; the LLM only talks.

    patient message
      -> triage_pipeline.process_turn   facts (multilingual extractor), NLP score p_nlp, clinical screens,
                                        next missing field to ask about
      -> rule_engine.evaluate           s_rule, level floor, specialty / equipment
      -> fusion.fuse                    p_final, uncertainty, contributions
      -> decision.decide                EMERGENCY / HIGH / LOW / UNCERTAIN + actions
      -> interviewer.Interviewer.ask    phrases the next question (only while interviewing)

The state is returned to the caller (backend or app) and sent back with the next message.
"""
import copy

import decision as decision_policy
import fusion
import interviewer as interviewer_module
from rule_engine import evaluate as evaluate_rules
from triage_pipeline import process_turn

VERSION = 'sahhanito-turn-0.1'
MAX_QUESTIONS = 6   # questions in the interview (the LLM may say "done" earlier)
MIN_QUESTIONS = 3   # before a final decision, at least this many questions in total

EMERGENCY_MESSAGE = {
    'fr': "Ceci peut être une urgence. Appelez le 190 (SAMU) maintenant. Nous prévenons l'hôpital le plus adapté.",
    'en': 'This may be an emergency. Call 190 (SAMU) now. We are alerting the most suitable hospital.',
    'ar': 'قد تكون هذه حالة طارئة. اتصل بالرقم 190 (الإسعاف) الآن. نحن نُعلم المستشفى الأنسب.',
    'darija': 'تنجم تكون حالة مستعجلة. عيّط للـ190 (السامو) توا. احنا نعلمو السبيطار المناسب.',
}
RESULT_MESSAGE = {
    'fr': 'Merci, j’ai assez d’informations. Voici votre orientation.',
    'en': 'Thank you, I have enough information. Here is your guidance.',
    'ar': 'شكرًا، لدي معلومات كافية. إليك التوجيه.',
    'darija': 'يعيشك، عندي معلومات كافية. هاو التوجيه متاعك.',
}
REVIEW_MESSAGE = {
    'fr': 'Merci. Un clinicien va vérifier votre situation dans quelques instants.',
    'en': 'Thank you. A clinician will check your situation shortly.',
    'ar': 'شكرًا. سيراجع طبيب حالتك بعد قليل.',
    'darija': 'يعيشك. طبيب باش يثبّت في حالتك بعد شوية.',
}

_default_interviewer = None


def default_interviewer():
    global _default_interviewer
    if _default_interviewer is None:
        _default_interviewer = interviewer_module.Interviewer()
    return _default_interviewer


def triage_turn(state, message, previous_question_id=None, *, language='fr', mode='interview',
                interviewer=None, ml_bundle=None):
    """One patient message -> assessment, decision and (while interviewing) the next question.

    mode='interview': triage chat. mode='monitor': a message in the hospital chat after referral:
    same assessment, never a question (the backend raises the case if the level goes up).
    """
    if language not in EMERGENCY_MESSAGE:
        language = 'fr'
    plang = interviewer_module.pipeline_language(language, message)
    # Answers to intake questions (asked before human review) are not linked to an NLP field.
    intake_field = None
    if previous_question_id and previous_question_id.startswith('intake:'):
        intake_field, previous_question_id = previous_question_id[len('intake:'):], None
    if previous_question_id and previous_question_id.startswith('confirm:'):
        previous_question_id = None   # answer to a confirmation question (handled below), not an NLP field
    prev_meta = (state or {}).get('sahhanito') or {}
    restate = prev_meta.get('pending_restate') if mode == 'interview' else None
    text = message
    if restate and len((message or '').split()) <= 2:
        if interviewer_module.POLAR_YES.match(message or '') and restate.get('yes'):
            text = restate['yes']
        elif interviewer_module.POLAR_NO.match(message or '') and restate.get('no'):
            text = restate['no']
    try:
        r = process_turn(state, text, previous_question_id, language=plang, ml_bundle=ml_bundle)
    except ValueError:
        if previous_question_id is None:
            raise
        # Stale or foreign question id (e.g. the app resent an old one): keep the message, drop the link.
        r = process_turn(state, text, None, language=plang, ml_bundle=ml_bundle)
    st = r['patient_state']
    meta = st.setdefault('sahhanito', {'asked': {}, 'llm_notes': {}})
    meta.pop('pending_restate', None)
    if text != message:
        # Not the patient's own words: a critical sign found only here is confirmed before an emergency.
        meta.setdefault('restated_turns', []).append(len(st['turns']) - 1)
    meta.setdefault('intake', {})
    meta.setdefault('intake_turns', {})
    # Answer to "did this start suddenly / recently?": an old, long-standing sign is ruled out for this case.
    pending_confirm = meta.pop('pending_confirm', None)
    if pending_confirm:
        key = 'dismissed_rules' if interviewer_module.answer_rules_out(message, language, message) else 'confirmed_rules'
        meta.setdefault(key, []).extend(x for x in pending_confirm if x not in meta.get(key, []))
    pending = meta.get('pending_intake')
    if pending and intake_field in (None, pending):
        meta['intake'][pending] = message   # also when the client did not send the id: never ask twice
    meta.pop('pending_intake', None)

    rules = evaluate_rules(st, r['rules'], exclude=set(meta.get('dismissed_rules', [])))
    assessment = fusion.fuse(r['ml'], rules)
    assessment['nlp_explanation'] = _explain(st, r['ml'], ml_bundle)
    meta['nlp_explanation'] = assessment['nlp_explanation']
    decided = decision_policy.decide(assessment, rules, language)

    # The interview is led by the LLM (questions chosen from the conversation, never dictated by the rules or the
    # NLP question bank). The decision is made once the LLM has enough (or after MAX_QUESTIONS), from the whole
    # conversation. Only exception: a critical sign in the patient's own words decides at once.
    st.pop('pending_question', None)      # the NLP question bank does not drive the interview
    asked = len(st.get('asked_questions', [])) + len(meta['intake'])
    reply = None
    urgent_now = decided['level'] == 'EMERGENCY' and _critical_in_own_words(st, rules, meta)
    next_q = None
    if mode == 'interview' and not urgent_now and asked < MAX_QUESTIONS and not meta.get('interview_done'):
        next_q = interviewer_module.ask_adaptive_intake(interviewer or default_interviewer(), meta['intake'], _history(st),
                                                        language, message, purpose='interview',
                                                        allow_done=asked >= MIN_QUESTIONS)
        if next_q and next_q.get('done'):
            meta['interview_done'] = True
            meta['llm_notes'].update(next_q.get('collected') or {})
            next_q = None
    confirm_ids = _needs_confirmation(st, rules, meta) if mode == 'interview' and not next_q and decided['level'] == 'EMERGENCY' else None
    if mode == 'monitor':
        status = 'monitor'
    elif next_q:
        status = 'question'
        field = next_q['field']
        meta['pending_intake'] = field
        if next_q.get('restate'):
            meta['pending_restate'] = next_q['restate']
        meta['intake_turns'][str(len(st['turns']))] = next_q['text']
        meta['llm_notes'].update(next_q.get('collected') or {})
        reply = dict(text=next_q['text'], quick_replies=next_q['quick_replies'],
                     question_id=f'intake:{field}', field=field, source=next_q['source'])
    elif confirm_ids:
        # A critical sign that rests only on a "Yes" (or our restatement of it): one quick confirmation first.
        status = 'question'
        text_q, options = interviewer_module.confirm_question(confirm_ids[0], language, message)
        meta['pending_confirm'] = confirm_ids
        meta['intake_turns'][str(len(st['turns']))] = text_q
        reply = dict(text=text_q, quick_replies=options, question_id='confirm:' + ','.join(confirm_ids), field='confirm', source='template')
    elif decided['level'] == 'EMERGENCY':
        status = 'emergency'
        reply = _decision_reply(st, rules, decided, language, interviewer)
    elif decided['level'] == 'UNCERTAIN':
        status = 'under_review'
        reply = _decision_reply(st, rules, decided, language, interviewer)
    else:
        status = 'result'
        reply = _decision_reply(st, rules, decided, language, interviewer)
    if status != 'question':
        st.pop('pending_question', None)

    return dict(
        status=status,
        final=status in ('emergency', 'result', 'under_review'),
        language=language,
        reply=reply,
        state=st,
        extracted_facts=[_fact_view(f) for f in r['extracted_facts']],
        missing_info=r['relevant_missing_information'],
        assessment=dict(
            **assessment,
            triggered_rules=[dict(id=x['id'], name=x['name'], severity=x['severity'], weight=x['weight'], rationale=x['rationale'],
                                  evidence=[e.get('text') for e in x['evidence'] if e.get('text')])
                             for x in rules['triggered_rules']],
        ),
        decision=decided,
        llm_notes=copy.deepcopy(meta['llm_notes']),
        intake=copy.deepcopy(meta['intake']),
        versions=dict(turn=VERSION, rules=rules['rule_version'], fusion=fusion.VERSION,
                      decision=decision_policy.VERSION, interviewer=interviewer_module.VERSION,
                      nlp_model=r['ml'].get('model_version')),
    )


def _own_words(state, meta, e):
    """True when this evidence comes from something the patient wrote (not a bare "Yes", not our restatement of it)."""
    restated = set(meta.get('restated_turns', []))
    turn = e.get('turn_id')
    if isinstance(turn, int) and turn in restated:
        return False
    text = (e.get('text') or '').strip()
    if e.get('source') == 'text':
        return True
    said = [(t.get('answer') or '').lower() for i, t in enumerate(state.get('turns', [])) if i not in restated]
    return bool(text) and not interviewer_module.POLAR_YES.match(text) and any(text.lower() in x for x in said)


def _critical_in_own_words(state, rules, meta):
    critical = [x for x in rules['triggered_rules'] if x['severity'] == 'critical']
    return any(x['id'] in meta.get('confirmed_rules', []) or any(_own_words(state, meta, e) for e in x['evidence'])
               for x in critical)


def _needs_confirmation(state, rules, meta):
    """Critical rules whose only support is a "Yes" to one of our questions (nothing in the patient's own words)."""
    critical = [x for x in rules['triggered_rules'] if x['severity'] == 'critical']
    if not critical or _critical_in_own_words(state, rules, meta):
        return None
    return [x['id'] for x in critical if x['id'] not in meta.get('confirmed_rules', [])] or None


def _reported(state, lang):
    """The symptoms the patient reported, as simple labels in their language."""
    from explain_labels import LABELS, label
    target = state.get('patient_experiencer', 'patient')
    names = [f['name'] for f in state.get('facts', []) if f.get('kind') == 'symptom' and f.get('experiencer') == target
             and f.get('status') == 'confirmed' and f.get('temporality') == 'current']
    return list(dict.fromkeys(label(n, 'present', lang) for n in names if n in LABELS))[:3]


def _decision_reply(state, rules, decided, language, interviewer):
    """Chat message explaining the decided level (LLM wording, system reasons). The app shows a button to the
    decision page under it; the level itself never comes from the LLM."""
    lang = language if language in ('fr', 'en', 'ar', 'darija') else 'fr'
    reasons = list(dict.fromkeys(r['rationale'].get(lang, r['rationale']['fr']).rstrip('.') for r in rules['triggered_rules']))
    reasons = [x for x in reasons if not any(x != y and x in y for y in reasons)][:3]
    if not reasons and decided.get('rationale_all'):
        reasons = [decided['rationale_all'].get(lang, decided['rationale_all']['fr']).rstrip('.')]
    reported = _reported(state, lang)
    # The LLM explains every decision, emergencies included; for an emergency it gets a short time budget and the
    # reviewed template (which always says "call 190") is used if it is slower or its text fails the checks.
    out = interviewer_module.explain_decision(interviewer or default_interviewer(), decided['level'], reasons,
                                              _history(state), lang, reported,
                                              budget_s=5.0 if decided['level'] == 'EMERGENCY' else None)
    return dict(text=out['text'], quick_replies=[], source=out['source'], kind='decision', level=decided['level'],
                explain=_patient_explain(state, decided, reasons, lang))


def _patient_explain(state, decided, reasons, lang):
    """Explainability card for the patient's chat: the reasons + the main elements behind the NLP score."""
    from explain_labels import label
    exp = (state.get('sahhanito') or {}).get('nlp_explanation') or {}
    factors = [dict(label=label(f['concept'], f.get('status'), lang), direction='up' if f['contribution'] > 0 else 'down',
                    weight=round(abs(f['contribution']), 3))
               for f in exp.get('factors', [])[:4]]
    return dict(level=decided['level'], reasons=reasons, factors=factors, saturated=bool(exp.get('saturated')))


def _explain(state, ml, ml_bundle):
    """Which elements of the case moved the NLP score (see explain.py). Never blocks the turn."""
    if ml.get('status') != 'ok':
        return None
    try:
        from explain import explain_nlp
        from triage_pipeline import _cached_state_model
        return explain_nlp(state, ml_bundle or _cached_state_model('experimental_v3'))
    except Exception:
        return None


def _history(state):
    asked = state.get('sahhanito', {}).get('asked', {})
    intake_turns = state.get('sahhanito', {}).get('intake_turns', {})
    history = []
    for i, t in enumerate(state['turns']):
        if str(i) in intake_turns:
            history.append(dict(role='assistant', text=intake_turns[str(i)]))
        if t.get('question'):
            qid = next((a['id'] for a in state.get('asked_questions', []) if a['field'] == t.get('field')), None)
            history.append(dict(role='assistant', text=asked.get(qid, t['question'])))
        history.append(dict(role='patient', text=t['answer']))
    return history


def _fact_view(f):
    return dict(kind=f['kind'], name=f['name'], status=f['status'], temporality=f['temporality'],
                value=f.get('value'), text=f.get('text'))
