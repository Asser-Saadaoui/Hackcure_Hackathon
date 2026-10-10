"""Persist result['patient_state'] per session; send pending question ID with its answer."""
import json
from triage_pipeline import process_turn

if __name__ == '__main__':
    first = process_turn(None, '3andi wja3 fi sadri men 20 d9aye9')
    question = first['next_question']
    second = process_turn(first['patient_state'], 'Ey, barcha', question['id'])
    print(json.dumps(second, ensure_ascii=False, indent=2, allow_nan=False))
