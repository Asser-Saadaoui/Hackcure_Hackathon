import { Platform } from 'react-native';

import type { PatientApi } from '@/lib/api';
import { connection } from '@/lib/connection';
import { getJSON, Keys, setJSON } from '@/lib/storage';
import type {
  AmbulanceView, CaseDetail, ChatMessage, PatientEvent, Referral, Session,
} from '@/lib/types';

/**
 * PatientApi over HTTP: the Sahhanito backend (backend/app/routes_patient.py).
 * Live updates: Server-Sent Events where the platform has EventSource (web), otherwise a short
 * polling loop that turns state changes into the same PatientEvent objects, so screens don't care.
 */

/** EXPO_PUBLIC_API_URL: the backend origin, or "same-origin" when the web app is served by the backend's domain. */
const CONFIGURED = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8100';   // not set: backend on this computer
export const API_CONFIGURED = true;
export const API_URL = CONFIGURED === 'same-origin' ? '' : CONFIGURED.replace(/\/$/, '');
const TIMEOUT_MS = 20_000;
const POLL_MS = 3_000;

export class HttpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function token(): Promise<string> {
  const s = await getJSON<Session>(Keys.session);
  if (s?.token) return s.token;
  return (await newSession()).token;
}

async function newSession(): Promise<Session> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}/api/v1/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: controller.signal });
    if (!res.ok) throw new HttpError(`session ${res.status}`, res.status);
    const s = (await res.json()) as Session;
    await setJSON(Keys.session, s);
    return s;
  } finally { clearTimeout(timer); }
}

async function call<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${await token()}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    connection.set(false);         // network down or timeout: show the banner; callers retry
    throw error;
  }
  connection.set(true);
  try {
    if (res.status === 401 && retry) {
      await newSession();          // session lost (reinstall, cleared data): start a new anonymous one
      return call<T>(method, path, body, false);
    }
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try { const j = await res.json(); if (typeof j.detail === 'string') message = j.detail; } catch { /* not JSON */ }
      throw new HttpError(message, res.status);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- live updates ----------

function subscribeSse(caseId: string, onEvent: (e: PatientEvent) => void) {
  let source: EventSource | null = null;
  let closed = false;
  token().then((t) => {
    if (closed) return;
    source = new EventSource(`${API_URL}/api/v1/cases/${caseId}/events?token=${encodeURIComponent(t)}`);
    source.onmessage = (m) => {
      try { onEvent(JSON.parse(m.data) as PatientEvent); } catch { /* heartbeat */ }
    };
  }).catch(() => { if (!closed) source?.close(); });
  return () => { closed = true; source?.close(); };
}

/** Native fallback: diff successive snapshots into events (referral, chat, level, ambulance). */
function subscribePolling(caseId: string, onEvent: (e: PatientEvent) => void) {
  let stopped = false;
  let last: { referral: string | null; level: string | null; status: string | null; chat: Set<string>; amb: string | null } | null = null;

  const tick = async () => {
    try {
      const c = await call<CaseDetail>('GET', `/cases/${caseId}`);
      const r = c.referral;
      const chat = r ? await call<ChatMessage[]>('GET', `/referrals/${r.id}/chat`) : [];
      let amb: AmbulanceView | null = null;
      if (r?.arrivalMode === 'AMBULANCE' && r.status === 'ACCEPTED') {
        amb = (await call<{ ambulance: AmbulanceView | null }>('GET', `/cases/${caseId}/tracking`)).ambulance;
      }
      const snap = {
        referral: r ? `${r.id}:${r.status}:${r.arrivalMode}` : null, level: c.level, status: c.status,
        chat: new Set(chat.map((m) => m.id)), amb: amb ? JSON.stringify(amb) : null,
      };
      if (last && !stopped) {
        if (r && snap.referral !== last.referral) onEvent({ type: 'referral.status', caseId, referral: r as Referral });
        chat.filter((m) => !last!.chat.has(m.id)).forEach((message) => onEvent({ type: 'chat.message', caseId, message }));
        if (c.level && c.level !== last.level) {
          if (last.status === 'UNDER_REVIEW' && c.decision) onEvent({ type: 'case.reviewed', caseId, level: c.level, decision: c.decision });
          else onEvent({ type: 'case.escalated', caseId, level: c.level, instruction: null });
        }
        if (amb && snap.amb !== last.amb) onEvent({ type: 'tracking.position', caseId, ambulance: amb });
      }
      last = snap;
    } catch {
      /* offline: try again next tick */
    }
    if (!stopped) setTimeout(tick, POLL_MS);
  };
  tick();
  return () => { stopped = true; };
}

const hasEventSource = Platform.OS === 'web' && typeof EventSource !== 'undefined';

export const httpApi: PatientApi = {
  startSession: newSession,
  createCase: (message, language) => call('POST', '/cases', { message, language: language ?? 'fr' }),
  sendMessage: (caseId, message, language) => call('POST', `/cases/${caseId}/messages`, { message, language: language ?? 'fr' }),
  getCase: (caseId) => call('GET', `/cases/${caseId}`),
  listCases: () => call('GET', '/cases'),
  closeCase: async (caseId, arrived) => { await call('POST', `/cases/${caseId}/close`, { arrived }); },
  setLocation: async (caseId, location) => { await call('PUT', `/cases/${caseId}/location`, location); },
  getReport: (caseId) => call('GET', `/cases/${caseId}/report`),
  getChat: (referralId) => call('GET', `/referrals/${referralId}/chat`),
  sendChat: (referralId, text, kind = 'TEXT', questionId) => call('POST', `/referrals/${referralId}/chat`, { text, kind, questionId }),
  getTracking: (caseId) => call('GET', `/cases/${caseId}/tracking`),
  subscribe: (caseId, onEvent) => (hasEventSource ? subscribeSse(caseId, onEvent) : subscribePolling(caseId, onEvent)),
};
