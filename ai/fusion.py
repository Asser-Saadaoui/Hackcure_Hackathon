"""Sahhanito fusion: NLP emergency score (p_nlp) + rule score (s_rule) -> p_final + uncertainty.

Logistic fusion, so every part's contribution is explainable (shown in the hospital dashboard):

    z       = b0 + b1 * logit(p_nlp) + b2 * s_rule
    p_final = sigmoid(z)

- Coefficients come from fusion_coefs.json. Contributions use the equivalent
  prevalence-centered form; the ensemble threshold remains 0.15 independently.
- When the NLP model abstains (insufficient input) or is unavailable, its term is 0 and the
  uncertainty rises: the rules still count, a critical rule still wins.
- This is an exploratory weak-label fit, not clinical calibration. It did not
  improve NLP-only CV Brier; see FUSION.md. Critical rules still override fusion.
"""
import math
import json
from pathlib import Path

VERSION = 'fusion-logistic-weak-fit-0.2'
COEFS = json.loads(Path(__file__).with_name('fusion_coefs.json').read_text())
B0 = float(COEFS['b0'])
W_NLP = float(COEFS['b1'])
W_RULES = float(COEFS['b2'])
PREVALENCE = float(COEFS['prevalence'])
DEFAULT_THRESHOLD = 0.15
EPS = float(COEFS['eps'])
if not (all(math.isfinite(v) for v in (B0, W_NLP, W_RULES, PREVALENCE, EPS))
        and 0 < EPS < .5 and EPS <= PREVALENCE <= 1-EPS):
    raise ValueError('Invalid fusion coefficients')
BIAS = B0 + W_NLP * math.log(PREVALENCE / (1-PREVALENCE))

# Level bands on p_final (the decision policy applies rule floors on top).
EMERGENCY_AT = 0.85
HIGH_AT = 0.40
BORDER = 0.07  # p_final this close to a band edge -> MEDIUM uncertainty


def logit(p):
    p = min(max(p, EPS), 1 - EPS)
    return math.log(p / (1 - p))


def sigmoid(z):
    if z >= 0:
        return 1 / (1 + math.exp(-z))
    e = math.exp(z)
    return e / (1 + e)


def fuse(ml, rules):
    """ml: process_turn()['ml']; rules: rule_engine.evaluate() output."""
    status = ml.get('status', 'ok')
    p_nlp = ml.get('emergency_score') if status == 'ok' else None
    threshold = ml.get('threshold') or DEFAULT_THRESHOLD
    s_rule = rules['s_rule']

    nlp_term = W_NLP * (logit(p_nlp) - logit(PREVALENCE)) if p_nlp is not None else 0.0
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
        fusion_metadata=dict(coefficient_source='fusion_coefs.json', fit_population=COEFS['fit_population'],
                             n_train=COEFS['n_train'], prevalence=PREVALENCE,
                             date=COEFS['date'], score_reference='weak_binary_annotations',
                             missing_nlp_policy='omit_centered_nlp_term_not_a_fitted_probability'),
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
