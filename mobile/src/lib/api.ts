import type {
  CasePhoto,
  CaseDetail, Language, CaseLocation, CaseSummary, ChatKind, ChatMessage,
  PatientEvent, PatientReport, Session, TrackingView, TurnResult,
} from '@/lib/types';
import { httpApi } from '@/lib/http-api';

/**
 * Everything the patient app needs from the backend.
 * Screens only use this interface, so the transport can change without touching any screen.
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
  /** Photo added in the triage chat, kept for the hospital team. Never sent to the AI (no effect on the triage). */
  addCasePhoto(caseId: string, base64: string): Promise<CasePhoto>;
  /** Photo for the ED team, base64 JPEG/PNG/WebP (max 8 MB). Never read by the AI. */
  sendChatImage(referralId: string, base64: string, caption?: string): Promise<ChatMessage>;

  /** Map data: hospital, patient position, route, and the (simulated) ambulance if one was dispatched. */
  getTracking(caseId: string): Promise<TrackingView>;

  /** Live updates for one case. Returns an unsubscribe function. */
  subscribe(caseId: string, onEvent: (e: PatientEvent) => void): () => void;
}

/** The Sahhanito backend (EXPO_PUBLIC_API_URL; see lib/http-api.ts). */
export const api: PatientApi = httpApi;
