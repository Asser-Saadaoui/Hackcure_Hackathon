"""Synthetic contracts for the Sahhanito rule engine, not clinical validation."""
import json
import unittest

from rule_engine import RuleEngine, evaluate
from triage_pipeline import process_turn

HOSPITAL_CODES = {'EMERG', 'CARDIO', 'NEURO', 'PEDIA', 'TRAUMA', 'BURNS', 'OPHTA', 'OBGYN', 'PNEUMO', 'PSY',
                  'ONCO', 'SURG', 'NEUROSURG', 'INTMED'}
EQUIPMENT_CODES = {'CT', 'MRI', 'CATH_LAB', 'ICU', 'NICU', 'DIALYSIS'}


def run(*messages):
    result = None
    for text in messages:
        qid = result['next_question']['id'] if result and result['next_question'] else None
        result = process_turn(result['patient_state'] if result else None, text, qid)
    return evaluate(result['patient_state'], result['rules'])


def ids(result):
    return {r['id'] for r in result['triggered_rules']}


class RuleEngineTests(unittest.TestCase):
    def test_config_is_consistent(self):
        engine = RuleEngine()
        self.assertEqual(len({r['id'] for r in engine.rules}), len(engine.rules))
        for rule in engine.rules:
            self.assertIn(rule['specialty'], HOSPITAL_CODES | {None}, rule['id'])
            self.assertTrue(set(rule['equipment']) <= EQUIPMENT_CODES, rule['id'])
            self.assertEqual(set(rule['rationale']), {'fr', 'en', 'ar', 'darija'}, rule['id'])

    def test_critical_red_flags_in_every_language(self):
        cases = {
            '3andi wja3 fi sadri w ma najamch netnaffes': 'R-CARD-01',
            'douleur thoracique et je n arrive pas a respirer': 'R-CARD-01',
            'عندي وجع في صدري و ما نجمش نتنفس': 'R-CARD-01',
            'mon père est inconscient': 'R-NEURO-02',
            'bouya mghchi 3lih': 'R-NEURO-02',
            'وجهو مايل و كلامو متخلط': 'R-NEURO-01',
            'omi ma t9derch tahki, wejha mayel': 'R-NEURO-01',
            'bouya ma ynajemch ye7ki': 'R-NEURO-01',
            'sadri yoja3ni w nefsi ma9tou3': 'R-CARD-01',
            'je veux mourir': 'R-PSY-01',
            'n7eb nmout': 'R-PSY-01',
            'ابني شرب جافال': 'R-TOX-01',
            'accident de voiture, il saigne beaucoup': 'R-BLEED-01',
            'elle est enceinte et elle saigne': 'R-OBST-01',
            '7al9i manfou5 w ma najamch netnaffes': 'R-ALLERGY-01',
            'il fait des convulsions': 'R-NEURO-03',
        }
        for text, rule_id in cases.items():
            with self.subTest(text=text):
                r = run(text)
                self.assertIn(rule_id, ids(r))
                self.assertTrue(r['critical'])
                self.assertEqual(r['s_rule'], 1.0)
                self.assertEqual(r['level_floor'], 'EMERGENCY')

    def test_high_rules_set_a_floor_without_critical(self):
        r = run('douleur thoracique depuis 20 minutes')
        self.assertEqual(ids(r), {'R-CARD-02'})
        self.assertFalse(r['critical'])
        self.assertEqual(r['level_floor'], 'HIGH')
        self.assertAlmostEqual(r['s_rule'], 0.7)
        self.assertEqual((r['suggested_specialty'], r['required_equipment']), ('CARDIO', ['CATH_LAB']))

    def test_noisy_or_combines_weights(self):
        r = run('bébé de 3 mois, il a de la fièvre, douleur insupportable')
        weights = [x['weight'] for x in r['triggered_rules']]
        expected = 1.0
        for w in weights:
            expected *= 1 - w
        self.assertGreater(len(weights), 1)
        self.assertAlmostEqual(r['s_rule'], round(1 - expected, 4))

    def test_negation_and_context_do_not_trigger(self):
        for text in ["j'ai pas de douleur thoracique, juste un rhume",
                     'ma 3andich s5ana, rasi yoja3ni chwaya',
                     'ken nwalli ma najamch netnaffes chnowa na3mel',
                     'I had a seizure last year, today just a cough',
                     'I got a flu shot yesterday and have a mild fever',
                     'ما عنديش وجع في صدري']:
            with self.subTest(text=text):
                r = run(text)
                self.assertFalse(r['critical'])
                self.assertNotIn('R-CARD-02', ids(r))

    def test_answer_to_linked_question(self):
        r = run('3andi wja3 fi sadri', 'Ey, barcha')
        self.assertIn('R-CARD-01', ids(r))
        self.assertTrue(r['critical'])

    def test_low_risk_message_scores_zero(self):
        r = run('عندي سخانة و راسي يوجعني')
        self.assertEqual(r['s_rule'], 0.0)
        self.assertIsNone(r['level_floor'])
        self.assertTrue(r['no_trigger_does_not_establish_safety'])

    def test_vital_and_age_rules(self):
        r = run('I am 70 years old with chest pain, my heart rate is 160')
        self.assertTrue({'R-VITAL-01', 'R-CARD-02', 'R-AGE-01'} <= ids(r))

    def test_evidence_points_at_patient_words(self):
        r = run('aujourd hui je veux mourir')
        evidence = r['triggered_rules'][0]['evidence'][0]
        self.assertEqual(evidence['source'], 'text')
        self.assertEqual(evidence['text'], 'veux mourir')
        json.dumps(r, ensure_ascii=False, allow_nan=False)


if __name__ == '__main__':
    unittest.main()
