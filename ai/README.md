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

`process_turn(patient_state, patient_message, previous_question_id=None)` also accepts keyword-only `model_version='experimental_v3'`, `ml_bundle=None`, `language=None`, `semantic=None`, and `defer_ml_on_critical=True`. Language can be `en`, `tn_arabizi`, or `tn_arabic`. The input state is copied; use the returned state for the next request. Pass the pending question ID when answering it. Foreign/stale IDs raise `ValueError`; invalid input is rejected. No session storage or authentication is implemented here.

Exact top-level response fields:

| Field | Contract |
|---|---|
| `patient_state` | JSON object: schema_version, patient_id, patient_experiencer, revision, facts, observations, history, turns, unresolved_answers; pending_question/asked_questions when applicable. Preserve the whole object. |
| `extracted_facts` | Array of facts updated by this turn, with kind/name/status/temporality/experiencer, evidence spans, heuristic confidence and provenance. |
| `ml` | On `status='ok'`: binary emergency_label 0/1, prediction `non_emergency`/`emergency`, emergency_score, non_emergency_score, raw_score_emergency/non_emergency, threshold 0.15, model_version `experimental_v3`, clinically_calibrated false, calibration_metadata and compatibility metadata. Scores are numbers in [0,1]. Legacy model_score aliases are retained. On `insufficient_input`: prediction, label and scores are null, with reason. On `deferred_critical_fast_path`: scores/label/prediction are null because critical flags are returned before ML loading. Call `predict_from_state(result['patient_state'], load_state_model())` after surfacing the flags. On `unavailable`: reason and clinically_calibrated false; prediction/score fields are absent. |
| `rules` | rule_version, critical_flags_detected, triggered_rules, rule_results, missing_information, no_trigger_does_not_establish_safety, validation_status, emergency_guidance. Each finding has rule_id, status (`triggered`/`not_triggered`/`insufficient_information`), priority, evidence, supporting_facts, source and justification. |
| `relevant_missing_information` | Array of relevant question fields. |
| `next_question` | Null or object: id, field (nullable for free clarification), text, templates, language, answer_options, allow_free_text, patient_experiencer, priority, reason, source_guidance, template_version, validation_status, question_priority_is_clinically_validated. |
| `questioning_interrupted` | Boolean; true when a critical rule stops routine questioning. |
| `semantic_status` | not_requested / completed / skipped_critical_fast_path / unavailable with reason. Optional model metadata is saved on the current state turn. |
| `final_decision_policy_implemented` | Always false. ML and rules remain independent. |

Missing is different from negative; uncertain-only/unrecognized complaints do not get a silent negative prediction. Known critical rules return before transformer or ML inference by default. `defer_ml_on_critical=False` explicitly requests synchronous scoring. Unfamiliar new complaints abstain even when previous turns contain recognized conditions or routine context. A known condition in the same message cannot mask an explicitly ambiguous new complaint. Uncertain symptoms are clarified before their attributes. ML failure cannot remove their findings. There is no final triage fusion or clinical deployment.

The single artifact `candidate_model.joblib` is 15,263,160 bytes (15.3 MB), below GitHub's regular-file size warning/limit. It is included once in ordinary Git; no large transformer weights, data, caches or notebooks are included. SHA-256: `fee288298d6fafe63d053cc8fa4047442bb7949abb77022058067a27375eec5e`. Hashes and projection guards are in `compatibility.json`. `triage_tuning.py` preserves the original serialized class names and inference behavior, with search/training omitted. The ensemble is CatBoost + HistGradientBoosting + ExtraTrees; existing sigmoid mapping and threshold are retained without retraining/promotion.

Limits: finite Tunisian vocabulary, unreviewed language templates and extraction-confidence heuristics; no native-speaker/clinician validation. Previously measured English selection-validation weak-label macro F1 0.9113 (FP 131/FN 26); original local benchmark 0.9494. The context-feature regression is unresolved. The original benchmark and deployed model stay preserved locally; they are not required for this explicit experimental interface. Scores are not validated medical probabilities, and absence of rule flags does not establish safety.

Optional semantic research (disabled by default):

```sh
python -m pip install -r requirements-semantic.txt
python multilingual_nlp.py --download-semantic
```

```python
from multilingual_nlp import SemanticExtractor
from pathlib import Path
semantic = SemanticExtractor.from_cache(Path(__file__).parent / "semantic_cache")
# Load once at application startup, then reuse. Keep it outside Git.
result = process_turn(None, "patient complaint", semantic=semantic)
```

Pinned multilingual GLiNER uses a non-generative FP32 ONNX span model. The 1.157 GB artifact is downloaded explicitly from Hugging Face, with immutable revision and SHA-256 checks. No network/download occurs in process_turn. Tested quantized weights missed basic clinical phrases; FP32 works but did not improve complete facts on the reference challenge. The default dictionaries remain the strongest tested configuration. Default dictionary context errors still affected 3/29 returned challenge facts (10.3%); zero unmatched entity spans is not zero clinical errors. Optional model-only additions stay uncertain, cannot overwrite literal facts, and are excluded from ML features until a linked patient answer confirms them. Rules never receive ML scores. Raw and sigmoid-mapped ML scores remain separate and are not medical probabilities.

Run `python example.py` for an actual two-turn Tunisian trace, immediate rules, and separately obtained ML scores. `evaluation_summary.json` records comparable full-fact results: 24 synthetic challenge messages/31 entities, entity F1 0.933, complete-fact F1 0.867. Before this targeted patch, confirmed critical-symptom recall was only 1/3: two unfamiliar breathing descriptions were missed. Those exact phrases now pass regression checks; this does not establish generalization. No native/clinical validation is claimed. ArSyra medical dialect data is gated and not clinical span/context gold; the reviewed TunBERT, XLM-R and Arabic medical encoders do not provide the required clinical head. No justified fine-tuning corpus was found. These are concrete remaining blockers to reliable general Tunisian clinical extraction.

Phase 1 is preserved in PR #1 / commit 45933cb. GitHub now shows PR #1 merged into main (merge 7e3cfbb). Phase 2 is proposed separately against main; it is not merged or deployed by this task. Local research notebooks/data/caches and original benchmark artifacts are excluded from this team runtime.

## Targeted integration finalization

`process_turn()` and model artifacts remain unchanged in contract: no retraining,
retuning, rule changes or threshold changes. 104 root language/state tests and
29 portable integration tests pass. Complete seven-turn English, Arabizi and
Arabic-script Darija conversations verify negative free-text answers, spoken/numeric
duration, gradual onset, severity, age and a new breathing complaint that replaces
the old denial and interrupts questions. These are synthetic software checks.

Specific breathing phrases now include `nefsi 9sir`, `nfasi ma9tou3`,
`netnaffes bes3ouba`, `el nefes ma ykafich`, `نتنفس بالصعيب`,
`نفسي ناقص`, and the previously missed English air/catching-breath phrases.
`netnaffes 3adi` / `نتنفس عادي` / "I can breathe normally" explicitly negate
breathing difficulty. A linked "only when I walk" / `ki nemchi` stays episodic.
Ambiguous `makhnou9` alone is clarified rather than asserted as respiratory distress.

Uninterpreted linked replies return `insufficient_input` and retry the same field
with a fresh question ID. Explicit unresolved additional complaints preserve spans
in `patient_state.turns[-1].unresolved_complaint_spans` and pause ML; understood facts
remain available to the independent rules. Known critical findings still return
immediately and interrupt questioning. Store the complete returned state and always
send the current pending question ID with its answer.

Vocabulary and uncertainty scopes remain finite; not all unrecognized clauses can
be detected. Existing ML context-feature regression is unresolved. Historical F1
and challenge metrics above were not recomputed for this patch; no clinical
validation or new generalization score is claimed. Model features/schema, original
benchmark preprocessing, continuous scores and calibration metadata are preserved.

## Rule engine (`rule_engine/`, Sahhanito)

Decision strategy: **NLP model + rule engine → fusion score → decision**. The LLM only chats with the patient and collects information; it never decides the level. This section covers the rule engine (step 1); fusion and the decision policy come next.

```python
from triage_pipeline import process_turn
from rule_engine import evaluate
r = process_turn(None, "3andi wja3 fi sadri w ma najamch netnaffes")
rules = evaluate(r["patient_state"], r["rules"])   # reuses the clinical screens already computed
rules["s_rule"], rules["level_floor"], rules["suggested_specialty"], rules["required_equipment"]
# 1.0, 'EMERGENCY', 'CARDIO', ['CATH_LAB', 'ICU']
```

- Rules are data: `rule_engine/rules.v1.json` (31 rules, 21 lexicon entries in French, Darija Arabizi, Darija/Arabic script and English).
- Inputs: extracted facts, the clinical screens of `clinical_rules.py`, and the raw patient messages. **Never the ML score**, so the two signals stay independent for fusion.
- Severity: `critical` → `s_rule = 1.0`, level floor `EMERGENCY`; `high` → floor `HIGH` + weight; `moderate` → weight only. Non-critical weights combine as noisy-OR `1 − Π(1 − w)`.
- Negation (`pas de`, `ma 3andich`, `ما عنديش`, `no`…) and context (`last year`, `ken`, `زمان`, `j'ai peur`…) are checked in the same clause; extracted facts are cross-checked the same way.
- `suggested_specialty` / `required_equipment` use the codes of the Grand Tunis hospitals dataset (`CARDIO`, `NEURO`, `OBGYN`, `CT`, `CATH_LAB`, `ICU`…), from the most severe triggered group only.
- Tests: `python -m unittest -q test_rule_engine test_integration`.

Unvalidated prototype: rules, weights and translations need clinician and native-speaker review. No triggered rule does not mean safe.

## Fusion, decision, LLM interviewer and HTTP service

```
patient message → process_turn (facts, NLP p_nlp, screens, next missing field)
               → rule_engine.evaluate (s_rule, floor, specialty/equipment)
               → fusion.fuse (p_final, uncertainty, contributions)
               → decision.decide (EMERGENCY / HIGH / LOW / UNCERTAIN + actions)
               → interviewer (LLM phrases the next question only; never decides)
```

- `fusion.py`: `p_final = sigmoid(-1.5 + 0.8·(logit(p_nlp) − logit(0.15)) + 4·s_rule)`. Hand-set, not fitted; contributions are returned for the dashboard.
- `decision.py`: critical rule → EMERGENCY; level never below the rule floor; NLP abstains and no rule → UNCERTAIN (clinician review).
- `interviewer.py`: Claude via `ANTHROPIC_API_KEY` (model `SAHHANITO_LLM_MODEL`, default `claude-sonnet-5-5`; `SAHHANITO_LLM=off` to disable). Unsafe, failed or slow replies fall back to the reviewed templates (FR / EN / Darija / Arabic). Its `collected` notes go to `state.sahhanito.llm_notes` for the report, never to the decision.
- `sahhanito.py`: `triage_turn(state, message, previous_question_id, language='fr'|'en'|'ar'|'darija', mode='interview'|'monitor')`.

Run the service:

```sh
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/uvicorn service:app --port 8000
curl -s localhost:8000/health
curl -s -X POST localhost:8000/turn -H 'content-type: application/json' \
  -d '{"message":"3andi wja3 fi sadri w ma najamch netnaffes","language":"darija"}'
```

Send the returned `state` and `reply.question_id` back with the next message. The patient app's Settings → Test mode → "IA réelle" calls this service on `http://localhost:8000` (`EXPO_PUBLIC_AI_URL` to change it).

Tests: `python -m unittest -q test_decision test_rule_engine test_integration`.
