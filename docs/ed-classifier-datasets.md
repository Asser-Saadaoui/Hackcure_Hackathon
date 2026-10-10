# Datasets for the ED Urgency Classifier (steps 7–9)

As of 2026-10-08. This file is for the AI team. It covers the **urgency classifier**: from the extracted patient state, predict the level (RED / ORANGE / YELLOW / GREEN) and the specialty. The language part (extracting symptoms from Darija, Arabic and French) is in `nlp-datasets.md`.

**Bottom line:** real ED triage datasets with urgency labels exist, but they are English, mostly American or Korean, and they **use vital signs we don't have**. Use them to learn and check the mapping from complaint to urgency, then validate on a small Tunisian set reviewed by a clinician. **The safety rules (step 7) are written by clinicians, not learned from data.**

---

## 1. The key constraint: what our app actually knows

| Information | Hospital triage datasets | Our app |
|---|---|---|
| Chief complaint (text) | ✓ | ✓ (from the NLP) |
| Age, sex, pregnancy | ✓ | ✓ (optional profile) |
| Pain score | ✓ | ✓ (can be asked as a follow-up) |
| Symptoms, duration, history | partly | ✓ |
| **Vital signs** (heart rate, blood pressure, SpO2, temperature, respiratory rate) | ✓, and they are among the strongest predictors | ✗, **not available** |
| Arrival mode (ambulance) | ✓ | ✗ |

So: **train only on the features we will have at inference time**, i.e. drop vitals and arrival mode from these datasets. A model trained with vitals will look great in testing and fail in the app.

---

## 2. Datasets with urgency labels

| Dataset | Content | Labels | Access | Use for us |
|---|---|---|---|---|
| **MIMIC-IV-ED** (`triage` table) | ~425k ED stays, Boston, 2011–2019: **free-text chief complaint**, pain, vitals, demographics | **ESI 1–5** (nurse-assigned) | **Credentialed** on PhysioNet (CITI training + data use agreement); no redistribution of derived clinical data | The main training/validation source for complaint → urgency (English). [PhysioNet](https://www.physionet.org/content/mimic-iv-ed/) · [triage table docs](https://mimic.mit.edu/docs/iv/modules/ed/triage) |
| **MIETIC** (MIMIC-IV-Ext Triage Instruction Corpus) | 9,629 structured triage cases from MIMIC-IV: chief complaint, vitals, demographics, history | ESI-aligned | Credentialed (PhysioNet) | A cleaner, ready-made subset for training and evaluation. [PhysioNet](https://physionet.org/content/mietic/) |
| **KTAS dataset** (Moon et al. 2019, on Kaggle as "Emergency Service – Triage Application") | 1,267 adult ED visits, 2 Korean EDs; English chief complaints, vitals, outcomes | **Expert-consensus KTAS 1–5** + the nurse's KTAS (14.7% mistriage) | Public (check the Kaggle license) | Small but **open and expert-labeled**; also shows under/over-triage patterns. [paper](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6730846/) · [PLOS ONE](https://doaj.org/article/23f0072c140844e7aa1a4e93505bfd02) |
| **NHAMCS** (US CDC national survey) | National ED visits: coded reason for visit, vitals, pain, resources used | No ESI label; acuity can be reconstructed | Public use files | Extra volume if acuity is reconstructed as in [this method](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7514412/) |
| **DDXPlus** | 1.3M synthetic patients, 49 pathologies, **pathology severity** | Severity per pathology (not an ED triage level) | Open | Map symptom combinations to severity; a large synthetic training signal. [paper](https://arxiv.org/pdf/2205.09148) · [severity usage](https://arxiv.org/pdf/2210.07198) |

### Evaluation-only benchmarks

| Benchmark | Use | Link |
|---|---|---|
| ER-Reason | LLM clinical reasoning in the ER, 5 acuity levels | [arXiv](https://arxiv.org/pdf/2505.22919) |
| LLM triage bias study (KTAS data) | Shows LLM triage bias by sex/age; reuse its checks | [arXiv](https://arxiv.org/pdf/2504.16273) |
| Sequential triage study (MIMIC-IV-ED) | LLMs anchor on the chief complaint and miss later evidence; relevant to our follow-up questions | [arXiv](https://arxiv.org/pdf/2609.22904) |

---

## 3. Mapping their labels to our levels

Proposed starting point. **A clinician must validate it.**

| Our level | Meaning in the app | ESI (MIMIC) | KTAS (Korea) | DDXPlus severity |
|---|---|---|---|---|
| **RED** | emergency now: call 190 / nearest ED | 1–2 | 1–2 | most severe pathologies |
| **ORANGE** | urgent: ED / same-day hospital | 3 | 3 | severe |
| **YELLOW** | soon: doctor within 24–48 h | 4 | 4 | moderate |
| **GREEN** | self-care / routine | 5 | 5 | mild |

Also map each dataset's chief complaints to our **specialty codes** (`CARDIO`, `NEURO`, `TRAUMA`, `PEDIA`, `OBGYN`…), so the classifier can return `suggested_specialty` for hospital matching.

---

## 4. Recommended model design

1. **Rules first (step 7):** a clinician-written red-flag list (chest pain + dyspnea, stroke signs, severe bleeding, unconsciousness, pregnancy + bleeding/pain, child with high fever + lethargy…). If a rule fires, the result is RED regardless of the model. These rules come from guidelines and the doctor, **not from data**.
2. **Classifier (step 8):** input = the extracted `state` features (symptom codes, negations, duration, severity, age, sex, pregnancy, history, pain) → probabilities for 4 levels + uncertainty.
   - Baseline: gradient boosting (XGBoost / LightGBM) on symptom-code features. It's fast, explainable, and works on small data.
   - Text model: a multilingual encoder fine-tuned on the chief complaint, then on our Tunisian set.
3. **Decision policy (step 9):** rules ∪ classifier. **Prefer over-triage:** when uncertain between two levels, pick the higher one. High uncertainty → `ASK_FOLLOWUP`.

---

## 5. Our own validation set (required)

Foreign data can't prove the model works for Tunisian patients. Build:

| Set | Size (hackathon) | Who labels |
|---|---|---|
| Tunisian triage vignettes (Darija / Arabizi / French) with the expected level + specialty | 200–300 | a Tunisian emergency doctor (2 reviewers on a sample) |
| Red-flag set | 100 | clinician |
| "Tricky" set: negations, minimizing language ("chwaya", "normal"), elderly, children, pregnancy | 50–100 | team + clinician |

These can share messages with the NLP test set (`nlp-datasets.md` §5), with urgency labels added.

---

## 6. Metrics that matter

- **Under-triage rate**: predicted lower than the true level. **The main safety metric**; target close to 0 for RED.
- **Recall for RED** (sensitivity): should be close to 100%, with the rules included.
- **Over-triage rate**: acceptable within limits, since it costs ED load, not lives.
- A confusion matrix per level, **per language/script**, and per age group / sex (bias check).
- Calibration: when the model says 80%, it should be right about 80% of the time (needed for the uncertainty → follow-up logic).

---

## 7. Licensing and access checklist

- [ ] Start **PhysioNet credentialing now** (CITI course + data use agreement); it can take days.
- [ ] MIMIC-derived data and models trained on it: follow the DUA. No redistribution of clinical content, and check whether a model trained on it can be published.
- [ ] Check the KTAS Kaggle dataset license before using it in the demo.
- [ ] Record dataset versions and the label mapping with `model_version`.
