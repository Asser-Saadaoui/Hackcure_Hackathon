import type { Alternative, CaseDetail, ChatMessage, Hospital, ReferralRow, ReviewItem, Scenario, SimSettings, StaffUser, TriageFeedback } from "@/types";

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const TOKEN_KEY = "sahhanito.staff.token";

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export const session = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* private mode */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } },
};

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = session.get();
  let resp: Response;
  try {
    resp = await fetch(`${BASE}/api/v1${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Serveur injoignable. Vérifiez la connexion.", 0);
  }
  if (resp.status === 401 && path !== "/staff/login") { session.clear(); onUnauthorized(); }
  if (!resp.ok) {
    let message = `Erreur ${resp.status}`;
    try { const j = await resp.json(); message = typeof j.detail === "string" ? j.detail : message; } catch { /* not JSON */ }
    throw new ApiError(message, resp.status);
  }
  return resp.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) => call<{ token: string; user: StaffUser }>("POST", "/staff/login", { email, password }),
  logout: () => call<{ ok: boolean }>("POST", "/staff/logout"),
  me: () => call<StaffUser>("GET", "/staff/me"),
  referrals: (scope: "active" | "history") => call<ReferralRow[]>("GET", `/staff/referrals?scope=${scope}`),
  referral: (id: string) => call<CaseDetail>("GET", `/staff/referrals/${id}`),
  accept: (id: string, arrivalMode: "SELF" | "AMBULANCE", note?: string) => call<CaseDetail>("POST", `/staff/referrals/${id}/accept`, { arrivalMode, note }),
  reject: (id: string, reason: string, explanation: string) => call<{ ok: boolean }>("POST", `/staff/referrals/${id}/reject`, { reason, explanation }),
  alternatives: (id: string) => call<Alternative[]>("GET", `/staff/referrals/${id}/alternatives`),
  reroute: (id: string, facilityKey: string | null, reason: string, explanation: string) =>
    call<{ ok: boolean; facilityName: string | null }>("POST", `/staff/referrals/${id}/reroute`, { facilityKey, reason, explanation }),
  arrived: (id: string) => call<CaseDetail>("POST", `/staff/referrals/${id}/arrived`),
  escalate: (id: string, level: "EMERGENCY" | "HIGH", instruction?: string) => call<CaseDetail>("POST", `/staff/referrals/${id}/escalate`, { level, instruction }),
  chat: (id: string, text: string, kind: "TEXT" | "QUESTION" | "INSTRUCTION", options?: string[]) =>
    call<ChatMessage>("POST", `/staff/referrals/${id}/chat`, { text, kind, options }),
  hospital: () => call<Hospital>("GET", "/staff/hospital"),
  savedReplies: () => call<{ replies: string[]; updatedBy: string | null }>("GET", "/staff/hospital/replies"),
  setSavedReplies: (replies: string[]) => call<{ replies: string[]; updatedBy: string | null }>("PUT", "/staff/hospital/replies", { replies }),
  setAvailability: (body: Record<string, unknown>) => call<Hospital>("PUT", "/staff/hospital/availability", body),
  clearAvailability: () => call<Hospital>("DELETE", "/staff/hospital/availability"),
  hospitals: () => call<{ simulator: { ok: boolean }; hospitals: Hospital[] }>("GET", "/staff/hospitals"),
  feedbackOptions: () => call<{ missedSigns: string[] }>("GET", "/staff/feedback/options"),
  reportFeedback: (id: string, body: { kind: "FALSE_NEGATIVE" | "FALSE_POSITIVE"; actualLevel: "EMERGENCY" | "HIGH" | "LOW"; missedSigns: string[]; note?: string }) =>
    call<TriageFeedback>("POST", `/staff/referrals/${id}/feedback`, body),
  caseFeedback: (id: string) => call<TriageFeedback[]>("GET", `/staff/referrals/${id}/feedback`),
  allFeedback: () => call<TriageFeedback[]>("GET", "/staff/feedback"),
  scenario: () => call<Scenario>("GET", "/staff/sim/scenario"),
  setScenario: (body: { speed?: number; paused?: boolean; autoOutages?: boolean }) => call<Scenario>("PUT", "/staff/sim/scenario", body),
  stepScenario: (minutes: number) => call<Scenario>("POST", "/staff/sim/scenario/step", { minutes }),
  resetScenario: () => call<Scenario>("POST", "/staff/sim/scenario/reset", {}),
  presetScenario: (id: string) => call<Scenario>("POST", `/staff/sim/scenario/preset/${id}`, {}),
  addSimEvent: (body: Record<string, unknown>) => call<Scenario>("POST", "/staff/sim/scenario/events", body),
  clearSimEvents: (hospital?: string) => call<Scenario>("DELETE", `/staff/sim/scenario/events${hospital ? `?hospital=${hospital}` : ""}`),
  setSimSettings: (key: string, settings: Omit<SimSettings, "seed"> & { seed?: number }) => call<Scenario>("PUT", `/staff/sim/hospitals/${key}/settings`, settings),
  reviews: () => call<ReviewItem[]>("GET", "/staff/reviews"),
  review: (caseId: string, level: "EMERGENCY" | "HIGH" | "LOW", note?: string) => call<{ ok: boolean }>("POST", `/staff/reviews/${caseId}`, { level, note }),
};

/** Staff PDF report: fetched with the session header (never a token in the URL), opened in a new tab. */
export async function openReportPdf(referralId: string): Promise<void> {
  const tab = window.open("", "_blank");
  const resp = await fetch(`${BASE}/api/v1/staff/referrals/${referralId}/report.pdf`, { headers: { Authorization: `Bearer ${session.get() ?? ""}` } });
  if (!resp.ok) { tab?.close(); throw new ApiError(`Erreur ${resp.status}`, resp.status); }
  const url = URL.createObjectURL(await resp.blob());
  if (tab) tab.location.href = url; else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** HL7 FHIR R4 document Bundle of the case, downloaded as JSON for import into the hospital's own system. */
export async function downloadFhir(referralId: string, referenceCode: string): Promise<void> {
  const resp = await fetch(`${BASE}/api/v1/staff/referrals/${referralId}/fhir`, { headers: { Authorization: `Bearer ${session.get() ?? ""}` } });
  if (!resp.ok) throw new ApiError(`Erreur ${resp.status}`, resp.status);
  const url = URL.createObjectURL(await resp.blob());
  const link = Object.assign(document.createElement("a"), { href: url, download: `sahhanito-${referenceCode}-fhir.json` });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Triage feedback as CSV (clinicians / AI team). */
export async function downloadFeedbackCsv(): Promise<void> {
  const resp = await fetch(`${BASE}/api/v1/staff/feedback.csv`, { headers: { Authorization: `Bearer ${session.get() ?? ""}` } });
  if (!resp.ok) throw new ApiError(`Erreur ${resp.status}`, resp.status);
  const url = URL.createObjectURL(await resp.blob());
  const link = Object.assign(document.createElement("a"), { href: url, download: "sahhanito-triage-feedback.csv" });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Live events (SSE). EventSource reconnects by itself; the token goes in the query string. */
export function subscribe(onEvent: (e: { type: string; [k: string]: unknown }) => void): () => void {
  const token = session.get();
  if (!token) return () => {};
  const source = new EventSource(`${BASE}/api/v1/staff/events?token=${encodeURIComponent(token)}`);
  source.onmessage = (m) => { try { onEvent(JSON.parse(m.data)); } catch { /* heartbeat */ } };
  return () => source.close();
}
