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
import os
import re

VERSION = 'interviewer-0.2'
DEFAULT_MODELS = {'gemini': 'gemini-3.8-flash', 'anthropic': 'claude-sonnet-5-5'}
GEMINI_OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/'
TIMEOUT_S = 8.0
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
        else:
            self.api_key = api_key if api_key is not None else env.get('ANTHROPIC_API_KEY')
            self.model = model or env.get('SAHHANITO_ANTHROPIC_MODEL') or DEFAULT_MODELS['anthropic']
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
        if phrased and len(phrased) <= 300 and re.search(r'[?؟]', phrased) and not UNSAFE.search(phrased):
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
            "- Ask exactly ONE short question (max 25 words) with the SAME meaning as the base question. "
            "You may start with a few words of empathy.\n"
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
        """Retries rate limits (free-tier 429) and overloads twice, briefly: the template is a fine fallback."""
        import time
        import httpx
        for attempt in range(3):
            try:
                return self._complete_once(system, user)
            except httpx.HTTPStatusError as error:
                if error.response.status_code not in (429, 500, 503) or attempt == 2:
                    raise
                retry_after = error.response.headers.get('retry-after', '')
                time.sleep(min(float(retry_after) if retry_after.replace('.', '', 1).isdigit() else 1.0 + attempt, 2.5))

    def _complete_once(self, system, user):
        import httpx
        if self.provider == 'gemini':
            response = httpx.post(
                GEMINI_OPENAI_BASE_URL + 'chat/completions',
                headers={'authorization': f'Bearer {self.api_key}', 'content-type': 'application/json'},
                json={'model': self.model, 'response_format': {'type': 'json_object'},
                      'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}]},
                timeout=TIMEOUT_S)
            response.raise_for_status()
            return response.json()['choices'][0]['message']['content'] or ''
        response = httpx.post(
            'https://api.anthropic.com/v1/messages',
            headers={'x-api-key': self.api_key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
            json={'model': self.model, 'max_tokens': 400, 'system': system,
                  'messages': [{'role': 'user', 'content': user}]},
            timeout=TIMEOUT_S)
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
    if phrased and len(phrased) <= 300 and re.search(r'[?؟]', phrased) and not UNSAFE.search(phrased):
        result.update(text=phrased, source='llm')
    if isinstance(out.get('collected'), dict):
        result['collected'] = {k: v for k, v in out['collected'].items() if v not in (None, '', [])}
    return result
