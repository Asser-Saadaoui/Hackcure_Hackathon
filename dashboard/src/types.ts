export type Level = "EMERGENCY" | "HIGH" | "LOW" | "UNCERTAIN";
export type ReferralStatus = "SENT" | "INFO_REQUESTED" | "ACCEPTED" | "REJECTED" | "TIMED_OUT" | "CANCELLED" | "ARRIVED" | "COMPLETED" | "REROUTED";
export type Role = "ED_STAFF" | "MANAGER" | "CLINICIAN" | "ADMIN";

export interface StaffUser { id: string; email: string; name: string; role: Role; hospitalKey: string | null; hospitalName: string | null }

export interface ChatMessage {
  id: string; referralId: string; sender: "PATIENT" | "STAFF" | "SYSTEM"; senderName?: string;
  kind: "TEXT" | "QUESTION" | "ANSWER" | "INSTRUCTION" | "WORSE" | "SYSTEM" | "RED_FLAG" | "IMAGE";  // IMAGE: text = optional caption
  text: string; options?: string[]; replyTo?: string; createdAt: string;
  sha256?: string;  // IMAGE: SHA-256 of the stored photo
}

export interface ReferralRow {
  id: string; caseId: string; referenceCode: string; level: Level | null; status: ReferralStatus; arrivalMode: "SELF" | "AMBULANCE" | null;
  chiefComplaint: string; pFinal: number | null; uncertainty: string | null; suggestedSpecialty: string | null; redFlags: string[];
  etaMinutes: number; distanceKm: number | null; createdAt: string; lastMessage: ChatMessage | null;
  unread: number; patientAge: string | number | null;
}

export interface TriggeredRule { id: string; name: string; severity: "critical" | "high" | "moderate"; weight?: number; evidence?: string[]; rationale?: Record<string, string> }

export interface Report {
  summary: string; chiefComplaint: string; timeline: { at: string; event: string }[]; positives: string[]; negatives: string[];
  history: string[]; medications: string[]; redFlags: string[]; risk: { level: Level; pFinal: number | null; uncertainty: string };
  recommendedActions: string[]; openQuestions: string[]; disclaimer: string;
}

export interface Turn { id: string; role: "PATIENT" | "ASSISTANT" | "SYSTEM"; text: string; createdAt: string }

export interface Ambulance { unitName: string; status: string; etaMinutes: number; simulated: true }

export interface CaseDetail {
  referral: { id: string; facilityName: string; status: ReferralStatus; arrivalMode: "SELF" | "AMBULANCE" | null; acceptNote: string | null;
    etaMinutes: number; distanceKm: number | null; matchReason: string; createdAt: string; reason: string | null; decidedBy: string | null };
  case: {
    id: string; referenceCode: string; status: string; level: Level | null; language: string; createdAt: string;
    location: { lat: number; lng: number; address?: string } | null;
    decision: { level: Level; pFinal: number; uncertainty: string; rationale: string; suggestedSpecialty: string | null; requiredEquipment: string[] } | null;
    review: { by: string; at: string; level: Level; note: string | null } | null;
    assessment: { pNlp: number | null; nlpStatus: string; sRule: number; pFinal: number; uncertainty: string; uncertaintyReasons: string[];
      contributions: { bias: number; nlp: number; rules: number } | null; triggeredRules: TriggeredRule[] };
    actions: string[];
  };
  transcript: Turn[];
  photos?: { id: string; sha256: string; createdAt: string }[];   // triage-chat photos (not used by the AI)
  explanation: { headline: string; points: string[]; confidence: string; confidenceNote: string;
    modelFactors?: { label: string; contribution: number; direction: "up" | "down" }[]; modelSaturated?: boolean };
  patientAge: string | number | null;
  journey: { referralId: string; facilityName: string; status: ReferralStatus; statusLabel: string; reason: string | null;
    decidedBy: string | null; sentAt: string; decidedAt: string | null }[];
  report: Report;
  chat: ChatMessage[];
  ambulance: Ambulance | null;
}

export interface Availability {
  bedsAvailable: number | null; bedsTotal: number | null; icuAvailable: number | null; icuTotal: number | null; waitMinutes: number | null;
  equipmentDown: string[]; doctorsAvailable: number | null; doctorsTotal: number | null; nursesAvailable: number | null; nursesTotal: number | null;
  staffShortage: boolean | null; waitingPatients: number | null; accepting: boolean; source: "simulator" | "staff" | "unknown"; simulated: boolean;
  override: { updatedBy: string; updatedAt: string; expiresAt: string; note: string | null } | null; updatedAt: string | null;
  simulator: { bedsAvailable: number | null; icuAvailable: number | null; waitMinutes: number | null; equipmentDown: string[] } | null;
}

export interface Alternative {
  key: string; name: string; km: number; eta: number; reason: string; capable: boolean;
  bedsAvailable: number | null; waitMinutes: number | null; source: "simulator" | "staff" | "unknown";
}

export interface TriageFeedback {
  id: string; caseId: string; referralId: string | null; hospitalKey: string | null; hospitalName: string | null;
  kind: "FALSE_NEGATIVE" | "FALSE_POSITIVE"; aiLevel: Level | null; actualLevel: Level; missedSigns: string[]; note: string | null;
  reportedBy: string; createdAt: string;
  snapshot: { p_nlp: number | null; s_rule: number | null; p_final: number | null; uncertainty: string | null; rules: string[]; chief_complaint: string; language: string } | null;
}

export interface SimSettings { icu_beds: number; regular_beds: number; num_doctors: number; num_nurses: number; mean_inter_arrival_minutes: number; seed: number }
export interface SimEvent { kind: "surge" | "shortage" | "outage" | "closed" | "holds"; remainingMinutes: number; factor?: number; fraction?: number; equipment?: string; beds?: number }
export interface SimHospital {
  key: string; name: string; type: string; equipment: string[]; settings: SimSettings; defaults: SimSettings; events: SimEvent[];
  view: { bedsAvailable: number; bedsTotal: number; icuAvailable: number; icuTotal: number; waitMinutes: number; doctorsAvailable: number;
    doctorsTotal: number; nursesAvailable: number; waitingPatients: number; staffShortage: boolean; accepting: boolean; equipmentDown: string[]; simulationMinutes: number };
}
export interface Scenario {
  speed: number; paused: boolean; autoOutages: boolean; tickSeconds: number; presets: { id: string; label: string }[];
  log: { at: string; text: string }[]; hospitals: SimHospital[];
}

export interface LatLng { lat: number; lng: number }
export interface Tracking {
  caseId: string; referralId: string; status: ReferralStatus; arrivalMode: "SELF" | "AMBULANCE" | null;
  hospital: LatLng & { name: string }; patient: (LatLng & { address?: string }) | null;
  ambulance: { unitName: string; status: string; position: LatLng; etaMinutes: number; simulated: true } | null;
  route: LatLng[]; distanceKm: number | null; etaMinutes: number | null;
}

export interface Hospital { key: string; name: string; nameAr?: string; type: string; lat: number; lng: number; specialties: string[]; equipment: string[]; availability: Availability }

export interface ReviewItem {
  caseId: string; referenceCode: string; createdAt: string; language: string; chiefComplaint: string;
  decision: CaseDetail["case"]["decision"]; assessment: { p_nlp: number | null; s_rule: number; p_final: number; uncertainty: string; uncertainty_reasons: string[];
    triggered_rules: TriggeredRule[] } | null;
  transcript: Turn[]; report: Report;
}
