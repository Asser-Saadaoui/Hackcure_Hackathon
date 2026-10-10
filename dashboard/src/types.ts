export type Level = "EMERGENCY" | "HIGH" | "LOW" | "UNCERTAIN";
export type ReferralStatus = "SENT" | "INFO_REQUESTED" | "ACCEPTED" | "REJECTED" | "TIMED_OUT" | "CANCELLED" | "ARRIVED" | "COMPLETED" | "REROUTED";
export type Role = "ED_STAFF" | "MANAGER" | "CLINICIAN" | "ADMIN";

export interface StaffUser { id: string; email: string; name: string; role: Role; hospitalKey: string | null; hospitalName: string | null }

export interface ChatMessage {
  id: string; referralId: string; sender: "PATIENT" | "STAFF" | "SYSTEM"; senderName?: string;
  kind: "TEXT" | "QUESTION" | "ANSWER" | "INSTRUCTION" | "WORSE" | "SYSTEM" | "RED_FLAG";
  text: string; options?: string[]; replyTo?: string; createdAt: string;
}

export interface ReferralRow {
  id: string; caseId: string; referenceCode: string; level: Level | null; status: ReferralStatus; arrivalMode: "SELF" | "AMBULANCE" | null;
  chiefComplaint: string; pFinal: number | null; uncertainty: string | null; suggestedSpecialty: string | null; redFlags: string[];
  etaMinutes: number; distanceKm: number | null; createdAt: string; lastMessage: ChatMessage | null;
}

export interface TriggeredRule { id: string; name: string; severity: "critical" | "high" | "moderate"; weight?: number; evidence?: string[] }

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

export interface Hospital { key: string; name: string; nameAr?: string; type: string; lat: number; lng: number; specialties: string[]; equipment: string[]; availability: Availability }

export interface ReviewItem {
  caseId: string; referenceCode: string; createdAt: string; language: string; chiefComplaint: string;
  decision: CaseDetail["case"]["decision"]; assessment: { p_nlp: number | null; s_rule: number; p_final: number; uncertainty: string; uncertainty_reasons: string[];
    triggered_rules: TriggeredRule[] } | null;
  transcript: Turn[]; report: Report;
}
