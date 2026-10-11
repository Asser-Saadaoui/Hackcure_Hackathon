"""Synthetic contracts for fusion, the decision policy and one triage turn, not clinical validation."""
import json
import unittest

import fusion
from decision import decide
from interviewer import Interviewer
from sahhanito import triage_turn


def rules(s_rule=0.0, critical=False, floor=None, triggered=None, specialty=None, equipment=None):
    return dict(s_rule=s_rule, critical=critical, level_floor=floor, triggered_rules=triggered or [],
                suggested_specialty=specialty, required_equipment=equipment or [])


def ml(score=None, status='ok'):
    return dict(status=status, emergency_score=score, threshold=0.15)


RULE = dict(id='R-X', name='x', severity='high', weight=0.7, rationale=dict(fr='fr', en='en', ar='ar', darija='darija'))


class FakeLLM(Interviewer):
    """Returns a fixed reply, so tests never call the network."""
    def __init__(self, reply):
        super().__init__(api_key='test', enabled=True)
        self.reply = reply
    def _call_llm(self, *args):
        return self.reply


class FusionTests(unittest.TestCase):
    def test_contributions_explain_p_final(self):
        a = fusion.fuse(ml(0.9), rules(0.7, triggered=[RULE]))
        z = sum(a['contributions'].values())
        self.assertAlmostEqual(a['p_final'], round(fusion.sigmoid(z), 4), places=3)
        self.assertGreater(a['contributions']['nlp'], 0)
        self.assertGreater(a['contributions']['rules'], 0)

    def test_score_at_fit_prevalence_is_neutral(self):
        self.assertAlmostEqual(fusion.fuse(ml(fusion.PREVALENCE), rules())['contributions']['nlp'], 0, places=3)

    def test_fitted_formula_and_threshold_independence(self):
        for score in (0, .01, .15, .5, .99, 1):
            a = fusion.fuse(ml(score), rules(.4))
            expected = fusion.sigmoid(fusion.B0 + fusion.W_NLP * fusion.logit(score) + fusion.W_RULES * .4)
            self.assertAlmostEqual(a['p_final'], round(expected, 4))
            altered = dict(ml(score), threshold=.48)
            self.assertEqual(a['p_final'], fusion.fuse(altered, rules(.4))['p_final'])
            self.assertFalse(a['clinically_calibrated'])

    def test_missing_nlp_keeps_centered_omission_policy(self):
        a = fusion.fuse(ml(status='unavailable'), rules())
        self.assertIsNone(a['p_nlp'])
        self.assertEqual(a['contributions']['nlp'], 0)
        self.assertEqual(a['uncertainty'], 'HIGH')

    def test_monotonic(self):
        low, high = fusion.fuse(ml(0.1), rules()), fusion.fuse(ml(0.6), rules())
        self.assertLess(low['p_final'], high['p_final'])
        self.assertLess(fusion.fuse(ml(0.1), rules(0.3, triggered=[RULE]))['p_final'],
                        fusion.fuse(ml(0.1), rules(0.7, triggered=[RULE]))['p_final'])

    def test_missing_nlp_raises_uncertainty(self):
        self.assertEqual(fusion.fuse(ml(status='insufficient_input'), rules())['uncertainty'], 'HIGH')
        self.assertEqual(fusion.fuse(ml(status='unavailable'), rules(0.7, triggered=[RULE]))['uncertainty'], 'MEDIUM')
        self.assertEqual(fusion.fuse(ml(status='unavailable'), rules(1.0, critical=True, triggered=[RULE]))['uncertainty'], 'LOW')

    def test_disagreement_is_flagged(self):
        a = fusion.fuse(ml(0.95), rules())
        self.assertEqual(a['uncertainty'], 'MEDIUM')
        self.assertIn('NLP model sees an emergency that no rule explains', a['uncertainty_reasons'])


class DecisionTests(unittest.TestCase):
    def test_critical_rule_always_wins(self):
        r = rules(1.0, critical=True, floor='EMERGENCY', triggered=[dict(RULE, severity='critical')], specialty='PSY')
        for score, status in [(0.001, 'ok'), (None, 'unavailable'), (None, 'insufficient_input')]:
            d = decide(fusion.fuse(ml(score, status), r), r)
            self.assertEqual(d['level'], 'EMERGENCY')
            self.assertIn('CALL_EMERGENCY', d['actions'])
            self.assertEqual(d['suggested_specialty'], 'PSY')

    def test_floor_is_escalate_only(self):
        r = rules(0.7, floor='HIGH', triggered=[RULE], specialty='PEDIA')
        d = decide(fusion.fuse(ml(0.01), r), r)
        self.assertEqual((d['level'], d['basis']), ('HIGH', 'rule_floor'))

    def test_bands(self):
        self.assertEqual(decide(fusion.fuse(ml(0.01), rules()), rules())['level'], 'LOW')
        self.assertEqual(decide(fusion.fuse(ml(0.6), rules()), rules())['level'], 'HIGH')
        self.assertEqual(decide(fusion.fuse(ml(0.99), rules()), rules())['level'], 'EMERGENCY')

    def test_not_enough_information_goes_to_clinician(self):
        d = decide(fusion.fuse(ml(status='insufficient_input'), rules()), rules())
        self.assertEqual(d['level'], 'UNCERTAIN')
        self.assertEqual(d['actions'], ['CLINICIAN_REVIEW'])

    def test_low_has_no_routing(self):
        d = decide(fusion.fuse(ml(0.01), rules()), rules(), 'darija')
        self.assertEqual((d['suggested_specialty'], d['required_equipment']), (None, []))
        self.assertTrue(d['rationale_localized'])


class TurnTests(unittest.TestCase):
    def conversation(self, language, *messages, llm=None):
        result, state, qid = None, None, None
        for text in messages:
            result = triage_turn(state, text, qid, language=language, interviewer=llm or Interviewer(enabled=False))
            state, qid = result['state'], (result['reply'] or {}).get('question_id')
        return result

    def test_emergency_stops_questions(self):
        r = self.conversation('darija', '3andi wja3 fi sadri w ma najamch netnaffes')
        self.assertEqual((r['status'], r['decision']['level']), ('emergency', 'EMERGENCY'))
        self.assertNotIn('question_id', r['reply'])
        self.assertNotIn('pending_question', r['state'])
        json.dumps(r, ensure_ascii=False, allow_nan=False)

    def test_french_interview_reaches_a_result(self):
        r = self.conversation('fr', "j'ai de la fièvre et mal à la tête", 'Non', 'Je ne sais pas', 'Non', 'Non', 'Je ne sais pas')
        self.assertEqual(r['status'], 'result')
        self.assertEqual(r['decision']['level'], 'LOW')

    def test_questions_use_patient_language(self):
        r = self.conversation('fr', "j'ai de la fièvre et mal à la tête")
        self.assertEqual(r['status'], 'question')
        self.assertEqual(r['reply']['quick_replies'], ['Oui', 'Non', 'Je ne sais pas'])
        r = self.conversation('darija', 'عندي سخانة و راسي يوجعني')
        self.assertEqual(r['reply']['quick_replies'], ['إي', 'لا', 'مانعرفش'])

    def test_unclear_complaint_collects_intake_then_review(self):
        r = self.conversation('fr', 'je me sens bizarre', 'je sais pas')
        self.assertEqual(r['status'], 'question')
        self.assertTrue(r['reply']['question_id'].startswith('intake:'))
        r = self.conversation('fr', 'je me sens bizarre', 'je sais pas', 'Quelques heures', '4–6 (moyenne)', 'Aucun', '18 à 64 ans', 'Aucun')
        self.assertEqual((r['status'], r['decision']['level']), ('under_review', 'UNCERTAIN'))
        self.assertEqual(r['intake']['intake.onset'], 'Quelques heures')
        self.assertEqual(len(r['intake']), 5)

    def test_stale_question_id_is_tolerated(self):
        r = triage_turn(None, "j'ai de la fièvre", 'someone-else:0:symptom.breath', language='fr', interviewer=Interviewer(enabled=False))
        self.assertIn(r['status'], ('question', 'result', 'under_review'))

    def test_monitor_mode_never_asks(self):
        r = triage_turn(None, "j'ai de la fièvre et mal à la tête", language='fr', mode='monitor')
        self.assertEqual(r['status'], 'monitor')
        self.assertIsNone(r['reply'])

    def test_llm_phrases_but_does_not_decide(self):
        llm = FakeLLM({'question': 'Je suis désolé. Avez-vous du mal à parler ?', 'collected': {'age': 30, 'symptoms': ['fièvre']}})
        r = self.conversation('fr', "j'ai de la fièvre et mal à la tête", llm=llm)
        base = self.conversation('fr', "j'ai de la fièvre et mal à la tête")
        self.assertEqual(r['reply']['source'], 'llm')
        self.assertEqual(r['llm_notes'], {'age': 30, 'symptoms': ['fièvre']})
        self.assertEqual(r['decision'], base['decision'])
        self.assertEqual(r['assessment'], base['assessment'])

    def test_unsafe_llm_output_is_replaced_by_template(self):
        for bad in ['Ce n’est pas grave, reposez-vous ?', 'Prenez du paracétamol ?', 'Vous avez la fièvre.']:
            r = self.conversation('fr', "j'ai de la fièvre et mal à la tête", llm=FakeLLM({'question': bad}))
            self.assertEqual(r['reply']['source'], 'template', bad)

    def test_llm_failure_falls_back(self):
        class Broken(Interviewer):
            def _call_llm(self, *args):
                raise TimeoutError
        r = self.conversation('fr', "j'ai de la fièvre et mal à la tête", llm=Broken(api_key='x', enabled=True))
        self.assertEqual(r['reply']['source'], 'template')


if __name__ == '__main__':
    unittest.main()
