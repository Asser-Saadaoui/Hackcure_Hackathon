import type { Decision, RiskLevel } from '@/lib/types';

/**
 * Simulated AI triage — same idea as ai-stub/main.py (docs §21.3).
 * Keyword based and deterministic so the demo conversations are repeatable.
 * NOT medical logic.
 */

const CRITICAL = ['sder', 'sdri', 'poitrine', 'صدر', 'mkhanou9', 'nitnaffes', 'tnaffes', 'chest', "can't breathe", 'saignement', 'bleeding', 'nazif'];
const PREGNANCY = ['7amel', 'enceinte', 'pregnant', 'حامل'];
const SEVERE = ['barcha', 'trop', 'severe', 'very', 'برشا', 'très forte', 'tres forte', 'very strong', '9wi'];
const PAIN = ['wja3', 'yo9jni', 'douleur', 'mal', 'pain', 'وجع'];

const FOLLOW_UPS: { text: string; quickReplies?: string[] }[] = [
  { text: 'Depuis quand ? / men waktech ?', quickReplies: ['< 1h', '1–24h', '> 1 jour'] },
  { text: "La douleur est-elle forte ? / l wja3 9wi ?", quickReplies: ['Faible', 'Moyenne', 'Très forte'] },
  { text: 'Avez-vous de la fièvre ? / 3andek skhana ?', quickReplies: ['Oui', 'Non', 'Je ne sais pas'] },
];

const has = (text: string, words: string[]) => words.some((w) => text.includes(w));

/** Critical red-flag keywords (rules engine stand-in). Always checked, even in demo mode. */
export function isCritical(text: string) {
  return has(text.toLowerCase(), CRITICAL);
}

export function isDegradedTrigger(text: string) {
  return text.toLowerCase().includes('#down'); // type "#down" to simulate the AI being unavailable
}

export function assess(allPatientText: string, turnIndex: number): { decision: Decision; nextQuestion: typeof FOLLOW_UPS[number] | null } {
  const t = allPatientText.toLowerCase();

  if (has(t, CRITICAL)) {
    return { decision: make('EMERGENCY', 0.96, 'LOW', 'Douleur thoracique ou difficulté respiratoire : signe d’alerte critique.', 'CARDIO', ['CT'],
      [{ id: 'R-CARD-01', name: 'chest pain + dyspnea', severity: 'critical' }]), nextQuestion: null };
  }
  if (has(t, PREGNANCY)) {
    return { decision: make('HIGH', 0.74, 'LOW', 'Grossesse avec symptômes : évaluation rapide aux urgences.', 'OBGYN', [],
      [{ id: 'R-OB-02', name: 'pregnancy + symptoms', severity: 'high' }]), nextQuestion: null };
  }
  if (turnIndex < FOLLOW_UPS.length) {
    return { decision: make('UNCERTAIN', 0.45, 'HIGH', 'Il manque des informations.', null, [], []), nextQuestion: FOLLOW_UPS[turnIndex] };
  }
  if (has(t, PAIN) && has(t, SEVERE)) {
    return { decision: make('HIGH', 0.68, 'MEDIUM', 'Douleur forte : consultation aux urgences aujourd’hui.', 'EMERG', [], []), nextQuestion: null };
  }
  if (t.includes('je ne sais pas')) {
    return { decision: make('UNCERTAIN', 0.5, 'HIGH', 'Signaux contradictoires : un clinicien va vérifier.', null, [], []), nextQuestion: null };
  }
  return { decision: make('LOW', 0.18, 'LOW', 'Pas de signe de gravité : soins à domicile et surveillance.', null, [], []), nextQuestion: null };
}

function make(level: RiskLevel, pFinal: number, uncertainty: Decision['uncertainty'], rationale: string,
  suggestedSpecialty: string | null, requiredEquipment: string[], triggeredRules: Decision['triggeredRules']): Decision {
  return { level, pFinal, uncertainty, rationale, suggestedSpecialty, requiredEquipment, triggeredRules };
}
