"""Synthetic software contracts, not clinical validation."""
import copy
import json
import unittest
from triage_pipeline import process_turn, load_state_model, predict_from_state, extract_info, to_features

class Integration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bundle = load_state_model()
    def turn(self, state, text, qid=None):
        return process_turn(state, text, qid, ml_bundle=self.bundle)
    def test_languages_and_scores(self):
        for text in ['I have chest pain', '3andi wja3 fi sadri', 'صدري يوجعني', '3andi douleur fi sadri']:
            with self.subTest(text=text):
                r = self.turn(None,text)
                self.assertEqual(r['ml']['status'],'ok')
                self.assertAlmostEqual(r['ml']['emergency_score']+r['ml']['non_emergency_score'],1)
                self.assertFalse(r['ml']['clinically_calibrated'])
                self.assertEqual(r['ml']['threshold'],.15)
                self.assertEqual(r['next_question']['field'],'symptom.breath')
                json.dumps(r,allow_nan=False)
    def test_linked_turn_and_interruption(self):
        r = self.turn(None,'3andi wja3 fi sadri')
        r = self.turn(r['patient_state'],'Ey, barcha',r['next_question']['id'])
        self.assertTrue(r['questioning_interrupted'])
        self.assertIsNone(r['next_question'])
        self.assertIn('chest_dyspnea',[x['rule_id'] for x in r['rules']['triggered_rules']])
    def test_critical_survives_ml_failure(self):
        bad=copy.copy(self.bundle);bad['feature_schema']='invalid'
        r=process_turn(None,'ma najamch netnaffes',ml_bundle=bad)
        self.assertEqual(r['ml']['status'],'unavailable')
        self.assertTrue(r['questioning_interrupted'])
    def test_unknown_abstains(self):
        for text in ['3andi 7aja ghriba','hello','age 30','Maybe I have chest pain']:
            r=self.turn(None,text)
            self.assertEqual(r['ml']['status'],'insufficient_input')
            self.assertIsNone(r['ml']['prediction'])
            self.assertIsNone(r['ml']['emergency_score'])
    def test_patient_isolation(self):
        a=self.turn(None,'I have chest pain');b=self.turn(None,'I have chest pain')
        with self.assertRaises(ValueError):self.turn(b['patient_state'],'Yes',a['next_question']['id'])
        before=copy.deepcopy(a['patient_state'])
        self.turn(a['patient_state'],'No',a['next_question']['id'])
        self.assertEqual(before,a['patient_state'])
    def test_rule_features_excluded(self):
        s=self.turn(None,'I have a headache')['patient_state']
        a=predict_from_state(s,self.bundle)
        s['rule_engine']={'critical_flags_detected':True}
        s['urgency']=1;s['doctor_answer']='stroke'
        self.assertEqual(a['model_score_emergency'],predict_from_state(s,self.bundle)['model_score_emergency'])
    def test_projection_pinned(self):
        from pathlib import Path
        rows=json.loads((Path(__file__).parent/'english_feature_reference.json').read_text())
        for row in rows:self.assertEqual(to_features(extract_info(row['text'])),row['features'])

if __name__=='__main__':unittest.main()
