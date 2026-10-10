"""Sahhanito LLM interviewer: chats with the patient and collects information. It never decides.

Division of work:
  - WHAT to ask is chosen deterministically (adaptive_questions: the missing field the NLP model
    and the rules need next). The LLM only phrases it kindly, in the patient's language.
  - The patient's answer is parsed by the NLP extractor, never by the LLM, so the decision inputs
    stay deterministic and auditable.
  - The LLM also returns `collected` notes (age, onset, medications...) for the hospital report.
    They are stored in patient_state['llm_notes'] and are NOT read by the rules, fusion or decision.
  - It is never called for an emergency or a final result: those messages are fixed texts.

Provider: Anthropic Messages API when ANTHROPIC_API_KEY is set (model SAHHANITO_LLM_MODEL),
otherwise, or on any error or unsafe output, the reviewed question templates are used.
"""
import json
import os
import re

VERSION = 'interviewer-0.1'
DEFAULT_MODEL = 'claude-sonnet-5-5'
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
    def __init__(self, api_key=None, model=None, enabled=None):
        self.api_key = api_key if api_key is not None else os.environ.get('ANTHROPIC_API_KEY')
        self.model = model or os.environ.get('SAHHANITO_LLM_MODEL', DEFAULT_MODEL)
        flag = os.environ.get('SAHHANITO_LLM', 'auto').lower()
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
        import httpx
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
        response = httpx.post(
            'https://api.anthropic.com/v1/messages',
            headers={'x-api-key': self.api_key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
            json={'model': self.model, 'max_tokens': 400, 'system': system,
                  'messages': [{'role': 'user', 'content': user}]},
            timeout=TIMEOUT_S)
        response.raise_for_status()
        content = ''.join(block.get('text', '') for block in response.json().get('content', []))
        match = re.search(r'\{.*\}', content, re.S)
        if not match:
            raise ValueError('no JSON in LLM reply')
        return json.loads(match.group())
