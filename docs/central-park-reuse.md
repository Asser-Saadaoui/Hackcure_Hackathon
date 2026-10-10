# Reusing central-park ("Triage Park") in Sahhanito

**Status:** adopted (2026-10-10). **Source:** `~/Desktop/central-park` (MIT license, © 2026 Eungi Hong).
**Rule:** keep the MIT copyright notice at the top of every file we copy or adapt, and credit the project in `README.md`.

central-park is a multi-agent clinical triage platform: a FastAPI + LangGraph agent service, a React + Vite + shadcn UI, and InterSystems IRIS (FHIR server, vector search, interoperability). Its triage design matches ours closely: deterministic red-flag gate → LLM reasoning → escalate-only checks, and an adaptive interview.

---

## 1. AI team — use `central_park/` as the starting code for `ai/`

### Copy and keep

| central-park file | Goes to (`ai/`) | Changes |
|---|---|---|
| `src/python/central_park/llm/provider.py` | `ai/llm/provider.py` | none at first (OpenAI / Anthropic / Ollama behind one `complete()`); add our model choice in config |
| `src/python/central_park/interview.py` + `prompts/next_question.txt` | `ai/interviewer.py` + `ai/prompts/interviewer.md` | input = our `history` + `CaseState` (no FHIR record); output = `next_question` + `quick_replies` + `missing_info`; languages **Darija (Arabic + Arabizi), Arabic, French, English**; keep the 3–7 question bound and the fixed-question fallback |
| `validate_red_flags` + `_RED_FLAG_PATTERNS` + `_NEGATIONS` in `agent.py` | `ai/rules.py` + `ai/rules.yaml` | move patterns to YAML; **add Darija/Arabizi/French/Arabic patterns** (e.g. `ma najamch nitnaffes`, `n7ess rou7i mkhanou9`, `sderi yo9jani`, `douleur thoracique`, `ضيق في التنفس`) and negations (`ma 3andich`, `pas de`, `ما عنديش`, `لا`); output `sRule` + triggered rules |
| `verify` (escalate-only critic) in `agent.py` + `prompts/verify.txt` | `ai/safety.py` (policy) | keep "may escalate, never downgrade"; combine with our fusion output (§3 below) |
| `prompts/handoff.txt` (+ the handoff summary logic) | `ai/report.py` + `ai/prompts/report.md` | output our **structured report** (`summary`, `timeline`, `positives`, `negatives`, `red_flags`, `risk`, `recommended_actions`, `open_questions`, `disclaimer`) in the patient's language for the patient copy and French for the hospital |
| `src/python/tests/test_red_flags.py`, `test_safety.py`, `test_interview.py`, `test_reasoning.py` | `ai/tests/` | adapt to our rules / levels; add Darija & Arabizi cases |
| `main.py` (FastAPI app skeleton) | `ai/main.py` | replace their endpoints by ours: **`POST /turn`, `POST /report`, `GET /health`** (contract: `hackcure-app.md` §6) |

### Remove

- Everything IRIS: `src/cls/`, `iris-config/`, interoperability, IntegratedML, `tools/vector.py` (IRIS `VECTOR_COSINE`).
- FHIR record reads in `gather_context` / `tools/fhir.py` reads: our patients are anonymous; context = the conversation + `CaseState`.
- Primary-care features: cohort, gaps-in-care, lab explainer, care plan, NL→FHIR query, copilot (not needed for ED triage).
- `check_safety` medication/allergy screening against a FHIR record: keep the idea only for medications the **patient mentions** in the chat.

### Replace

| central-park | Sahhanito |
|---|---|
| Triage levels self-care / see-GP / urgent-care / ED | **LOW** (self-care, see-GP) / **HIGH** (urgent-care) / **EMERGENCY** (ED); **UNCERTAIN** when the reviewer or fusion is unsure |
| Guidelines: `data/guidelines.json` (30 NICE summaries) + IRIS vector search | `ai/knowledge/`: guideline snippets reviewed for the Tunisian context (WHO / Tunisian ministry / clinician-validated) + a small in-memory or **pgvector** index |
| LLM reasoner decides the level | **Our design (final architecture):** `nlp_classifier.py` (XLM-R) → `pNLP`, `rules.py` → `sRule`, `fusion.py` → `pFinal`, `safety.py` → level. The central-park reasoner is kept as a helper that proposes `suggested_specialty`, `required_equipment` and the rationale, and **can only raise** the level |

### Output contract to respect (`hackcure-app.md` §6)

`POST /turn` must return: `language`, `script`, `state`, `missing_info`, `next_question` (+ `quick_replies`), `assessment` (`p_nlp`, `s_rule`, `triggered_rules`, `p_final`, `uncertainty`, `contributions`), `decision` (`level`, `actions`, **`suggested_specialty` and `required_equipment` using the codes of `data/hospitals.grand-tunis.json`** — e.g. `CARDIO`, `OBGYN`, `CT`), `versions`. It also needs `mode: "monitor"` for patient messages in the ED chat (rules + classifier only, no question).

---

## 2. Teammate — hospital dashboard: reuse the shadcn UI

Same stack (React + Vite + Tailwind + shadcn), MIT:

| central-park (`ui/src/`) | Use for |
|---|---|
| `components/ui/*` (button, card, badge, alert, tabs, accordion, input, textarea, progress, separator, label) + `lib/utils.ts` + `index.css` tokens + `tailwind.config.ts` | the dashboard's design system — **same palette as the patient app** (teal primary `hsl(190 70% 30%)`, slate background) |
| `components/WorklistScreen.tsx` | the Board / Handoffs lists (cards with level + KPIs) |
| `components/CaseDetailScreen.tsx` | the case drawer: header with urgency badge + action button, red-flags callout, assessment, recommended actions, transcript tab |
| `components/AdaptiveInterviewScreen.tsx` (step rail, progress bar) | optional: progress UI ideas |

Keep the MIT notice in copied files. Replace their data hooks with our API (`hospital-dashboard-spec.md` §9).

---

## 3. Me (backend + patient apps)

- **FHIR export (her task H16):** use `src/python/central_park/tools/fhir.py` as a **reference** for building R4 resources (Patient, Encounter, Observation, Condition/DetectedIssue, Communication, DocumentReference…) — we build them in TypeScript in `backend/src/server/exports/`.
- **`ai-stub/`:** align it exactly with the `/turn` and `/report` shapes the AI team adopts (including `mode: "monitor"`), so the backend and the patient app switch from stub to real AI without changes.
- **Patient app:** already follows the same safety principles (red flags always win, escalate-only, the patient is never asked to wait in an emergency).

---

## 4. Checklist

- [ ] AI team forks `central_park/` into `ai/` with the MIT notice, removes IRIS/FHIR reads
- [ ] `rules.yaml` with Darija / Arabizi / French / Arabic red flags + negations, with tests
- [ ] `/turn`, `/report`, `/health` respect `hackcure-app.md` §6 (levels, specialty and equipment codes)
- [ ] `knowledge/` guidelines reviewed by a clinician for the Tunisian context
- [ ] XLM-R classifier + fusion wired; the LLM reasoner can only raise the level
- [ ] Teammate copies the shadcn components + tokens into `hospital-dashboard/`
- [ ] `ai-stub/` updated to the final contract
- [ ] README credits central-park (MIT)
