"""Persist result['patient_state'] per session; send pending question ID with its answer."""
import json
import sys
from triage_pipeline import process_turn,predict_from_state,load_state_model

if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    first = process_turn(None, '3andi wja3 fi sadri men 20 d9aye9')
    question = first['next_question']
    second = process_turn(first['patient_state'], 'Ey, barcha', question['id'])
    # Known critical flags arrive first; compute independent ML after surfacing them.
    second['independent_ml_after_critical']=predict_from_state(second['patient_state'],load_state_model())
    print(json.dumps(second, ensure_ascii=False, indent=2, allow_nan=False))
