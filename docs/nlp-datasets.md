# Datasets for the Multilingual Clinical NLP (steps 2–6)

As of 2026-10-08. This file is for the AI team. It covers the NLP part of the pipeline: preprocessing, language detection, symptom extraction, negation, time and severity, and building the patient state. The **urgency classifier** has its own file: `ed-classifier-datasets.md`.

**Bottom line:** no public dataset of Tunisian Darija symptom descriptions exists. We combine **French and Arabic medical datasets** (medical vocabulary and structure) with **Tunisian dialect corpora** (how people actually write), and we **build a small annotated Tunisian set** ourselves.

---

## 1. What the NLP has to produce

The target output is the `state` object of the AI contract (`hackcure-app.md` §6):

| Field | NLP task | Example input → output |
|---|---|---|
| `language` | language / script detection | "n7ess rou7i mkhanou9" → `darija`, Arabizi |
| `symptoms[]` | symptom entity extraction (NER) + normalization to a code | "sderi yo9jani" → `chest_pain` |
| negation | negation detection | "ma 3andich skhana" → fever = **absent** |
| `onset`, `duration` | time expressions | "men 20 d9i9a" → 20 min |
| `severity` | severity cues | "barcha", "ma najamch nitnaffes" → severe |
| `medical_history`, `medications` | entities | "3andi sokkor", "na5ou Kardegic" |
| `missing_fields` | slot filling | duration not mentioned → ask |

---

## 2. Tunisian dialect (the hardest gap)

| Dataset | Content | Use for us | Link |
|---|---|---|---|
| **TUNIZI** | Tunisian **Arabizi** social-media comments (sentiment labels) | Teach the model Tunisian Latin-script spelling ("7", "9", "3"); normalization and language-ID training | [paper](https://arxiv.org/pdf/2004.14303) · [Zenodo](https://zenodo.org/record/4275240) |
| **TSAC / TSAC+** | 17k / 72k Tunisian comments in Arabic script | Tunisian vocabulary in Arabic script; domain adaptation | [TSAC (TFDS / HF)](https://tensorflow.org/datasets/community_catalog/huggingface/tsac?hl=pt) |
| `arbml/Tunisian_Dialect_Corpus` | General Tunisian corpus (10k–100k rows) | Pre-training / vocabulary | [Hugging Face](https://huggingface.co/datasets/arbml/Tunisian_Dialect_Corpus/tree/b2aa634f143d247fa6b0cc3df1a652f09dada843) |
| `atakaboudi/Dialect_of_Tunisia-Work_Collection` | A collection of Tunisian NLP sources (Arabic script) | Pre-training / vocabulary | [Hugging Face](https://huggingface.co/datasets/atakaboudi/Dialect_of_Tunisia-Work_Collection) |
| Tunisian Darija Health Agent | Not a dataset. A Tunisian diabetes chatbot handling Darija, Arabizi and French code-switching, with a rule layer for emergencies | Reference project. Read its notes: local LLMs drifted to Levantine, Egyptian or MSA when asked to write Tunisian Darija | [GitHub](https://github.com/medalikech/Tunisian-Arabic-Darija-Health-Agent) |

**Closest medical dialect resource:**

| Dataset | Content | Use | Link |
|---|---|---|---|
| **MedQA-MA** | ~109k medical Q&A pairs in **Moroccan Darija**, 23 specialties | The closest dialect + medical data. Moroccan isn't Tunisian, but it shares much Maghrebi vocabulary; useful for transfer and as a **method template** | [article](https://www.sciencedirect.com/science/article/pii/S2352340926000909) · [Mendeley Data](https://data.mendeley.com/datasets/v6gs7nsy9z) |
| Darija medical dialogue study | 100 clinical dialogues translated to Moroccan Darija, then corrected by native speakers | A caution: machine-written Darija came out mostly MSA and needed heavy correction | [arXiv](https://arxiv.org/pdf/2608.00207) |
| Darija Arabizi NER test set | 400 natively validated Arabizi sentences (not medical) | Reference for how to annotate Arabizi | [Hugging Face](https://huggingface.co/datasets/AchrafSoltani/morisco-ner) |

---

## 3. Arabic medical (patient language)

| Dataset | Content | Use | Link |
|---|---|---|---|
| **AraMed** | 270k Arabic Q&A pairs from patients on a health forum | Patient-style symptom descriptions; medical vocabulary in Arabic script | [ACL Anthology](https://aclanthology.org/2024.osact-1.6) |
| **AHD (Arabic Healthcare Dataset)** | ~808k Q&A from Altibbi.com | Large-scale Arabic medical patient language | [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11403399/) |
| MedAraBench | 24.9k Arabic medical exam MCQs | Evaluating the model's medical knowledge only, not training extraction | [arXiv](https://arxiv.org/html/2602.01714v1) |

---

## 4. French medical (extraction and terminology)

| Dataset | Content | Use | Link |
|---|---|---|---|
| **DDXPlus (French original)** | 1.3M synthetic patients; 110 symptoms, 113 antecedents, 49 pathologies; French labels | **The symptom vocabulary and codes** for the `state` (and seeds for generating patient messages, §5) | [paper](https://arxiv.org/pdf/2205.09148) · [French on HF](https://huggingface.co/datasets/aai530-group6/ddxplus-french/tree/483746d78f215739437985cd0ca7bdf7a993e9f6) |
| CAS | French clinical cases with annotations (from the literature) | French clinical NER, negation and modality | [Hugging Face](https://huggingface.co/datasets/DrBenchmark/CAS/blob/main/_attic/CAS.py) |
| QUAERO FrenchMed | French biomedical NER (small) | French medical entity types | [Hugging Face](https://huggingface.co/datasets/rntc/quaero-frenchmed-ner-medline/tree/refs%2Fconvert%2Fparquet/default) |
| Health Data Hub datasets | Seven French medical datasets on Hugging Face (per a 2026 review) | Check which have symptom annotations | [review](https://huggingface.co/blog/TanitAI/hdh) |

**Useful French model:** CamemBERT-bio, or a GLiNER variant ([camembert-bio-gliner](https://huggingface.co/almanach/camembert-bio-gliner-v0.1/blob/refs%2Fpr%2F1/README.md)), for French medical entity extraction.

---

## 5. Build our own Tunisian triage NLP set (required)

The datasets above teach medical vocabulary and Tunisian spelling, but none has **Tunisian patients describing symptoms**. Plan for a small, high-quality set.

### 5.1 Target size (hackathon → later)

| Split | Hackathon | Later |
|---|---|---|
| Train (synthetic, human-corrected) | 1,000–3,000 messages | 10k+ |
| Dev / test (**real** messages, never synthetic) | 200–300 | 1,000+ |
| Red-flag test set (clinician-written) | 100 | 300+ |

### 5.2 How to make it

1. **Seed cases from DDXPlus:** pick pathologies relevant to the ED (chest pain, stroke signs, asthma, trauma, abdominal pain, fever in children, pregnancy issues…) with their symptom lists.
2. **Draft patient messages with an LLM** in 3 forms: Darija in Arabic script, Darija in Arabizi, and French. Mix in code-switching ("3andi douleur fi sdri"), typos and short messages, like real users write.
3. **Native Tunisian speakers correct every message** (the dialect drift is well documented, §2). Discard anything that "sounds Egyptian/Levantine".
4. **Collect real messages:** ask 30–50 volunteers to write how they would describe 5–10 given scenarios. These become the **test set**.
5. **Annotate** with a simple tool (Label Studio or doccano) using the scheme below.
6. **A clinician reviews** the red-flag set and a sample of the rest.

### 5.3 Annotation scheme (maps 1:1 to the `state`)

| Label | Attributes | Example |
|---|---|---|
| `SYMPTOM` | `code` (DDXPlus-based list), `negated` (yes/no), `body_site` | "sderi yo9jani" → chest_pain |
| `ONSET` / `DURATION` | normalized value (minutes / hours / days) | "men l bera7" → ~1 day |
| `SEVERITY` | mild / moderate / severe | "barcha barcha" → severe |
| `HISTORY` | condition code | "3andi tension" → hypertension |
| `MEDICATION` | name | "Kardegic" |
| `PREGNANCY` | yes / no / unknown | "ana 7amel" → yes |
| `RED_FLAG` (message-level) | which flag | chest pain + dyspnea |

**Inter-annotator check:** 2 annotators on 10% of the data. Fix the guidelines where they disagree.

### 5.4 Normalization dictionary (quick win)

Keep a hand-made table `darija_term → symptom code`, in Arabic script and Arabizi variants. For example: `sdar / sder / صدر → chest`, `n7ess rou7i mkhanou9 / ma najamch nitnaffes → dyspnea`, `skhana / سخانة → fever`, `dou5a / دوخة → dizziness`. It's useful as a baseline extractor, for data augmentation, and as a safety net for red flags.

---

## 6. Evaluation

- **Per-language and per-script scores** (Darija in Arabic script / Arabizi / French / mixed). A good average can hide a failing script.
- **Symptom extraction:** F1 per symptom; **recall on red-flag symptoms** matters most.
- **Negation errors:** "ma 3andich wja3 fi sdri" (no chest pain) must not become chest pain.
- **Test only on real messages,** never on the synthetic drafts.

---

## 7. Licensing and privacy checklist

- [ ] Check each dataset's license before training and before any public demo. Some are research-only, and some forbid redistribution.
- [ ] Volunteers sign a short consent; collected messages contain no names or phone numbers.
- [ ] Never put real patient data from the app into training without consent and anonymization.
- [ ] Record dataset versions with the model version (`model_version` in the AI contract).
