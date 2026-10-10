import { getJSON, Keys, setJSON } from '@/lib/storage';
import { MOCK_CHAT } from '@/mock/mock-api';

/**
 * Test mode (mock backend only): how the simulated AI answers in the triage chat.
 * - demo   → every message gets a demo reply (red flags still trigger the emergency)
 * - triage → follow-up questions, then LOW / HIGH / UNCERTAIN results
 * Disappears when the app is connected to the real backend (Step 17).
 */
export type TestMode = 'demo' | 'triage';

export async function loadTestMode(): Promise<TestMode> {
  const saved = await getJSON<TestMode>(Keys.testMode);
  if (saved) MOCK_CHAT.mode = saved;
  return MOCK_CHAT.mode;
}

export async function setTestMode(mode: TestMode) {
  MOCK_CHAT.mode = mode;
  await setJSON(Keys.testMode, mode);
}

export const getTestMode = (): TestMode => MOCK_CHAT.mode;

/** Messages to type in the chat to reach each outcome (simulated triage). */
export const TEST_SCENARIOS: { label: string; message: string; mode: TestMode; then?: string }[] = [
  { label: 'Emergency', message: 'sderi yo9jani w n7ess rou7i mkhanou9', mode: 'demo' },
  { label: 'Urgent (pregnancy)', message: 'ana 7amel w 3andi wja3 fi kerchi', mode: 'triage' },
  { label: 'Urgent (strong pain)', message: '3andi wja3 fi kerchi', mode: 'triage', then: 'answers: 1–24h → Très forte → Non' },
  { label: 'Not urgent', message: '3andi wja3 fi rasi', mode: 'triage', then: 'answers: 1–24h → Faible → Non' },
  { label: 'Being checked (clinician)', message: '3andi dou5a', mode: 'triage', then: 'answers: 1–24h → Moyenne → Je ne sais pas' },
  { label: 'AI unavailable', message: '#down', mode: 'triage' },
];
