"""Sahhanito rule engine: deterministic red flags -> rule score s_rule.

Inputs (never the ML score, so the two signals stay independent for fusion):
  - the clinical facts extracted by clinical_state / multilingual_nlp,
  - the clinical screens of clinical_rules.evaluate_rules (reused, not duplicated),
  - the raw patient messages, matched against a FR / Darija (Arabizi + Arabic script) /
    Arabic / EN lexicon with negation and context ("last year", "if", "afraid of") checks.

Rules live in rules.v1.json. Severity policy:
  critical -> s_rule = 1.0 and level floor EMERGENCY (fusion can never lower it)
  high     -> level floor HIGH, contributes its weight
  moderate -> contributes its weight only
Non-critical weights combine as a noisy-OR: s_rule = 1 - prod(1 - w).

Unvalidated prototype: rules, weights and wording need clinician review.
Absence of a triggered rule never establishes safety.
"""
import json
import re
from functools import lru_cache
from pathlib import Path

from multilingual_nlp import fold

RULES_PATH = Path(__file__).resolve().parent / 'rules.v1.json'
SEVERITY_ORDER = {'critical': 3, 'high': 2, 'moderate': 1}
LEVEL_ORDER = {None: 0, 'HIGH': 1, 'EMERGENCY': 2}
CUE_WINDOW = 30  # characters before a match searched for negation / context cues


class RuleEngine:
    def __init__(self, path=RULES_PATH):
        config = json.loads(Path(path).read_text(encoding='utf-8'))
        self.version = config['version']
        self.validation_status = config['validation_status']
        self.policy = config['severity_policy']
        self.rules = config['rules']
        self.negation = [re.compile(p, re.I) for p in config['negation_cues']]
        self.context = [re.compile(p, re.I) for p in config['context_cues']]
        self.breaks = re.compile(config['clause_breaks'], re.I)
        self.lexicon = {name: re.compile('|'.join(f'(?:{p})' for p in patterns), re.I)
                        for name, patterns in config['lexicon'].items()}
        self._check_references()

    def _check_references(self):
        def walk(node, rule_id):
            for key, value in node.items():
                if key in ('any', 'all'):
                    for child in value:
                        walk(child, rule_id)
                elif key == 'text' and value not in self.lexicon:
                    raise ValueError(f'{rule_id}: unknown lexicon entry {value!r}')
        for rule in self.rules:
            if rule['severity'] not in SEVERITY_ORDER:
                raise ValueError(f"{rule['id']}: unknown severity {rule['severity']!r}")
            if rule['severity'] != 'critical' and not 0 < rule.get('weight', 0) < 1:
                raise ValueError(f"{rule['id']}: non-critical rules need a weight in (0, 1)")
            walk(rule['when'], rule['id'])

    # ---- text matching -------------------------------------------------------------

    def _affirmed(self, folded, start, end):
        """False when a negation cue precedes the span, or a context cue (history, hypothesis, fear)
        surrounds it, inside the same clause."""
        clause_start = max((b.end() for b in self.breaks.finditer(folded, 0, start)), default=0)
        next_break = self.breaks.search(folded, end)
        clause_end = next_break.start() if next_break else len(folded)
        before = folded[max(clause_start, start - CUE_WINDOW):start]
        after = folded[end:min(clause_end, end + CUE_WINDOW)]
        if any(c.search(before) for c in self.negation):
            return False
        return not any(c.search(before) or c.search(after) for c in self.context)

    def match_text(self, entry, message, turn_id=None):
        """Affirmed matches of a lexicon entry in one message (negated / contextual ones are skipped)."""
        folded, mapping = fold(message)
        found = []
        for m in self.lexicon[entry].finditer(folded):
            if not self._affirmed(folded, m.start(), m.end()):
                continue
            start, end = mapping[m.start()][0], mapping[m.end() - 1][1]
            found.append(dict(source='text', lexicon=entry, text=message[start:end], start=start, end=end, turn_id=turn_id))
        return found

    def fact_affirmed(self, fact, messages):
        """Cross-check an extracted fact against the same cues: the extractor can miss French or
        Darija negation ("j'ai pas de douleur thoracique"). Facts coming from answers to a linked
        question (no span in the patient's words) are kept as extracted."""
        spans = [e for e in fact.get('evidence') or [] if e.get('source') == 'answer' and e.get('kind') != 'context'
                 and isinstance(e.get('turn_id'), int) and 0 <= e['turn_id'] < len(messages)
                 and isinstance(e.get('start'), int) and isinstance(e.get('end'), int)]
        for e in spans:
            folded, mapping = fold(messages[e['turn_id']])
            start = next((i for i, (a, _) in enumerate(mapping) if a >= e['start']), len(folded))
            end = next((i for i, (_, b) in enumerate(mapping) if b >= e['end']), len(folded) - 1) + 1
            if self._affirmed(folded, start, end):
                return True
        return not spans

    # ---- conditions ----------------------------------------------------------------

    def _check(self, node, ctx):
        """Returns (matched, evidence)."""
        if 'any' in node:
            results = [self._check(child, ctx) for child in node['any']]
            evidence = [e for ok, ev in results if ok for e in ev]
            return any(ok for ok, _ in results), evidence
        if 'all' in node:
            results = [self._check(child, ctx) for child in node['all']]
            ok = all(ok for ok, _ in results)
            return ok, [e for _, ev in results for e in ev] if ok else []
        if 'screen' in node:
            screen = ctx['screens'].get(node['screen'])
            if not screen:
                return False, []
            evidence = [dict(source='screen', screen=node['screen'], text=e.get('text'), turn_id=e.get('turn_id'))
                        for e in screen.get('evidence', [])] or [dict(source='screen', screen=node['screen'], text=None, turn_id=None)]
            return True, evidence
        if 'text' in node:
            evidence = [e for i, msg in enumerate(ctx['messages']) for e in self.match_text(node['text'], msg, i)]
            return bool(evidence), evidence
        if 'fact' in node:
            matches = [f for f in ctx['facts'] if _fact_matches(f, node['fact'])]
            return bool(matches), [_fact_evidence(f) for f in matches]
        if 'vital' in node:
            fact = _latest(ctx['facts'], 'vital', node['vital'])
            ok = fact is not None and _compare(fact.get('value'), node)
            return ok, [_fact_evidence(fact)] if ok else []
        if 'age' in node:
            fact = _latest(ctx['facts'], 'demographic', 'age')
            ok = fact is not None and _compare(fact.get('value'), node['age'])
            return ok, [_fact_evidence(fact)] if ok else []
        raise ValueError(f'Unknown condition: {node}')

    # ---- evaluation ----------------------------------------------------------------

    def evaluate(self, patient_state, screens=None, exclude=()):
        """Evaluate every rule on the conversation so far. `screens` = clinical_rules.evaluate_rules output.
        `exclude`: rule ids the patient ruled out in a confirmation question (e.g. a long-standing speech problem)."""
        if screens is None:
            from clinical_rules import evaluate_rules
            screens = evaluate_rules(patient_state)
        target = patient_state.get('patient_experiencer', 'patient')
        messages = [t.get('answer') or '' for t in patient_state.get('turns', [])]
        facts = [f for f in patient_state.get('facts', []) if f.get('experiencer') == target]
        ctx = dict(
            facts=[f for f in facts if f.get('status') != 'confirmed' or self.fact_affirmed(f, messages)],
            messages=messages,
            screens={r['rule_id']: r for r in screens.get('triggered_rules', [])},
        )
        triggered = []
        for rule in self.rules:
            if rule['id'] in exclude:
                continue
            ok, evidence = self._check(rule['when'], ctx)
            if not ok:
                continue
            severity = rule['severity']
            triggered.append(dict(
                id=rule['id'], name=rule['name'], severity=severity,
                weight=self.policy['critical']['score'] if severity == 'critical' else rule['weight'],
                level_floor=self.policy[severity]['level_floor'],
                specialty=rule.get('specialty'), equipment=list(rule.get('equipment', [])),
                rationale=rule['rationale'], evidence=_dedupe(evidence)))
        triggered.sort(key=lambda r: (-SEVERITY_ORDER[r['severity']], -r['weight']))

        critical = any(r['severity'] == 'critical' for r in triggered)
        remaining = 1.0
        for r in triggered:
            remaining *= 1 - r['weight']
        s_rule = 1.0 if critical else round(1 - remaining, 4)
        floor = max((r['level_floor'] for r in triggered), key=lambda lvl: LEVEL_ORDER[lvl], default=None)

        # Routing hints come from the most severe group only, so matching is not over-restricted.
        top = [r for r in triggered if triggered and r['severity'] == triggered[0]['severity']]
        specialty = next((r['specialty'] for r in top if r['specialty']), None)
        equipment = sorted({e for r in top for e in r['equipment']})

        return dict(
            rule_version=self.version, s_rule=s_rule, critical=critical, level_floor=floor,
            triggered_rules=triggered, suggested_specialty=specialty, required_equipment=equipment,
            clinical_screens_version=screens.get('rule_version'),
            missing_information=screens.get('missing_information', []),
            no_trigger_does_not_establish_safety=True, validation_status=self.validation_status)


def _fact_matches(fact, spec):
    if fact.get('kind') != spec['kind']:
        return False
    if fact.get('status') != spec.get('status', 'confirmed') or fact.get('temporality') != spec.get('temporality', 'current'):
        return False
    names = spec.get('name')
    if names and fact.get('name') not in names and not set(fact.get('concept_aliases') or []) & set(names):
        return False
    if 'severity' in spec and (fact.get('severity') or {}).get('value') not in spec['severity']:
        return False
    if 'onset' in spec and (fact.get('onset') or {}).get('value') not in spec['onset']:
        return False
    return True


def _latest(facts, kind, name):
    return next((f for f in reversed(facts) if f.get('kind') == kind and f.get('name') == name
                 and f.get('status') == 'confirmed' and f.get('temporality') == 'current'), None)


def _compare(value, spec):
    if not isinstance(value, (int, float)):
        return False
    checks = {'lt': value < spec.get('lt', float('inf')), 'lte': value <= spec.get('lte', float('inf')),
              'gt': value > spec.get('gt', float('-inf')), 'gte': value >= spec.get('gte', float('-inf'))}
    return all(checks[k] for k in checks if k in spec)


def _fact_evidence(fact):
    span = next(iter(fact.get('evidence') or []), {})
    return dict(source='fact', fact=f"{fact['kind']}.{fact['name']}", value=fact.get('value'),
                text=span.get('text'), turn_id=span.get('turn_id'))


def _dedupe(evidence):
    seen, out = set(), []
    for e in evidence:
        key = (e.get('source'), e.get('text'), e.get('turn_id'), e.get('fact') or e.get('screen') or e.get('lexicon'))
        if key not in seen:
            seen.add(key)
            out.append(e)
    return out


@lru_cache(maxsize=1)
def default_engine():
    return RuleEngine()


def evaluate(patient_state, screens=None, exclude=()):
    return default_engine().evaluate(patient_state, screens, exclude)
