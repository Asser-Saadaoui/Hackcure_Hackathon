"""Sahhanito LLM interviewer: chats with the patient and collects information. It never decides.

Division of work:
  - WHAT to ask is chosen deterministically (adaptive_questions: the missing field the NLP model
    and the rules need next). The LLM only phrases it kindly, in the patient's language.
  - The patient's answer is parsed by the NLP extractor, never by the LLM, so the decision inputs
    stay deterministic and auditable.
  - The LLM also returns `collected` notes (age, onset, medications...) for the hospital report.
    They are stored in patient_state['llm_notes'] and are NOT read by the rules, fusion or decision.
  - It is never called for an emergency or a final result: those messages are fixed texts.

Provider (SAHHANITO_LLM_PROVIDER, default: gemini when GEMINI_API_KEY is set):
  - gemini:    Gemini's OpenAI-compatible endpoint, same setup as our central-park fork
               (GEMINI_API_KEY, model SAHHANITO_GEMINI_MODEL or CP_GEMINI_MODEL, default gemini-3.8-flash)
  - anthropic: Anthropic Messages API (ANTHROPIC_API_KEY, model SAHHANITO_ANTHROPIC_MODEL)
No key, SAHHANITO_LLM=off, any error or an unsafe reply -> the reviewed question templates.
"""
import json
import logging
import os
import re
import threading
import time

log = logging.getLogger('sahhanito.llm')

VERSION = 'interviewer-0.2'
DEFAULT_MODELS = {'gemini': 'gemini-3.8-flash', 'anthropic': 'claude-sonnet-5-5'}
# Tried in order when the main model is out of quota (each Gemini model has its own free-tier quota).
GEMINI_FALLBACKS = 'gemini-3.7-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-2.5-flash-lite'


class LLMUnavailable(Exception):
    pass


# Process-wide: model -> unix time when it may be used again; plus the last error for /health.
_cooldown = {}
_status = {'last_error': None, 'last_error_at': None, 'last_model': None}
_lock = threading.Lock()


def _retry_seconds(response):
    """How long Google asks us to wait: Retry-After header, RetryInfo.retryDelay, or 'retry in 5h18m38s'."""
    header = response.headers.get('retry-after', '')
    if header.replace('.', '', 1).isdigit():
        return float(header)
    text = response.text
    m = re.search(r'"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"', text)
    if m:
        return float(m.group(1))
    m = re.search(r'retry in ((?:\d+h)?(?:\d+m)?(?:\d+(?:\.\d+)?s)?)', text)
    if m and m.group(1):
        parts = dict(re.findall(r'(\d+(?:\.\d+)?)([hms])', m.group(1)))
        return float(parts.get('h', 0)) * 3600 + float(parts.get('m', 0)) * 60 + float(parts.get('s', 0))
    return 60.0


def llm_status():
    now = time.time()
    with _lock:
        cooling = {m: round(t - now) for m, t in _cooldown.items() if t > now}
        return dict(_status, cooling_down_seconds=cooling)
GEMINI_OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/'
TIMEOUT_S = 9.0            # per model call (Gemini flash models take 5-8 s)
BUDGET_S = 12.0            # total LLM time per call to _complete (all fallbacks): the triage never waits longer
SLOW_COOLDOWN_S = 120.0    # a model that timed out is skipped for 2 minutes
LANG_NAMES = {'fr': 'French', 'en': 'English', 'ar': 'Modern Standard Arabic',
              'darija': 'Tunisian Darija (answer in the same script the patient uses: Arabic letters or Arabizi with numbers like 3, 7, 9)'}

# French versions of adaptive_questions.TEMPLATES (prototype drafts, pending review).
FRENCH = {
    'symptom.speech.onset': 'La difficulté à parler a-t-elle commencé brutalement ou progressivement ? Quand ?',
    'symptom.weakness.onset': 'La faiblesse a-t-elle commencé brutalement ou progressivement ? Quand ?',
    'symptom.breath': 'Avez-vous du mal à respirer en ce moment ?',
    'symptom.breath_functional_impairment': "Êtes-vous essoufflé au point de ne pas pouvoir finir vos phrases ?",
    'symptom.breath.severity': 'Votre difficulté à respirer est-elle forte ? Pouvez-vous parler normalement ?',
    'symptom.speech': 'Avez-vous une nouvelle difficulté à parler en ce moment ?',
    'symptom.headache.onset': 'Le mal de tête a-t-il commencé brutalement ou progressivement ? Quand ?',
    'symptom.confusion': 'Vous sentez-vous confus en ce moment ?',
    'symptom.neck_stiffness': 'Avez-vous la nuque raide en ce moment ?',
    'symptom.chest.duration': 'Depuis combien de temps avez-vous mal à la poitrine ?',
    'symptom.chest.onset': 'La douleur à la poitrine a-t-elle commencé brutalement ou progressivement ? Quand ?',
    'symptom.chest.severity': 'La douleur à la poitrine est-elle forte ?',
    'symptom.headache.duration': 'Depuis combien de temps avez-vous mal à la tête ?',
    'symptom.fever.duration': 'Depuis combien de temps avez-vous de la fièvre ?',
    'symptom.dizziness.onset': 'Les vertiges ont-ils commencé brutalement ou progressivement ? Quand ?',
    'symptom.abdominal_pain.duration': 'Depuis combien de temps avez-vous mal au ventre ?',
    'vital.temperature': "Quelle température avez-vous mesurée, en °C ? Dites « je ne sais pas » si vous ne l'avez pas mesurée.",
    'demographic.age': 'Quel âge a le patient ?',
    None: 'Pouvez-vous décrire ce qui vous gêne et où vous le ressentez ?',
}
YES_NO = {
    'fr': ['Oui', 'Non', 'Je ne sais pas'],
    'en': ['Yes', 'No', 'Not sure'],
    'ar': ['نعم', 'لا', 'مانعرفش'],
    'darija_arabic': ['إي', 'لا', 'مانعرفش'],
    'darija_latin': ['Ey', 'Le', 'Ma na3rafch'],
}
UNSURE_ONLY = {k: [v[2]] for k, v in YES_NO.items()}
UNSAFE = re.compile(
    r"diagnos|you have (?:a|an) |vous avez (?:un|une) (?:infarctus|avc|crise)|not serious|nothing serious|no need to|"
    r"pas grave|pas urgent|pas besoin|ne vous inquietez pas|don.t worry|calm down|take (?:paracetamol|ibuprofen|aspirin)|"
    r"prenez (?:du|de l)|level|niveau d.urgence|emergency level", re.I)


def pipeline_language(language, message):
    """App language -> adaptive_questions language (en, tn_arabizi, tn_arabic)."""
    arabic_script = bool(re.search(r'[؀-ۿ]', message or ''))
    if language == 'darija':
        return 'tn_arabic' if arabic_script else 'tn_arabizi'
    if language == 'ar':
        return 'tn_arabic'
    return 'en'


def reply_key(language, message):
    if language == 'darija':
        return 'darija_arabic' if re.search(r'[؀-ۿ]', message or '') else 'darija_latin'
    return language if language in ('fr', 'en', 'ar') else 'fr'


def template_question(question, language, message):
    """Reviewed template text + deterministic quick replies (so the NLP can parse the answer)."""
    key = reply_key(language, message)
    if language == 'fr':
        text = FRENCH.get(question['field'], question['templates']['en'])
    else:
        text = question['templates'][pipeline_language(language, message)]
    field = question['field']
    if field is None:
        quick = []
    elif len(field.split('.')) == 3 or not field.startswith('symptom.'):
        quick = UNSURE_ONLY[key]
    else:
        quick = YES_NO[key]
    return text, quick


class Interviewer:
    def __init__(self, api_key=None, model=None, enabled=None, provider=None):
        env = os.environ
        self.provider = (provider or env.get('SAHHANITO_LLM_PROVIDER')
                         or ('gemini' if env.get('GEMINI_API_KEY') or not env.get('ANTHROPIC_API_KEY') else 'anthropic')).lower()
        if self.provider not in DEFAULT_MODELS:
            raise ValueError(f'Unknown SAHHANITO_LLM_PROVIDER {self.provider!r}: expected gemini | anthropic')
        if self.provider == 'gemini':
            self.api_key = api_key if api_key is not None else env.get('GEMINI_API_KEY')
            self.model = model or env.get('SAHHANITO_GEMINI_MODEL') or env.get('CP_GEMINI_MODEL') or DEFAULT_MODELS['gemini']
            fallbacks = [m.strip() for m in env.get('SAHHANITO_GEMINI_FALLBACKS', GEMINI_FALLBACKS).split(',') if m.strip()]
            self.models = [self.model] + [m for m in fallbacks if m != self.model]
        else:
            self.api_key = api_key if api_key is not None else env.get('ANTHROPIC_API_KEY')
            self.model = model or env.get('SAHHANITO_ANTHROPIC_MODEL') or DEFAULT_MODELS['anthropic']
            self.models = [self.model]
        flag = env.get('SAHHANITO_LLM', 'auto').lower()
        self.enabled = enabled if enabled is not None else bool(self.api_key) and flag != 'off'

    def ask(self, question, history, language, message):
        """Returns dict(text, quick_replies, collected, source)."""
        text, quick = template_question(question, language, message)
        result = dict(text=text, quick_replies=quick, collected={}, source='template')
        if not self.enabled:
            return result
        try:
            out = self._call_llm(question, text, history, language)
        except Exception as error:  # network, quota, malformed JSON: never block the triage
            result['llm_error'] = type(error).__name__
            return result
        phrased = (out.get('question') or '').strip()
        if phrased and len(phrased) <= 420 and re.search(r'[?؟]', phrased) and not UNSAFE.search(phrased):
            result.update(text=phrased, source='llm')
        else:
            result['llm_rejected'] = True
        if isinstance(out.get('collected'), dict):
            result['collected'] = {k: v for k, v in out['collected'].items() if v not in (None, '', [])}
        return result

    def _call_llm(self, question, base_text, history, language):
        system = (
            "You are the intake assistant of Sahhanito, a Tunisian emergency triage app. "
            "Your ONLY jobs: (1) ask the patient the next question, (2) note the information they gave.\n"
            "Strict rules:\n"
            "- Never assess urgency, never diagnose, never reassure, never give medical advice or medication. "
            "Urgency is decided by a separate validated system, not by you.\n"
            "- Ask for the SAME information as the base question, but in your own natural words: adapt to what the "
            "patient just said (you may reuse their words), and you may open with one short sentence of acknowledgement "
            "or empathy. Exactly ONE question, max 45 words in total. Keep it simple and warm, like a calm nurse.\n"
            f"- Write in {LANG_NAMES.get(language, 'French')}.\n"
            "- Reply with JSON only: {\"question\": string, \"collected\": {\"age\": number|null, \"sex\": string|null, "
            "\"onset\": string|null, \"duration\": string|null, \"severity\": string|null, \"symptoms\": [string], "
            "\"conditions\": [string], \"medications\": [string], \"allergies\": [string], \"other\": string|null}}. "
            "`collected` only contains what the patient explicitly said."
        )
        transcript = '\n'.join(f"{'Patient' if h['role'] == 'patient' else 'Assistant'}: {h['text']}" for h in history[-12:])
        user = f"Conversation so far:\n{transcript}\n\nBase question to ask next (field `{question['field']}`): {base_text}"
        content = self._complete(system, user)
        match = re.search(r'\{.*\}', content, re.S)
        if not match:
            raise ValueError('no JSON in LLM reply')
        return json.loads(match.group())

    def _complete(self, system, user):
        """Try each model in order, skipping models in cooldown. A quota error (429) puts that model in
        cooldown for as long as the provider asks and moves on at once; no retry delays for the patient."""
        import httpx
        now = time.time()
        with _lock:
            candidates = [m for m in self.models if _cooldown.get(m, 0) <= now]
        if not candidates:
            raise LLMUnavailable('every model is out of quota')
        last = None
        deadline = time.time() + BUDGET_S
        for model in candidates:
            remaining = deadline - time.time()
            if remaining < 1.0:
                self._record('time budget exhausted, using templates')
                break
            try:
                out = self._complete_once(system, user, model, timeout=min(TIMEOUT_S, remaining))
                with _lock:
                    _status['last_model'] = model
                return out
            except httpx.HTTPStatusError as error:
                code = error.response.status_code
                last = error
                if code == 429:
                    wait = _retry_seconds(error.response)
                    with _lock:
                        _cooldown[model] = time.time() + wait
                    self._record(f'{model}: quota exceeded, cooling down {int(wait)} s')
                    continue
                if code in (404, 500, 502, 503, 504):
                    self._record(f'{model}: HTTP {code}')
                    continue
                self._record(f'{model}: HTTP {code} {error.response.text[:200]}')
                raise
            except httpx.TransportError as error:
                last = error
                if isinstance(error, httpx.TimeoutException):
                    with _lock:
                        _cooldown[model] = time.time() + SLOW_COOLDOWN_S
                    self._record(f'{model}: too slow ({type(error).__name__}), skipped for {int(SLOW_COOLDOWN_S)} s')
                else:
                    self._record(f'{model}: {type(error).__name__}')
                continue
        raise LLMUnavailable(str(last))

    @staticmethod
    def _record(message):
        log.warning('LLM %s', message)
        with _lock:
            _status.update(last_error=message, last_error_at=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))

    def _complete_once(self, system, user, model=None, timeout=TIMEOUT_S):
        import httpx
        model = model or self.model
        if self.provider == 'gemini':
            response = httpx.post(
                GEMINI_OPENAI_BASE_URL + 'chat/completions',
                headers={'authorization': f'Bearer {self.api_key}', 'content-type': 'application/json'},
                json={'model': model, 'response_format': {'type': 'json_object'},
                      'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}]},
                timeout=timeout)
            response.raise_for_status()
            return response.json()['choices'][0]['message']['content'] or ''
        response = httpx.post(
            'https://api.anthropic.com/v1/messages',
            headers={'x-api-key': self.api_key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
            json={'model': model, 'max_tokens': 400, 'system': system,
                  'messages': [{'role': 'user', 'content': user}]},
            timeout=timeout)
        response.raise_for_status()
        return ''.join(block.get('text', '') for block in response.json().get('content', []))


# ---- Intake before human review --------------------------------------------------------------
# When the NLP and the rules cannot decide (UNCERTAIN), the clinician needs facts, not a single
# unclear sentence. These general questions are asked before the case goes to review. Answers are
# still parsed by the NLP extractor (an answer like "difficulty breathing" resumes normal triage)
# and are stored verbatim in state['sahhanito']['intake'] for the clinician and the report.
# Quick replies use words the extractor knows, so tapping them feeds the decision.
INTAKE = [
    ('intake.onset', {
        'fr': ('Depuis quand avez-vous ce problème ?', ['Moins d’une heure', 'Quelques heures', '1 à 3 jours', 'Plus longtemps']),
        'en': ('Since when have you had this problem?', ['Less than an hour', 'A few hours', '1–3 days', 'Longer']),
        'ar': ('منذ متى تعاني من هذه المشكلة؟', ['أقل من ساعة', 'بضع ساعات', 'من يوم إلى 3 أيام', 'أكثر']),
        'darija_arabic': ('من وقتاش عندك المشكلة هذي؟', ['أقل من ساعة', 'شوية سوايع', 'من نهار لـ3 أيام', 'أكثر']),
        'darija_latin': ('Men wa9tech 3andek el mochkla hedhi?', ['A9al men sa3a', 'Chwaya swaye3', 'Men nhar l 3 iyem', 'Akther']),
    }),
    ('intake.severity', {
        'fr': ('Sur 10, quelle est l’intensité de la gêne ou de la douleur ?', ['1–3 (faible)', '4–6 (moyenne)', '7–10 (forte)']),
        'en': ('Out of 10, how strong is the discomfort or pain?', ['1–3 (mild)', '4–6 (moderate)', '7–10 (severe)']),
        'ar': ('من 10، ما مدى شدة الألم أو الانزعاج؟', ['1–3 (خفيف)', '4–6 (متوسط)', '7–10 (شديد)']),
        'darija_arabic': ('من 10، قداش الوجيعة قوية؟', ['1–3 (شوية)', '4–6 (متوسطة)', '7–10 (برشة)']),
        'darija_latin': ('Men 10, 9addech el wji3a 9wiya?', ['1–3 (chwaya)', '4–6 (moutawassta)', '7–10 (barcha)']),
    }),
    ('intake.warning_signs', {
        'fr': ('Avez-vous aussi l’un de ces signes ?', ['Fièvre', 'Vomissements', 'Difficulté à respirer', 'Aucun']),
        'en': ('Do you also have any of these?', ['Fever', 'Vomiting', 'Difficulty breathing', 'None']),
        'ar': ('هل لديك أيضًا أحد هذه الأعراض؟', ['حمى', 'نتقيأ', 'ضيق في التنفس', 'لا شيء']),
        'darija_arabic': ('عندك زادة واحد من هذوما؟', ['سخانة', 'نتقيأ', 'صعوبة في التنفس', 'حتى شي']),
        'darija_latin': ('3andek zeda wa7ed men hadhouma?', ['S5ana', 'Nrajja3', 'S3ouba fel tanaffos', '7atta chay']),
    }),
    ('intake.age', {
        'fr': ('Quel âge a la personne malade ?', ['Moins de 2 ans', '2 à 17 ans', '18 à 64 ans', '65 ans ou plus']),
        'en': ('How old is the sick person?', ['Under 2', '2–17', '18–64', '65 or older']),
        'ar': ('كم عمر الشخص المريض؟', ['أقل من سنتين', 'من 2 إلى 17 سنة', 'من 18 إلى 64 سنة', '65 سنة أو أكثر']),
        'darija_arabic': ('قداش عمر المريض؟', ['أقل من عامين', 'من 2 لـ17 عام', 'من 18 لـ64 عام', '65 عام ولا أكثر']),
        'darija_latin': ('9addech 3omr el maridh?', ['A9al men 3amin', 'Men 2 l 17 3am', 'Men 18 l 64 3am', '65 3am wala akther']),
    }),
    ('intake.history', {
        'fr': ('Maladie connue, grossesse ou médicament en cours ? Écrivez-le, ou choisissez.', ['Aucun', 'Je ne sais pas']),
        'en': ('Any known illness, pregnancy or current medicine? Type it, or choose.', ['None', 'Not sure']),
        'ar': ('هل لديك مرض معروف أو حمل أو دواء حالي؟ اكتبه أو اختر.', ['لا شيء', 'مانعرفش']),
        'darija_arabic': ('عندك مرض، حمل ولا دواء تاخو فيه؟ اكتبو ولا اختار.', ['حتى شي', 'مانعرفش']),
        'darija_latin': ('3andek mardh, 7aml wala dwa takhou fih? Ektbou wala e5tar.', ['7atta chay', 'Ma na3rafch']),
    }),
]


def next_intake(answered):
    return next((field for field, _ in INTAKE if field not in answered), None)


def intake_question(field, language, message):
    texts = dict(INTAKE)[field]
    text, quick = texts[reply_key(language, message)]
    return text, quick


def ask_intake(interviewer, field, history, language, message):
    """Deterministic intake question; the LLM may only rephrase it (same safety checks)."""
    text, quick = intake_question(field, language, message)
    result = dict(text=text, quick_replies=quick, collected={}, source='template')
    if not interviewer.enabled:
        return result
    try:
        out = interviewer._call_llm({'field': field}, text, history, language)
    except Exception as error:
        result['llm_error'] = type(error).__name__
        return result
    phrased = (out.get('question') or '').strip()
    if phrased and len(phrased) <= 420 and re.search(r'[?؟]', phrased) and not UNSAFE.search(phrased):
        result.update(text=phrased, source='llm')
    if isinstance(out.get('collected'), dict):
        result['collected'] = {k: v for k, v in out['collected'].items() if v not in (None, '', [])}
    return result


MAX_INTAKE = 5
TOPICS = {
    'intake.context': 'how it happened / circumstances',
    'intake.red_flags': 'warning signs specific to this complaint that would change urgency (e.g. bleeding, wound, numbness, inability to move, loss of consciousness, chest pain, breathing difficulty)',
    'intake.onset': 'when it started / how long',
    'intake.severity': 'how strong it is (0-10)',
    'intake.warning_signs': 'other warning signs (fever, vomiting, breathing difficulty, fainting, bleeding)',
    'intake.age': 'age of the sick person',
    'intake.history': 'known illnesses, pregnancy, current medicines',
}


def intake_open(answered, interviewer, limit=MAX_INTAKE):
    """True while intake questions remain: at most `limit`, adaptive (LLM) or the fixed list."""
    return len(answered) < limit and (interviewer.enabled or next_intake(answered) is not None)


PURPOSE = {
    'uncertain': ("The triage system could not yet understand this patient well enough. Your ONLY job: ask the ONE next "
                  "question that will help most, then note what the patient said.\n"
                  "- If the main complaint is still vague, ask what exactly is wrong and where (topic \"clarify\"). "
                  "Otherwise pick the most useful remaining topic.\n"),
    'followup': ("The triage system has a preliminary, NOT final, picture of the complaint. Your ONLY job: ask the ONE "
                 "follow-up question that best completes it before the final decision, then note what the patient said.\n"
                 "- Prefer questions whose answer could change the urgency for THIS complaint (topic \"intake.red_flags\": "
                 "e.g. for an injury: open wound or bone visible, bleeding, numbness, can they move it; for pain: chest pain, "
                 "breathing difficulty, fainting), then how it happened, intensity, age, history and medicines "
                 "(e.g. blood thinners).\n"),
}


def ask_adaptive_intake(interviewer, answered, history, language, message, purpose='uncertain'):
    """Next intake question. With the LLM: chosen from the conversation (clarify the complaint, or the
    most useful missing topic) with matching quick replies. Otherwise: the next fixed question."""
    fallback_field = next_intake(answered)

    def fixed():
        if fallback_field is None:
            return None
        text, quick = intake_question(fallback_field, language, message)
        return dict(text=text, quick_replies=quick, field=fallback_field, collected={}, source='template')

    if not interviewer.enabled:
        return fixed()
    remaining = {k: v for k, v in TOPICS.items() if k not in answered}
    system = (
        "You are the intake assistant of Sahhanito, a Tunisian emergency triage app. " + PURPOSE[purpose] +
        "Strict rules:\n"
        "- Never assess urgency, never mention a level or a hospital, never diagnose, never reassure, never give advice or medication.\n"
        "- Talk naturally: you may acknowledge what the patient said in one short sentence, then ask ONE question "
        "(max 45 words in total), adapted to their words; never repeat a question already asked.\n"
        "- Up to 4 short quick replies (max 4 words each) the patient can tap, in the same language.\n"
        f"- Write in {LANG_NAMES.get(language, 'French')}.\n"
        "- JSON only: {\"topic\": one of " + json.dumps((['clarify'] if purpose == 'uncertain' else []) + list(remaining)) + ", \"question\": string, "
        "\"quick_replies\": [string], \"collected\": {\"age\": number|null, \"onset\": string|null, \"severity\": string|null, "
        "\"symptoms\": [string], \"conditions\": [string], \"medications\": [string], \"other\": string|null}}"
    )
    transcript = '\n'.join(f"{'Patient' if h['role'] == 'patient' else 'Assistant'}: {h['text']}" for h in history[-14:])
    user = (f"Conversation so far:\n{transcript}\n\nRemaining topics: "
            + json.dumps({k: v for k, v in remaining.items()}) + f"\nQuestions already asked in intake: {len(answered)} of {MAX_INTAKE}.")
    try:
        content = interviewer._complete(system, user)
        out = json.loads(re.search(r'\{.*\}', content, re.S).group())
    except Exception:
        return fixed()
    question = (out.get('question') or '').strip()
    topic = out.get('topic')
    quick = [q.strip() for q in (out.get('quick_replies') or []) if isinstance(q, str) and 0 < len(q.strip()) <= 40][:4]
    if not question or len(question) > 420 or not re.search(r'[?؟]', question) or UNSAFE.search(question):
        return fixed()
    if topic == 'clarify' and purpose == 'uncertain':
        field = f"intake.clarify.{sum(k.startswith('intake.clarify') for k in answered) + 1}"
    elif topic in remaining:
        field = topic
    else:
        return fixed()
    collected = out.get('collected') if isinstance(out.get('collected'), dict) else {}
    return dict(text=question, quick_replies=quick, field=field, source='llm',
                collected={k: v for k, v in collected.items() if v not in (None, '', [])})



# ---- Explaining the decision in the chat -----------------------------------------------------------
# The level is decided by the NLP model + rules + fusion. The LLM only explains it to the patient, from the
# reasons the system gives; a reviewed template is used if the LLM is off, fails or writes something unsafe.
LEVEL_NAMES = {
    'fr': {'EMERGENCY': 'urgence vitale', 'HIGH': 'urgent', 'LOW': 'peu urgent', 'UNCERTAIN': 'à vérifier par un médecin'},
    'en': {'EMERGENCY': 'life-threatening emergency', 'HIGH': 'urgent', 'LOW': 'not urgent', 'UNCERTAIN': 'to be checked by a doctor'},
    'ar': {'EMERGENCY': 'حالة طارئة خطيرة', 'HIGH': 'مستعجل', 'LOW': 'غير مستعجل', 'UNCERTAIN': 'تحتاج مراجعة طبيب'},
    'darija': {'EMERGENCY': 'حالة مستعجلة برشة', 'HIGH': 'مستعجل', 'LOW': 'موش مستعجل', 'UNCERTAIN': 'لازمها طبيب يثبّت'},
}
NEXT_STEP = {
    'fr': {'EMERGENCY': 'Appelez le 190 maintenant. Ouvrez les consignes d’urgence : nous prévenons l’hôpital le plus adapté.',
           'HIGH': 'Il faut être vu aux urgences aujourd’hui. Ouvrez votre résultat pour trouver l’hôpital adapté.',
           'LOW': 'Vous pouvez vous soigner à la maison et surveiller vos symptômes. Votre résultat explique quand revenir.',
           'UNCERTAIN': 'Un médecin va vérifier votre situation. Restez près de votre téléphone.'},
    'en': {'EMERGENCY': 'Call 190 now. Open the emergency instructions: we are alerting the most suitable hospital.',
           'HIGH': 'You need to be seen in an emergency department today. Open your result to find the right hospital.',
           'LOW': 'You can look after yourself at home and watch your symptoms. Your result explains when to come back.',
           'UNCERTAIN': 'A doctor will check your situation. Stay close to your phone.'},
    'ar': {'EMERGENCY': 'اتصل بالرقم 190 الآن. افتح تعليمات الطوارئ: نحن نُعلم المستشفى الأنسب.',
           'HIGH': 'يجب أن تُفحص في قسم الاستعجالي اليوم. افتح نتيجتك لإيجاد المستشفى المناسب.',
           'LOW': 'يمكنك الاعتناء بنفسك في المنزل ومراقبة الأعراض. نتيجتك تشرح متى تعود.',
           'UNCERTAIN': 'سيراجع طبيب حالتك. ابق قريبًا من هاتفك.'},
    'darija': {'EMERGENCY': 'عيّط للـ190 توا. حلّ تعليمات الاستعجالي: احنا نعلمو السبيطار المناسب.',
               'HIGH': 'لازمك تتشاف في الاستعجالي اليوم. حلّ النتيجة باش تلقى السبيطار المناسب.',
               'LOW': 'تنجم تداوي روحك في الدار وتراقب الأعراض. النتيجة تقلك وقتاش ترجع.',
               'UNCERTAIN': 'طبيب باش يثبّت في حالتك. خلّي التليفون قريب منك.'},
}
INTRO = {'fr': 'D’après ce que vous m’avez dit, votre situation est évaluée : {level}.',
         'en': 'From what you told me, your situation is assessed as: {level}.',
         'ar': 'بناءً على ما أخبرتني به، تم تقييم حالتك: {level}.',
         'darija': 'حسب اللي قلتهولي، الحالة متاعك: {level}.'}
WHY = {'fr': 'Ce qui compte surtout : {why}.', 'en': 'What matters most: {why}.', 'ar': 'الأهم: {why}.', 'darija': 'أهم حاجة: {why}.'}


def template_explanation(level, reasons, language):
    lang = language if language in LEVEL_NAMES else 'fr'
    parts = [INTRO[lang].format(level=LEVEL_NAMES[lang][level])]
    if reasons:
        sep = '، ' if lang in ('ar', 'darija') else ', '
        parts.append(WHY[lang].format(why=sep.join(reasons[:3]).rstrip('.')))
    parts.append(NEXT_STEP[lang][level])
    return ' '.join(parts)


def explain_decision(interviewer, level, reasons, history, language):
    """Short chat message explaining the decided level. reasons: the system's own reasons, in the patient's language."""
    fallback = dict(text=template_explanation(level, reasons, language), source='template')
    if not interviewer.enabled:
        return fallback
    lang = language if language in LEVEL_NAMES else 'fr'
    system = (
        "You are the intake assistant of Sahhanito, a Tunisian emergency triage app. A separate validated system "
        "has ALREADY decided the urgency level. Your ONLY job: explain this decision to the patient, kindly and simply.\n"
        "Strict rules:\n"
        f"- State the level exactly as given (\"{LEVEL_NAMES[lang][level]}\"). Never change it, soften it or question it.\n"
        "- Explain why using ONLY the reasons provided (you may relate them to what the patient said). Do not add "
        "diagnoses, causes, medicines or advice that are not in the next step.\n"
        "- End with the next step provided, in your own words.\n"
        + ("- This is an emergency: the message MUST tell them to call 190 now.\n" if level == 'EMERGENCY' else "") +
        "- 2 to 4 short sentences, max 90 words, warm and calm. No questions.\n"
        f"- Write in {LANG_NAMES.get(language, 'French')}.\n"
        "- Reply with JSON only: {\"message\": string}"
    )
    transcript = '\n'.join(f"{'Patient' if h['role'] == 'patient' else 'Assistant'}: {h['text']}" for h in history[-12:])
    user = (f"Conversation:\n{transcript}\n\nDecided level: {LEVEL_NAMES[lang][level]}\n"
            f"Reasons from the system: {'; '.join(reasons) if reasons else '(no specific warning sign)'}\n"
            f"Next step: {NEXT_STEP[lang][level]}")
    try:
        content = interviewer._complete(system, user)
        msg = (json.loads(re.search(r'\{.*\}', content, re.S).group()).get('message') or '').strip()
    except Exception:
        return fallback
    bad = (not msg or len(msg) > 700 or MED_ADVICE.search(msg)
           or (level == 'EMERGENCY' and '190' not in msg)
           or (level != 'LOW' and REASSURE.search(msg)))
    return fallback if bad else dict(text=msg, source='llm')


MED_ADVICE = re.compile(r"diagnos|take (?:paracetamol|ibuprofen|aspirin)|prenez (?:du|de l|un|une)|doliprane|paracétamol|ibuprof", re.I)
REASSURE = re.compile(r"pas grave|rien de grave|not serious|nothing serious|don.t worry|ne vous inquiétez pas|ma tkhafch|ما تخافش", re.I)
