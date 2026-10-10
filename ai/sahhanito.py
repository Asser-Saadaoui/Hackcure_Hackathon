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
MAX_QUESTIONS = 5
MIN_QUESTIONS = 3   # before a non-emergency final decision, at least this many questions in total

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
    try:
        r = process_turn(state, message, previous_question_id, language=plang, ml_bundle=ml_bundle)
    except ValueError:
        if previous_question_id is None:
            raise
        # Stale or foreign question id (e.g. the app resent an old one): keep the message, drop the link.
        r = process_turn(state, message, None, language=plang, ml_bundle=ml_bundle)
    st = r['patient_state']
    meta = st.setdefault('sahhanito', {'asked': {}, 'llm_notes': {}})
    meta.setdefault('intake', {})
    meta.setdefault('intake_turns', {})
    pending = meta.get('pending_intake')
    if pending and intake_field in (None, pending):
        meta['intake'][pending] = message   # also when the client did not send the id: never ask twice
    meta.pop('pending_intake', None)

    rules = evaluate_rules(st, r['rules'])
    assessment = fusion.fuse(r['ml'], rules)
    assessment['nlp_explanation'] = _explain(st, r['ml'], ml_bundle)
    meta['nlp_explanation'] = assessment['nlp_explanation']
    decided = decision_policy.decide(assessment, rules, language)

    asked = len(st.get('asked_questions', []))
    question = r['next_question']
    if question and question['field'] is None and rules['triggered_rules']:
        question = None   # generic "describe your problem": pointless once a rule identified it
        st.pop('pending_question', None)
    # The pipeline re-asks a question whose answer was unclear. Allow one repeat of a specific question, and ask
    # the open "describe your problem" only once: after that the adaptive intake (LLM) rephrases instead.
    repeats = meta.setdefault('pipeline_asked', {})
    if question and repeats.get(str(question['field']), 0) >= (1 if question['field'] is None else 2):
        question = None
        st.pop('pending_question', None)
    reply = None
    if mode == 'monitor':
        status = 'monitor'
    elif decided['level'] == 'EMERGENCY':
        status = 'emergency'
        reply = _decision_reply(st, rules, decided, language, interviewer)
    elif question and asked < MAX_QUESTIONS:
        status = 'question'
        repeats[str(question['field'])] = repeats.get(str(question['field']), 0) + 1
        history = _history(st)
        asked_reply = (interviewer or default_interviewer()).ask(question, history, language, message)
        meta['asked'][question['id']] = asked_reply['text']
        meta['llm_notes'].update(asked_reply.get('collected') or {})
        reply = dict(text=asked_reply['text'], quick_replies=asked_reply['quick_replies'],
                     question_id=question['id'], field=question['field'], source=asked_reply['source'])
    elif mode == 'interview' and (asked_reply := _intake_question(st, meta, decided, asked, language, message, interviewer)):
        # Before deciding: UNCERTAIN collects what a clinician needs (up to 5); HIGH / LOW ask follow-ups until
        # at least MIN_QUESTIONS in total. Every answer goes back through the NLP and the rules.
        status = 'question'
        field = asked_reply['field']
        meta['pending_intake'] = field
        meta['intake_turns'][str(len(st['turns']))] = asked_reply['text']
        meta['llm_notes'].update(asked_reply.get('collected') or {})
        reply = dict(text=asked_reply['text'], quick_replies=asked_reply['quick_replies'],
                     question_id=f'intake:{field}', field=field, source=asked_reply['source'])
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


def _decision_reply(state, rules, decided, language, interviewer):
    """Chat message explaining the decided level (LLM wording, system reasons). The app shows a button to the
    decision page under it; the level itself never comes from the LLM."""
    lang = language if language in ('fr', 'en', 'ar', 'darija') else 'fr'
    reasons = list(dict.fromkeys(r['rationale'].get(lang, r['rationale']['fr']).rstrip('.') for r in rules['triggered_rules']))
    reasons = [x for x in reasons if not any(x != y and x in y for y in reasons)][:3]
    if not reasons and decided.get('rationale_all'):
        reasons = [decided['rationale_all'].get(lang, decided['rationale_all']['fr']).rstrip('.')]
    if decided['level'] == 'EMERGENCY':
        # Emergencies never wait for the LLM: the reviewed template is immediate and always says "call 190".
        out = dict(text=interviewer_module.template_explanation('EMERGENCY', reasons, lang), source='template')
    else:
        out = interviewer_module.explain_decision(interviewer or default_interviewer(), decided['level'], reasons, _history(state), lang)
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


def _intake_question(st, meta, decided, asked, language, message, interviewer):
    itv = interviewer or default_interviewer()
    total = asked + len(meta['intake'])
    if decided['level'] == 'UNCERTAIN':
        purpose, limit = 'uncertain', interviewer_module.MAX_INTAKE
    elif decided['level'] in ('HIGH', 'LOW') and total < MIN_QUESTIONS:
        purpose, limit = 'followup', len(meta['intake']) + (MIN_QUESTIONS - total)
    else:
        return None
    if not interviewer_module.intake_open(meta['intake'], itv, limit):
        return None
    return interviewer_module.ask_adaptive_intake(itv, meta['intake'], _history(st), language, message, purpose)


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
