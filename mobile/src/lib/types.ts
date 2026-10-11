/**
 * API types used by the patient app.
 * They mirror docs/hackcure-app.md §6 / §7 and will move to packages/shared later.
 */

export type RiskLevel = 'EMERGENCY' | 'HIGH' | 'LOW' | 'UNCERTAIN';
export type Uncertainty = 'LOW' | 'MEDIUM' | 'HIGH';
export type Language = 'darija' | 'ar' | 'fr' | 'en';

export type CaseStatus = 'TRIAGING' | 'EMERGENCY' | 'UNDER_REVIEW' | 'RESULT_READY' | 'REFERRED' | 'CLOSED';
export type ReferralStatus =
  | 'SENT' | 'INFO_REQUESTED' | 'ACCEPTED' | 'REJECTED' | 'REROUTED'
  | 'TIMED_OUT' | 'CANCELLED' | 'ARRIVED' | 'COMPLETED';
export type ArrivalMode = 'SELF' | 'AMBULANCE';
export type LocationSource = 'GPS' | 'ADJUSTED' | 'MANUAL' | 'LAST_KNOWN';

export interface Session {
  userId: string;
  token: string;
  deviceId: string;
}

export interface Turn {
  id: string;
  role: 'PATIENT' | 'ASSISTANT' | 'SYSTEM';
  text: string;
  createdAt: string;
  quickReplies?: string[];
}

export interface TriggeredRule {
  id: string;
  name: string;
  severity: 'critical' | 'high' | 'moderate';
}

/** Explainability shown to the patient in the chat: the system's reasons and the elements behind the NLP score. */
export interface PatientExplain {
  level: RiskLevel;
  reasons: string[];
  factors: { label: string; direction: 'up' | 'down'; weight: number }[];
  saturated: boolean;
}

export interface Decision {
  level: RiskLevel;
  uncertainty: Uncertainty;
  pFinal: number;
  rationale: string;
  suggestedSpecialty: string | null;
  requiredEquipment: string[];
  triggeredRules: TriggeredRule[];
}

/** What the backend answers after each patient message in the triage chat. */
export type TurnResult =
  | { kind: 'question'; caseId: string; turn: Turn }
  /** turn = the assistant's message explaining the decision in the chat (the app then shows a button). */
  | { kind: 'emergency'; caseId: string; decision: Decision; turn?: Turn; explain?: PatientExplain | null }
  | { kind: 'under_review'; caseId: string; decision: Decision; turn?: Turn; explain?: PatientExplain | null }
  | { kind: 'result'; caseId: string; decision: Decision; turn?: Turn; explain?: PatientExplain | null }
  | { kind: 'degraded'; caseId: string; message: string };

export interface CaseLocation {
  lat: number;
  lng: number;
  accuracyM?: number;
  source: LocationSource;
  address?: string;
}

export interface CaseDetail {
  id: string;
  referenceCode: string;
  status: CaseStatus;
  level: RiskLevel | null;
  decision: Decision | null;
  explain?: PatientExplain | null;
  turns: Turn[];
  location: CaseLocation | null;
  referral: Referral | null;
  createdAt: string;
  closedAt: string | null;
}

export interface CaseSummary {
  id: string;
  referenceCode: string;
  status: CaseStatus;
  level: RiskLevel | null;
  facilityName: string | null;
  createdAt: string;
}

export interface Referral {
  id: string;
  caseId: string;
  facilityId: string;
  facilityName: string;
  /** null when unknown: never show an invented number — the UI falls back to 190. */
  edPhone: string | null;
  lat: number;
  lng: number;
  status: ReferralStatus;
  arrivalMode: ArrivalMode | null;
  acceptNote: string | null;
  etaMinutes: number;
  /** Why the system assigned this hospital, shown to the patient (e.g. "Cardiology · 2 beds free · 4.2 km"). */
  matchReason: string;
  createdAt: string;
}

export type ChatKind = 'TEXT' | 'QUESTION' | 'ANSWER' | 'INSTRUCTION' | 'WORSE' | 'SYSTEM' | 'RED_FLAG' | 'IMAGE';

export interface ChatMessage {
  id: string;
  referralId: string;
  sender: 'PATIENT' | 'STAFF' | 'SYSTEM';
  senderName?: string;
  kind: ChatKind;
  text: string;
  options?: string[];         // QUESTION: answer choices (empty = free text)
  replyTo?: string;           // ANSWER: id of the QUESTION it answers
                              // IMAGE: text is the optional caption; the photo is at chatImageSource()
  createdAt: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** Structured report written by the LLM (AI /report, docs §6.3), stored and versioned by the backend. */
export interface StructuredReport {
  summary: string;
  chiefComplaint: string;
  timeline: { at: string; event: string }[];
  positives: string[];          // symptoms the patient reported
  negatives: string[];          // symptoms the patient said they don't have
  history: string[];
  medications: string[];
  redFlags: string[];           // triggered rules
  risk: { level: RiskLevel; pFinal: number | null; uncertainty: Uncertainty };
  recommendedActions: string[];
  openQuestions: string[];
  disclaimer: string;
}

export interface PatientReport {
  caseId: string;
  referenceCode: string;
  facilityName: string | null;
  version: number;
  author: 'AI' | 'CLINICIAN';
  reviewedByClinician: boolean;
  generatedAt: string;
  /** Public case page (/p/:token): encoded in the QR code, opens the case on another device. */
  caseLink: string;
  pdfUrl: string | null;
  report: StructuredReport;
}

export type AmbulanceStatus = 'DISPATCHED' | 'EN_ROUTE_TO_PATIENT' | 'AT_PATIENT' | 'TRANSPORTING' | 'ARRIVED';

export interface AmbulanceView {
  unitName: string;
  status: AmbulanceStatus;
  position: LatLng;
  etaMinutes: number;
  simulated: true;              // always shown as SIMULATED in the UI
}

/** Everything the map screen needs: hospital, patient, and (if dispatched) the ambulance. */
export interface TrackingView {
  caseId: string;
  referralId: string;
  arrivalMode: ArrivalMode | null;
  hospital: LatLng & { name: string; edPhone: string | null };
  patient: (LatLng & { address?: string }) | null;
  ambulance: AmbulanceView | null;
  /** Road route hospital → patient as a polyline (interpolated by the backend). */
  route: LatLng[];
  distanceKm: number | null;
  etaMinutes: number | null;
}

/** Live events pushed to the patient (SSE on web, polling on phones). */
export type PatientEvent =
  | { type: 'referral.status'; caseId: string; referral: Referral }
  | { type: 'chat.message'; caseId: string; message: ChatMessage }
  | { type: 'case.escalated'; caseId: string; level: RiskLevel; instruction: string | null }
  | { type: 'tracking.position'; caseId: string; ambulance: AmbulanceView }
  /** A clinician reviewed an UNCERTAIN case (approved / overrode the level). */
  | { type: 'case.reviewed'; caseId: string; level: RiskLevel; decision: Decision };
