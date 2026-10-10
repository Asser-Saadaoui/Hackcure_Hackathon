import type {
  CaseDetail, Language, CaseLocation, CaseSummary, ChatKind, ChatMessage,
  PatientEvent, PatientReport, Session, TrackingView, TurnResult,
} from '@/lib/types';
import { mockApi } from '@/mock/mock-api';

/**
 * Everything the patient app needs from the backend.
 * Screens only use this interface, so switching from the mock to the real
 * Next.js API (Step 17) doesn't touch any screen.
 */
export interface PatientApi {
  startSession(): Promise<Session>;

  /** `language` = the UI language, sent as a hint to the AI (language_hint). */
  createCase(firstMessage: string, language?: Language): Promise<TurnResult>;
  sendMessage(caseId: string, text: string, language?: Language): Promise<TurnResult>;
  getCase(caseId: string): Promise<CaseDetail>;
  listCases(): Promise<CaseSummary[]>;
  closeCase(caseId: string, arrived: boolean): Promise<void>;

  /**
   * Sends the patient's confirmed location. The patient never chooses a hospital:
   * when the case needs one (EMERGENCY or HIGH), the backend assigns it automatically
   * from location + urgency + live availability, and announces it with a `referral.status` event.
   */
  setLocation(caseId: string, location: CaseLocation): Promise<void>;

  /** The LLM-generated report (latest version), as shown to the patient. */
  getReport(caseId: string): Promise<PatientReport>;

  /** Direct channel with the ED staff of the assigned hospital (one thread per referral). */
  getChat(referralId: string): Promise<ChatMessage[]>;
  /** kind: TEXT, WORSE ("I feel worse") or ANSWER (reply to a hospital QUESTION; pass questionId). */
  sendChat(referralId: string, text: string, kind?: ChatKind, questionId?: string): Promise<ChatMessage>;

  /** Map data: hospital, patient position, route, and the (simulated) ambulance if one was dispatched. */
  getTracking(caseId: string): Promise<TrackingView>;

  /** Live updates for one case. Returns an unsubscribe function. */
  subscribe(caseId: string, onEvent: (e: PatientEvent) => void): () => void;
}

const MODE = process.env.EXPO_PUBLIC_API_MODE ?? 'mock';

export const api: PatientApi = MODE === 'mock'
  ? mockApi
  : mockApi; // Step 17: replace with httpApi (Next.js backend)
