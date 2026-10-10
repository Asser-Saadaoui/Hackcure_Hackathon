"""Sahhanito decision policy: fusion + rules -> level, actions, routing hints.

Safety properties (tested in test_decision.py):
  1. A critical rule always gives EMERGENCY, whatever the NLP model says or whether it runs.
  2. Escalate-only: the level is never below the rules' floor (high rule -> at least HIGH).
  3. Not enough information (NLP abstains and no rule) -> UNCERTAIN -> clinician review.
  4. The LLM has no input here: it only phrases questions (interviewer.py).
"""
from fusion import EMERGENCY_AT, HIGH_AT

VERSION = 'decision-0.1'
RANK = {'LOW': 0, 'UNCERTAIN': 1, 'HIGH': 2, 'EMERGENCY': 3}

GENERIC_RATIONALE = {
    'EMERGENCY': {'fr': "Le modèle et les règles indiquent une urgence.", 'en': 'The model and the rules indicate an emergency.',
                  'ar': 'يشير النموذج والقواعد إلى حالة طارئة.', 'darija': 'النموذج والقواعد يقولو اللي الحالة مستعجلة.'},
    'HIGH': {'fr': "Risque élevé : évaluation aux urgences aujourd'hui.", 'en': 'High risk: emergency department assessment today.',
             'ar': 'خطر مرتفع: يجب التقييم في قسم الاستعجالي اليوم.', 'darija': 'الخطر عالي: لازم تتشاف في الاستعجالي اليوم.'},
    'LOW': {'fr': 'Pas de signe de gravité détecté : soins à domicile et surveillance.', 'en': 'No sign of severity detected: home care and monitoring.',
            'ar': 'لم يتم رصد علامات خطورة: رعاية منزلية ومراقبة.', 'darija': 'ما فماش علامات خطر: ارتاح في الدار وراقب روحك.'},
    'UNCERTAIN': {'fr': 'Informations insuffisantes : un clinicien va vérifier.', 'en': 'Not enough information: a clinician will check.',
                  'ar': 'المعلومات غير كافية: سيقوم طبيب بالمراجعة.', 'darija': 'المعلومات موش كافية: طبيب باش يثبّت.'},
}


def decide(assessment, rules, language='fr'):
    """assessment: fusion.fuse() output; rules: rule_engine.evaluate() output."""
    p = assessment['p_final']
    band = 'EMERGENCY' if p >= EMERGENCY_AT else 'HIGH' if p >= HIGH_AT else 'LOW'
    floor = rules['level_floor']

    if rules['critical']:
        level, basis = 'EMERGENCY', 'critical_rule'
    elif assessment['uncertainty'] == 'HIGH' and floor is None:
        level, basis = 'UNCERTAIN', 'insufficient_information'
    else:
        level, basis = band, 'fusion'
        if floor and RANK[floor] > RANK[level]:
            level, basis = floor, 'rule_floor'

    actions = {
        'EMERGENCY': ['CALL_EMERGENCY', 'REFER_NEAREST_ED'],
        'HIGH': ['REFER_ED'],
        'LOW': ['SELF_CARE', 'SCHEDULE_VISIT'],
        'UNCERTAIN': ['CLINICIAN_REVIEW'],
    }[level]
    if level in ('EMERGENCY', 'HIGH') and assessment['uncertainty'] != 'LOW':
        actions.append('CLINICIAN_REVIEW')

    specialty = rules['suggested_specialty']
    if specialty is None and level in ('EMERGENCY', 'HIGH'):
        specialty = 'EMERG'
    top = [r for r in rules['triggered_rules'] if r['severity'] == rules['triggered_rules'][0]['severity']] if rules['triggered_rules'] else []
    rationale = {lang: ' '.join(r['rationale'][lang] for r in top[:2]) or GENERIC_RATIONALE[level][lang]
                 for lang in ('fr', 'en', 'ar', 'darija')}

    return dict(
        level=level,
        basis=basis,
        actions=actions,
        suggested_specialty=specialty,
        required_equipment=rules['required_equipment'] if level in ('EMERGENCY', 'HIGH') else [],
        rationale=rationale['en'],
        rationale_localized=rationale.get(language, rationale['fr']),
        rationale_all=rationale,
        decision_version=VERSION,
    )
