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
        r=process_turn(None,'ma najamch netnaffes',ml_bundle=bad,defer_ml_on_critical=False)
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



from clinical_state import new_patient_state,update_patient_state
def fact(state,name,kind='symptom',actor=None):
    return next(f for f in state['facts'] if f['name']==name and f['kind']==kind and (actor is None or f['experiencer']==actor))

class HybridContracts(unittest.TestCase):
    def test_word_number_and_original_evidence(self):
        text="I've had chest pain for twenty-one minutes"
        f=fact(extract_info(text),'chest')
        self.assertEqual(f['duration']['seconds'],1260)
        self.assertEqual(f['duration']['text'],'twenty-one minutes')
        self.assertEqual(text[f['duration']['start']:f['duration']['end']],f['duration']['text'])

    def test_ambiguous_belly_is_not_pain(self):
        r=process_turn(None,'3andi 7aja ghriba fi batni')
        self.assertFalse(any(f['name']=='abdominal_pain' for f in r['extracted_facts']))
        self.assertEqual(r['ml']['status'],'insufficient_input')
        self.assertIsNotNone(r['next_question'])

    def test_palpitations_phrase(self):
        self.assertEqual(fact(extract_info('9albi yodhrob bel zerba'),'palpitations')['status'],'confirmed')

    def test_uncertain_presence_first(self):
        r=process_turn(None,'Maybe I have chest pain')
        self.assertEqual(r['next_question']['field'],'symptom.chest')
        self.assertEqual(r['ml']['status'],'insufficient_input')

    def test_unknown_new_complaint_does_not_reuse_old_scores(self):
        a=process_turn(None,'I have diabetes')
        b=process_turn(a['patient_state'],'3andi 7aja ghriba fi batni')
        self.assertEqual(b['ml']['status'],'insufficient_input')
        self.assertIsNone(b['ml']['prediction'])

    def test_known_condition_does_not_mask_ambiguous_current_complaint(self):
        r=process_turn(None,'3andi sokkor ama taw 3andi 7aja ghriba fi batni')
        self.assertEqual(r['ml']['status'],'insufficient_input')
        self.assertIsNone(r['ml']['prediction'])
        self.assertIsNotNone(r['next_question'])
        self.assertEqual(fact(r['patient_state'],'diabetes','condition')['status'],'confirmed')

    def test_old_routine_context_does_not_mask_new_unknown_input(self):
        a=process_turn(None,'I have diabetes and need a routine prescription refill')
        b=process_turn(a['patient_state'],'xyz unfamiliar complaint')
        self.assertEqual(b['ml']['status'],'insufficient_input')
        self.assertIsNone(b['ml']['emergency_score'])

    def test_critical_does_not_call_either_model(self):
        from unittest.mock import patch
        class FailingSemantic:
            def propose(self,text):raise AssertionError('Transformer called on known critical case')
        with patch('triage_pipeline._cached_state_model',side_effect=AssertionError('ML loaded before critical return')):
            r=process_turn(None,'ma najamch netnaffes',semantic=FailingSemantic())
        self.assertTrue(r['rules']['critical_flags_detected'])
        self.assertEqual(r['semantic_status'],'skipped_critical_fast_path')
        self.assertEqual(r['ml']['status'],'deferred_critical_fast_path')
        self.assertIsNone(r['next_question'])
        json.dumps(r,allow_nan=False)

    def test_semantic_candidate_requires_linked_confirmation(self):
        class Proposal:
            metadata={};last_metadata={}
            def propose(self,text):
                return [dict(kind='symptom',name='chest',start=0,end=len(text),text=text,score=.9)]
        a=process_turn(None,'A pressure sensation here',semantic=Proposal())
        self.assertEqual(fact(a['patient_state'],'chest')['status'],'uncertain')
        self.assertEqual(a['ml']['status'],'insufficient_input')
        self.assertEqual(a['next_question']['field'],'symptom.chest')
        b=process_turn(a['patient_state'],'Yes',a['next_question']['id'])
        self.assertEqual(fact(b['patient_state'],'chest')['status'],'confirmed')
        self.assertNotIn('semantic_candidate',fact(b['patient_state'],'chest'))
        self.assertEqual(b['ml']['status'],'ok')

    def test_literal_owner_wins_conflicting_semantic_span(self):
        from multilingual_nlp import merge_semantic
        class Proposal:
            metadata={};last_metadata={}
            def propose(self,text):return [dict(kind='symptom',name='abdominal_pain',start=7,end=17,text=text[7:17],score=.95)]
        text='I have chest pain'
        result=merge_semantic(extract_info(text),text,Proposal())
        self.assertFalse(any(f['name']=='abdominal_pain' for f in result['facts']))
        self.assertTrue(result['semantic_metadata']['rejected'][0]['conflicting'])

    def test_semantic_candidates_do_not_change_existing_ml_scores(self):
        from clinical_state import add_semantic_candidates
        class Proposal:
            metadata={};last_metadata={}
            def propose(self,text):return [dict(kind='symptom',name='rash',start=0,end=len(text),text=text,score=.8)]
        s=update_patient_state(None,'I have dizziness')
        bundle=load_state_model();before=predict_from_state(s,bundle)
        after=add_semantic_candidates(s,'I have dizziness',Proposal())
        self.assertEqual(before['model_score_emergency'],predict_from_state(after,bundle)['model_score_emergency'])

if __name__=='__main__':unittest.main()
