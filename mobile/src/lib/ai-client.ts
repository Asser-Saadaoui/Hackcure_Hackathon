import type { Decision, Language, RiskLevel, Uncertainty } from '@/lib/types';

/**
 * Client of the Sahhanito AI service (ai/service.py, POST /turn).
 * Used by the mock backend in the "Real AI" test mode; later the Next.js backend calls the same
 * endpoint and the app talks to the backend only.
 * The AI decides with the NLP model + rule engine + fusion. The LLM only phrases questions.
 */

export const AI_URL = process.env.EXPO_PUBLIC_AI_URL ?? 'http://localhost:8000';
const TIMEOUT_MS = 15_000;

export interface AiTurnResponse {
  status: 'question' | 'emergency' | 'result' | 'under_review' | 'monitor';
  final: boolean;
  reply: { text: string; quick_replies: string[]; question_id?: string; field?: string | null; source: string } | null;
  state: unknown;
  assessment: {
    p_nlp: number | null;
    nlp_status: string;
    s_rule: number;
    p_final: number;
    uncertainty: Uncertainty;
    uncertainty_reasons: string[];
    contributions: { bias: number; nlp: number; rules: number };
    triggered_rules: { id: string; name: string; severity: 'critical' | 'high' | 'moderate'; weight: number; evidence: string[] }[];
  };
  decision: {
    level: RiskLevel;
    actions: string[];
    suggested_specialty: string | null;
    required_equipment: string[];
    rationale: string;
    rationale_localized: string;
  };
}

export async function aiTurn(body: {
  message: string;
  state: unknown;
  previousQuestionId: string | null;
  language: Language;
  caseId: string;
}): Promise<AiTurnResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${AI_URL}/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: body.message, state: body.state ?? null, previous_question_id: body.previousQuestionId,
        language: body.language, case_id: body.caseId,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`AI service ${res.status}`);
    return (await res.json()) as AiTurnResponse;
  } finally {
    clearTimeout(timer);
  }
}

export function toDecision(r: AiTurnResponse): Decision {
  return {
    level: r.decision.level,
    uncertainty: r.assessment.uncertainty,
    pFinal: r.assessment.p_final,
    rationale: r.decision.rationale_localized,
    suggestedSpecialty: r.decision.suggested_specialty,
    requiredEquipment: r.decision.required_equipment,
    triggeredRules: r.assessment.triggered_rules.map(({ id, name, severity }) => ({ id, name, severity })),
  };
}
