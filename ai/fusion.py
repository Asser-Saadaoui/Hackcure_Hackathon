"""Sahhanito fusion: NLP emergency score (p_nlp) + rule score (s_rule) -> p_final + uncertainty.

Logistic fusion, so every part's contribution is explainable (shown in the hospital dashboard):

    z       = bias + W_NLP * (logit(p_nlp) - logit(threshold)) + W_RULES * s_rule
    p_final = sigmoid(z)

- The NLP term is centred on the model's own decision threshold (0.15), so a score exactly at the
  threshold contributes 0, above it pushes up, below it pushes down.
- When the NLP model abstains (insufficient input) or is unavailable, its term is 0 and the
  uncertainty rises: the rules still count, a critical rule still wins.
- Parameters are hand-set for the prototype, NOT fitted. Re-fit them (logistic regression on
  [nlp_term, s_rule]) once clinician-labelled Tunisian cases exist.
"""
import math

VERSION = 'fusion-logistic-0.1'
BIAS = -1.5
W_NLP = 0.8
W_RULES = 4.0
DEFAULT_THRESHOLD = 0.15
EPS = 1e-4

# Level bands on p_final (the decision policy applies rule floors on top).
EMERGENCY_AT = 0.85
HIGH_AT = 0.40
BORDER = 0.07  # p_final this close to a band edge -> MEDIUM uncertainty


def logit(p):
    p = min(max(p, EPS), 1 - EPS)
    return math.log(p / (1 - p))


def sigmoid(z):
    return 1 / (1 + math.exp(-z))


def fuse(ml, rules):
    """ml: process_turn()['ml']; rules: rule_engine.evaluate() output."""
    status = ml.get('status', 'ok')
    p_nlp = ml.get('emergency_score') if status == 'ok' else None
    threshold = ml.get('threshold') or DEFAULT_THRESHOLD
    s_rule = rules['s_rule']

    nlp_term = W_NLP * (logit(p_nlp) - logit(threshold)) if p_nlp is not None else 0.0
    rules_term = W_RULES * s_rule
    p_final = sigmoid(BIAS + nlp_term + rules_term)

    uncertainty, reasons = _uncertainty(p_nlp, threshold, status, rules, p_final)
    return dict(
        p_nlp=None if p_nlp is None else round(p_nlp, 4),
        nlp_status=status,
        nlp_threshold=threshold,
        s_rule=s_rule,
        p_final=round(p_final, 4),
        uncertainty=uncertainty,
        uncertainty_reasons=reasons,
        contributions=dict(bias=BIAS, nlp=round(nlp_term, 3), rules=round(rules_term, 3)),
        fusion_version=VERSION,
        clinically_calibrated=False,
    )


def _uncertainty(p_nlp, threshold, status, rules, p_final):
    if rules['critical']:
        return 'LOW', ['critical rule triggered']
    reasons = []
    triggered = bool(rules['triggered_rules'])
    if p_nlp is None:
        if not triggered:
            return 'HIGH', [f'NLP model {status} and no rule triggered: not enough information']
        reasons.append(f'NLP model {status}; decision rests on rules only')
    else:
        if p_nlp >= 0.7 and not triggered:
            reasons.append('NLP model sees an emergency that no rule explains')
        if p_nlp < threshold / 3 and rules['s_rule'] >= 0.6:
            reasons.append('rules flag risk that the NLP model does not see')
    if min(abs(p_final - EMERGENCY_AT), abs(p_final - HIGH_AT)) < BORDER:
        reasons.append('p_final close to a level boundary')
    return ('MEDIUM' if reasons else 'LOW'), reasons
