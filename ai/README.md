# HackCure AI integration prototype

Python 3.12, CPU inference. From this directory:

```sh
python -m venv .venv
# Activate .venv using your operating system's usual command.
python -m pip install -r requirements.txt
python -m unittest -q test_integration
python example.py
```

The repository had no backend/frontend or AI interface when inspected. This handoff therefore provides a Python interface; no additional HTTP service is required. Run from `ai/`, or configure that directory on the backend's Python module path. Its module names must remain available when loading the joblib pickle. Do not load pickle artifacts from untrusted sources.

```python
from triage_pipeline import process_turn
result = process_turn(None, "3andi wja3 fi sadri")
saved_state = result["patient_state"]  # Store separately for each patient session.
question = result["next_question"]
result = process_turn(saved_state, "Ey, barcha", question["id"])
```

`process_turn(patient_state, patient_message, previous_question_id=None)` also accepts keyword-only `model_version='experimental_v3'`, `ml_bundle=None`, and `language=None`. Language can be `en`, `tn_arabizi`, or `tn_arabic`. The input state is copied; use the returned state for the next request. Pass the pending question ID when answering it. Foreign/stale IDs raise `ValueError`; invalid input is rejected. No session storage or authentication is implemented here.

Exact top-level response fields:

| Field | Contract |
|---|---|
| `patient_state` | JSON object: schema_version, patient_id, patient_experiencer, revision, facts, observations, history, turns, unresolved_answers; pending_question/asked_questions when applicable. Preserve the whole object. |
| `extracted_facts` | Array of facts updated by this turn, with kind/name/status/temporality/experiencer, evidence spans, heuristic confidence and provenance. |
| `ml` | On `status='ok'`: binary emergency_label 0/1, prediction `non_emergency`/`emergency`, emergency_score, non_emergency_score, raw_score_emergency/non_emergency, threshold 0.15, model_version `experimental_v3`, clinically_calibrated false, calibration_metadata and compatibility metadata. Scores are numbers in [0,1]. Legacy model_score aliases are retained. On `insufficient_input`: prediction, label and scores are null, with reason. On `unavailable`: reason and clinically_calibrated false; prediction/score fields are absent. |
| `rules` | rule_version, critical_flags_detected, triggered_rules, rule_results, missing_information, no_trigger_does_not_establish_safety, validation_status, emergency_guidance. Each finding has rule_id, status (`triggered`/`not_triggered`/`insufficient_information`), priority, evidence, supporting_facts, source and justification. |
| `relevant_missing_information` | Array of relevant question fields. |
| `next_question` | Null or object: id, field (nullable for free clarification), text, language, answer_options, patient_experiencer, priority, source, template_version, validation_status. |
| `questioning_interrupted` | Boolean; true when a critical rule stops routine questioning. |
| `final_decision_policy_implemented` | Always false. ML and rules remain independent. |

Missing is different from negative; uncertain-only/unrecognized complaints do not get a silent negative prediction. Critical rules execute before ML. ML failure cannot remove their findings. There is no final triage fusion or clinical deployment.

The single artifact `candidate_model.joblib` is 15,263,160 bytes (15.3 MB), below GitHub's regular-file size warning/limit. It is included once in ordinary Git; no large transformer weights, data, caches or notebooks are included. SHA-256: `fee288298d6fafe63d053cc8fa4047442bb7949abb77022058067a27375eec5e`. Hashes and projection guards are in `compatibility.json`. `triage_tuning.py` preserves the original serialized class names and inference behavior, with search/training omitted. The ensemble is CatBoost + HistGradientBoosting + ExtraTrees; existing sigmoid mapping and threshold are retained without retraining/promotion.

Limits: finite Tunisian vocabulary, unreviewed language templates and extraction-confidence heuristics; no native-speaker/clinician validation. Current English selection-validation weak-label macro F1 0.9108 (FP 132/FN 26); original local benchmark 0.9494. The context-feature regression is unresolved. The original benchmark and deployed model stay preserved locally; they are not required for this explicit experimental interface. Scores are not validated medical probabilities, and absence of rule flags does not establish safety.
