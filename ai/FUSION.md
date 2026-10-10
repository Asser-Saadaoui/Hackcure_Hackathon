# Exploratory logistic fusion

Learned from weak annotations, not clinical ground truth. Runtime fusion now loads the non-critical coefficients from fusion_coefs.json at service startup, as explicitly requested by the project owner.
Only the previously inspected validation-selection partition was eligible; ensemble
training and calibration rows were excluded. No independent test evaluation was run.
The frozen ensemble and its calibration were not retrained.

Of 2,546 eligible unique question groups, 621 abstained and were excluded, leaving
1,925 scored English questions. Critical rules fired for 221 of those. The main
fit excludes critical cases: 1,704 rows, 293 emergency labels, prevalence 0.17194836.
Grouping uses the saved question-derived case ID, not a verified real patient ID.

```python
# Candidate arithmetic only. Preserve runtime abstention and critical overrides.
p = min(max(p_nlp, 1e-4), 1 - 1e-4)
p_final = sigmoid(-0.1515864484 + 0.8892288317 * logit(p)
                  + 0.1670753539 * s_rule)
# Equivalent centered form:
p_final = sigmoid(-1.5493486585
                  + 0.8892288317 * (logit(p) - logit(0.1719483568))
                  + 0.1670753539 * s_rule)
```

Critical rules must force EMERGENCY regardless of this score. These coefficients
are log-odds contributions, not percentage shares. Missing NLP scores were not
imputed; this candidate only applies when NLP supplies a valid score.

| Non-critical fit | Nested 5-fold CV Brier | CV AUC |
|---|---:|---:|
| NLP-only logistic mapping | 0.031931 | 0.975338 |
| Rules-only logistic mapping | 0.111888 | 0.693303 |
| Fusion | 0.032037 | 0.975277 |

Each outer fold tunes C using a separate inner 5-fold StratifiedGroupKFold; no
class balancing is used. Final C is 1.0. Lower Brier is better. Raw frozen NLP
Brier was 0.031497 on the same non-critical cases. Fusion does not improve it.

200 case bootstrap replicates, conditional on selected C, give 95% intervals:
b0 [-0.405565, 0.162783], b1 [0.802561, 1.036317], b2 [-0.835509, 1.110544].
The rule coefficient varies from -0.062229 to 0.390220 between outer folds;
its sign is not robust. These intervals do not account for weak-label bias or
historical validation-set reuse. All-scored-case b2 is 0.703994, versus 0.167075
without critical cases. The existing hand-set rule weight is 4.0.

No trauma/language validation, clinical sensitivity thresholds, or independent
test metrics are claimed. test_brier and test_auc in the JSON are null. The live weights now use this candidate. Critical overrides, rule floors, NLP abstention, and emergency/high thresholds remain unchanged.

## Reproduce

From the repository's ai folder, use the existing Python environment:

```powershell
& 'C:/Users/moura/Desktop/hackcure/triage_artifacts/handoff/.venv/Scripts/python.exe' fit_fusion.py --data 'C:/Users/moura/Desktop/hackcure/train.csv' --splits 'C:/Users/moura/Desktop/hackcure/triage_artifacts/integration_v3/data_splits.csv' --output 'C:/Users/moura/Desktop/hackcure/triage_artifacts/fusion'
```

fusion_inputs.csv contains only record/group IDs, binary targets, frozen model
scores and rule scores. fusion_report.json contains diagnostics, all/non-critical
comparisons and fold coefficients. fusion_coefs.json contains the non-critical
coefficients loaded by fusion.py. The ensemble itself is unchanged.

Runtime activation was explicitly requested on 2026-10-11. No clinical validation or independent-test improvement is implied. Restart the AI service to load changed coefficient files.
