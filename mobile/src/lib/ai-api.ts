import type { PatientApi } from './api';
import type { CaseDetail, Decision, Language, TurnResult } from './types';

export interface PipelineTurn {
  patient_state: { pending_question?: { id: string }; [key: string]: unknown };
  next_question: { id: string; text: string } | null;
  rules: { critical_flags_detected: boolean; triggered_rules?: unknown[]; [key: string]: unknown };
  ml: { status: string; emergency_score?: number | null; non_emergency_score?: number | null; [key: string]: unknown };
  [key: string]: unknown;
}

/** No clinical probability or LOW decision is manufactured from the ML score. */
export function mapPipelineTurn(result: PipelineTurn, caseId: string): TurnResult {
  const critical = result.rules.critical_flags_detected;
  const decision: Decision = {
    level: critical ? 'EMERGENCY' : 'UNCERTAIN', uncertainty: 'HIGH', pFinal: null,
    rationale: critical ? 'A critical screening rule was triggered. Follow the emergency instructions now.'
      : 'Prototype assessment only. ML scores are not medical probabilities; a final clinical decision policy and clinician review service are not connected.',
    suggestedSpecialty: null, requiredEquipment: [], triggeredRules: [],
  };
  if (critical) return { kind: 'emergency', caseId, decision };
  if (result.ml.status === 'unavailable') return { kind: 'degraded', caseId, message: 'AI scoring is unavailable. Do not wait for this app if you need emergency help.' };
  if (result.next_question) return { kind: 'question', caseId,
    turn: { id: result.next_question.id, role: 'ASSISTANT', text: result.next_question.text, createdAt: new Date().toISOString() } };
  return { kind: 'under_review', caseId, decision };
}

const cases = new Map<string, CaseDetail & { pipeline?: PipelineTurn }>();
const base = process.env.EXPO_PUBLIC_AI_URL ?? 'http://127.0.0.1:8000';
const unsupported = async (): Promise<never> => { throw new Error('Hospital communication, reports and matching are not connected in real AI mode.'); };
const get = (id: string) => { const c = cases.get(id); if (!c) throw new Error('Unknown case'); return c; };

async function turn(caseId: string, text: string, language: Language = 'en'): Promise<TurnResult> {
  const c = get(caseId);
  const extractionLanguage = language === 'en' ? 'en' : language === 'ar' || /[\u0600-\u06ff]/u.test(text) ? 'tn_arabic' : 'tn_arabizi';
  // French UI is preserved; French clinical extraction is outside this lexical prototype's support.
  if (language === 'fr') return { kind: 'degraded', caseId, message: 'Le prototype NLP accepte anglais, darija et Arabizi. Choisissez une de ces langues. En urgence, appelez le 190.' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let pipeline: PipelineTurn;
  try {
    const response = await fetch(`${base}/turn`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ message: text, language: extractionLanguage, patient_state: c.pipeline?.patient_state ?? null,
        previous_question_id: c.pipeline?.patient_state.pending_question?.id ?? null }) });
    if (!response.ok) throw new Error(`AI bridge returned ${response.status}`);
    pipeline = await response.json();
  } finally { clearTimeout(timeout); }
  c.pipeline = pipeline; // Rich facts, independent rules, continuous scores and calibration metadata retained separately.
  c.turns.push({ id: `${caseId}:${c.turns.length}`, role: 'PATIENT', text, createdAt: new Date().toISOString() });
  const mapped = mapPipelineTurn(pipeline, caseId);
  if (mapped.kind === 'question') { c.turns.push(mapped.turn); c.status = 'TRIAGING'; }
  if (mapped.kind === 'emergency' || mapped.kind === 'under_review' || mapped.kind === 'result') {
    c.decision = mapped.decision; c.level = mapped.decision.level;
    c.status = mapped.kind === 'emergency' ? 'EMERGENCY' : 'UNDER_REVIEW';
  }
  return mapped;
}

/** Local prototype sessions are memory-only. Never falls back to simulated hospital acceptance. */
export const aiApi: PatientApi = {
  async startSession() { return { userId: 'local-prototype', token: '', deviceId: 'local-prototype' }; },
  async createCase(text, language) {
    const id = `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cases.set(id, { id, referenceCode: id, status: 'TRIAGING', level: null, decision: null, turns: [], location: null, referral: null,
      createdAt: new Date().toISOString(), closedAt: null });
    try { return await turn(id, text, language); } catch (error) { cases.delete(id); throw error; }
  },
  sendMessage: turn,
  async getCase(id) { return get(id); },
  async listCases() { return [...cases.values()].map(c => ({ id: c.id, referenceCode: c.referenceCode, status: c.status,
    level: c.level, facilityName: null, createdAt: c.createdAt })); },
  async closeCase(id) { const c = get(id); c.status = 'CLOSED'; c.closedAt = new Date().toISOString(); },
  setLocation: unsupported, getReport: unsupported, getChat: unsupported, sendChat: unsupported, getTracking: unsupported,
  subscribe: () => () => {},
};
