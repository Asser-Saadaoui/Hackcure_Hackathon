"""Explainability of the NLP classification (p_nlp): which elements of the case moved the score.

Method: leave-one-group-out attribution. The model's ~30 active features for a case are grouped into
meaningful elements (one clinical concept such as chest pain, plus age, duration, intensity, vital signs,
sex). For each element we remove its features, re-score the case with the same model (one batched call),
and report contribution = score(full case) - score(without the element), in probability points.
  > 0: the element pushed the model towards "emergency"; < 0: towards "not an emergency".
Model-agnostic (works for the CatBoost + HistGradientBoosting + ExtraTrees ensemble), exact for this case,
but contributions are not additive and are not clinical probabilities (the model is not calibrated).
"""
from clinical_state import facts_to_info
from ml_features import build_features

VERSION = 'explain-occlusion-0.1'
VITALS = ('oxygen_saturation', 'heart_rate', 'systolic', 'diastolic', 'temperature_c', 'respiratory_rate', 'glucose')
PREFIXES = ('fact.', 'fact_time.', 'onset.', 'mention.', 'time.', 'current.', 'acute.', 'recent.', 'severity.',
            'observed.', 'topic.', 'topic_status.', 'medication_role.')


def group_of(feature):
    """(group key, kind) for a feature name; None for features that carry no case information."""
    if feature.startswith('age') or feature == 'missing.age':
        return 'age', 'age'
    if feature in ('reported_sex', 'missing.reported_sex'):
        return 'sex', 'sex'
    if feature.startswith('duration') or feature == 'missing.onset_or_duration':
        return 'duration', 'duration'
    if feature == 'missing.symptom_severity':
        return 'severity_missing', 'severity'
    if feature == 'missing.vital_signs' or any(feature.startswith(v) for v in VITALS):
        name = next((v for v in VITALS if feature.startswith(v)), None)
        measured = name and feature.endswith('_scaled')
        return (f'vital.{name}', 'vital') if measured else ('vitals_missing', 'vital')
    if feature in ('third_person_report', 'episodic_presentation'):
        return feature, 'context'
    if feature.startswith('severity.'):
        return 'severity_given', 'severity'
    if feature.startswith(PREFIXES):
        concept = feature.split('.')[-1].replace('term_', '')
        return f'concept.{concept}', 'concept'
    return None


def _status(features):
    keys = ' '.join(features)
    if 'fact.negated.' in keys or 'mention.absent.' in keys or '.negated.' in keys:
        return 'absent'
    if 'fact.uncertain.' in keys or 'mention.possible.' in keys:
        return 'uncertain'
    return 'present'


def explain_nlp(state, bundle, top=6, minimum=0.01):
    """Return {score, factors:[{group, kind, concept, status, contribution}], method} or None if the model abstained."""
    model = bundle['model']
    info = facts_to_info(state['facts'], state.get('patient_experiencer', 'patient'))
    info['observations'] = state.get('observations', state['facts'])
    features = build_features(info)
    groups = {}
    for name in features:
        g = group_of(name)
        if g:
            groups.setdefault(g, []).append(name)
    if not groups:
        return None
    order = list(groups)
    variants = [features] + [{k: v for k, v in features.items() if k not in set(groups[g])} for g in order]
    scores = model.predict_proba(variants)[:, 1]
    full = float(scores[0])
    factors = []
    for (key, kind), score in zip(order, scores[1:]):
        delta = full - float(score)
        if abs(delta) < minimum:
            continue
        names = groups[(key, kind)]
        concept = key.split('.', 1)[1] if '.' in key else key
        # Whether the element was given or missing changes its meaning (age, duration, sex).
        if kind == 'age':
            concept = 'age_missing' if features.get('age_missing') == 1.0 else 'age_given'
        elif kind == 'duration':
            concept = 'duration_missing' if names == ['missing.onset_or_duration'] else 'duration_given'
        elif kind == 'sex':
            concept = 'sex_missing' if features.get('reported_sex') == 'not_reported' else 'sex_given'
        factors.append(dict(group=key, kind=kind, concept=concept, status=_status(names), contribution=round(delta, 4)))
    factors.sort(key=lambda f: -abs(f['contribution']))
    # Near 0 or 1, removing one element barely moves the score because the others agree (saturation).
    saturated = not factors and (full > 0.97 or full < 0.03)
    return dict(score=round(full, 4), factors=factors[:top], saturated=saturated, method=VERSION,
                note='Leave-one-group-out on the model input; contributions are not additive or calibrated.')
