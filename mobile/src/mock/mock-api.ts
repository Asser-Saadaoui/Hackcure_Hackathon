import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PatientApi } from '@/lib/api';
import type {
  AmbulanceStatus, AmbulanceView, CaseDetail, CaseLocation, CaseSummary, ChatKind, ChatMessage, LatLng, Language,
  PatientEvent, PatientReport, Referral, Session, StructuredReport, TrackingView, Turn, TurnResult,
} from '@/lib/types';
import { Emitter } from '@/mock/emitter';
import { HOSPITALS } from '@/mock/hospitals';
import { assess, isCritical, isDegradedTrigger } from '@/mock/triage';

/**
 * In-memory mock of the Next.js backend (docs/hackcure-app.md §7.3).
 * - realistic delays, so loading states are visible
 * - the patient never chooses a hospital: EMERGENCY / HIGH + location known → automatic assignment
 *   (location + urgency + live availability), like the backend's matching
 * - simulated hospital: accepts the referral a few seconds after it is sent
 * - simulated ED chat: replies to patient messages, raises urgency on "I feel worse"
 * Data is saved on the device (AsyncStorage) so a page reload keeps your cases; pending
 * simulations (hospital answer, clinician review, ambulance) restart after a reload.
 */

const delay = (min = 300, max = 800) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
const id = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const referenceCode = () => 'HC-' + Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

/**
 * How the mock answers triage messages:
 * - 'demo'   → every message gets a simple demo reply, EXCEPT critical red flags, which the
 *              rules engine (independent of the NLP model) always turns into an emergency
 * - 'triage' → full keyword triage from triage.ts (emergency / result / follow-up questions)
 */
export const MOCK_CHAT: { mode: 'demo' | 'triage' } = { mode: 'demo' };

const DEMO_REPLY: Record<Language, (text: string) => string> = {
  fr: (t) => `Message reçu : « ${t} ». Ceci est une démo — l'assistant médical répondra ici.`,
  ar: (t) => `تم استلام رسالتك: «${t}». هذا عرض تجريبي — سيجيب المساعد الطبي هنا.`,
  darija: (t) => `وصلني الميساج متاعك: «${t}». هذا ديمو — المساعد الطبي باش يجاوبك هوني.`,
  en: (t) => `Message received: "${t}". This is a demo — the medical assistant will answer here.`,
};

/** Timings of the simulated hospital, in ms (short for the demo). */
export const MOCK_TIMING = {
  hospitalAccept: 5000,
  edReply: 3000,
  edEscalate: 4000,
  edQuestion: 4000,          // after acceptance, the ED asks the patient a question
  reportGeneration: 1500,    // simulated LLM latency
  ambulanceTick: 1000,       // one position per second
  ambulanceTripSeconds: 30,  // demo speed: hospital → patient in ~30 s
  ambulanceAtPatientSeconds: 6,
  clinicianReview: 8000,     // UNCERTAIN → a clinician reviews the case
};

const STAFF = 'Urgences · Amira (infirmière)';

const cases = new Map<string, CaseDetail>();
const chats = new Map<string, ChatMessage[]>();     // referralId → messages
const emitter = new Emitter<PatientEvent>();
/** Every live event also persists the database (all mutations emit or are followed by save()). */
const events = { emit: (e: PatientEvent) => { emitter.emit(e); save(); }, on: emitter.on.bind(emitter) };
let session: Session | null = null;

// ---------- Persistence (testing convenience: survive page reloads) ----------

const DB_KEY = 'sahhanito.mockdb';
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const db = { session, cases: [...cases.values()], chats: [...chats.entries()] };
    AsyncStorage.setItem(DB_KEY, JSON.stringify(db)).catch(() => {});
  }, 300);
}

/** Loaded once before the first API call; restarts simulations that were pending. */
const ready: Promise<void> = (async () => {
  try {
    const raw = await AsyncStorage.getItem(DB_KEY);
    if (!raw) return;
    const db = JSON.parse(raw) as { session: Session | null; cases: CaseDetail[]; chats: [string, ChatMessage[]][] };
    session = db.session;
    db.cases.forEach((c) => cases.set(c.id, c));
    db.chats.forEach(([k, v]) => chats.set(k, v));
    setTimeout(() => {
      for (const c of cases.values()) {
        if (c.status === 'UNDER_REVIEW') simulateClinicianReview(c);
        const r = c.referral;
        if (!r || c.status === 'CLOSED') continue;
        if (r.status === 'SENT') simulateHospitalAcceptance(c, r);
        if (r.status === 'ACCEPTED' && r.arrivalMode === 'AMBULANCE') startAmbulance(c, r);
      }
    }, 500);
  } catch {
    /* corrupted store → start fresh */
  }
})();

/** Clears the mock database (used by "Reset the app"). */
export async function resetMockData() {
  cases.clear(); chats.clear(); ambulances.clear(); session = null;
  await AsyncStorage.removeItem(DB_KEY);
}

function getCaseOrThrow(caseId: string) {
  const c = cases.get(caseId);
  if (!c) throw new Error(`Case ${caseId} not found`);
  return c;
}

function turn(role: Turn['role'], text: string, quickReplies?: string[]): Turn {
  return { id: id(), role, text, createdAt: now(), quickReplies };
}

function runTriage(c: CaseDetail, text: string, language: Language = 'fr'): TurnResult {
  c.turns.push(turn('PATIENT', text));

  if (MOCK_CHAT.mode === 'demo' && !isCritical(text)) {
    const reply = turn('ASSISTANT', DEMO_REPLY[language](text));
    c.turns.push(reply);
    return { kind: 'question', caseId: c.id, turn: reply };
  }

  if (isDegradedTrigger(text)) {
    const message = "Nous ne pouvons pas analyser votre message pour l'instant. En cas de douleur thoracique, difficulté à respirer, saignement important ou malaise, appelez le 190.";
    c.turns.push(turn('SYSTEM', message));
    return { kind: 'degraded', caseId: c.id, message };
  }

  const patientText = c.turns.filter((t) => t.role === 'PATIENT').map((t) => t.text).join(' ');
  const answeredQuestions = c.turns.filter((t) => t.role === 'ASSISTANT').length;
  const { decision, nextQuestion } = assess(patientText, answeredQuestions);
  c.decision = decision;
  c.level = decision.level;

  if (decision.level === 'EMERGENCY') {
    c.status = 'EMERGENCY';
    return { kind: 'emergency', caseId: c.id, decision };
  }
  if (nextQuestion) {
    const q = turn('ASSISTANT', nextQuestion.text, nextQuestion.quickReplies);
    c.turns.push(q);
    return { kind: 'question', caseId: c.id, turn: q };
  }
  if (decision.level === 'UNCERTAIN') {
    c.status = 'UNDER_REVIEW';
    simulateClinicianReview(c);
    return { kind: 'under_review', caseId: c.id, decision };
  }
  c.status = 'RESULT_READY';
  return { kind: 'result', caseId: c.id, decision };
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const etaMinutes = (km: number) => Math.max(3, Math.round((km / 30) * 60)); // 30 km/h in Tunis traffic

type Candidate = { facilityId: string; name: string; distanceKm: number; etaMinutes: number; reason: string };

/** Matching (docs §23): hard exclusions, then EMERGENCY by ETA only, others by ETA + wait + specialty. */
function rankFacilities(c: CaseDetail): Candidate[] {
  if (!c.location) throw new Error('Location required before matching');
  const specialty = c.decision?.suggestedSpecialty ?? 'EMERG';
  const needs = c.decision?.requiredEquipment ?? [];

  return HOSPITALS
    .filter((h) =>
      h.bedsAvailable > 0 &&                                   // no free beds → excluded
      needs.every((e) => h.equipment.includes(e)) &&           // e.g. scanner down → excluded
      (h.specialties.includes(specialty) || h.specialties.includes('EMERG')))
    .map((h) => {
      const d = distanceKm(c.location!, h);
      const eta = etaMinutes(d);
      const hasSpecialty = h.specialties.includes(specialty);
      const score = c.level === 'EMERGENCY' ? eta : eta + h.waitMinutes / 2 + (hasSpecialty ? 0 : 10);
      const reason = `${hasSpecialty ? specialty : 'Urgences'} · ${h.bedsAvailable} lit(s) libre(s) · ${d.toFixed(1)} km · ~${eta} min`;
      return { h, d, eta, score, reason };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((r) => ({ facilityId: r.h.id, name: r.h.name, distanceKm: Number(r.d.toFixed(1)), etaMinutes: r.eta, reason: r.reason }));
}

function addChat(referralId: string, caseId: string, m: Omit<ChatMessage, 'id' | 'referralId' | 'createdAt'>) {
  const message: ChatMessage = { id: id(), referralId, createdAt: now(), ...m };
  const list = chats.get(referralId) ?? [];
  list.push(message);
  chats.set(referralId, list);
  events.emit({ type: 'chat.message', caseId, message });
  return message;
}

function simulateHospitalAcceptance(c: CaseDetail, referral: Referral) {
  setTimeout(() => {
    if (referral.status !== 'SENT') return;
    referral.status = 'ACCEPTED';
    referral.arrivalMode = c.level === 'EMERGENCY' ? 'AMBULANCE' : 'SELF';
    referral.acceptNote = referral.arrivalMode === 'AMBULANCE'
      ? 'Une ambulance (simulée) est en route. Restez où vous êtes.'
      : 'Présentez-vous aux urgences, entrée B.';
    addChat(referral.id, c.id, { sender: 'SYSTEM', kind: 'SYSTEM', text: `Accepté par ${referral.facilityName}` });
    events.emit({ type: 'referral.status', caseId: c.id, referral: { ...referral } });
    if (referral.arrivalMode === 'AMBULANCE') startAmbulance(c, referral);
    setTimeout(() => {
      addChat(referral.id, c.id, { sender: 'STAFF', senderName: STAFF, kind: 'QUESTION',
        text: 'Prenez-vous des médicaments anticoagulants ?', options: ['Oui', 'Non', 'Je ne sais pas'] });
    }, MOCK_TIMING.edQuestion);
  }, MOCK_TIMING.hospitalAccept);
}

function createReferralFor(c: CaseDetail, facilityId: string, matchReason: string): Referral {
  const h = HOSPITALS.find((x) => x.id === facilityId);
  if (!h) throw new Error('Unknown facility');
  const d = c.location ? distanceKm(c.location, h) : 5;
  const referral: Referral = {
    id: 'ref-' + id(), caseId: c.id, facilityId, facilityName: h.name, edPhone: h.edPhone, lat: h.lat, lng: h.lng,
    status: 'SENT', arrivalMode: null, acceptNote: null, etaMinutes: etaMinutes(d), matchReason, createdAt: now(),
  };
  c.referral = referral;
  c.status = 'REFERRED';
  chats.set(referral.id, []);
  addChat(referral.id, c.id, { sender: 'SYSTEM', kind: 'SYSTEM', text: `Dossier envoyé à ${h.name}` });
  events.emit({ type: 'referral.status', caseId: c.id, referral: { ...referral } });
  simulateHospitalAcceptance(c, referral);
  return { ...referral };
}

// ---------- Simulated clinician review (docs §22) ----------

function simulateClinicianReview(c: CaseDetail) {
  setTimeout(() => {
    if (c.status !== 'UNDER_REVIEW') return;
    // Demo: the clinician raises the case to HIGH (urgent visit today).
    const decision = { ...(c.decision ?? { pFinal: 0.6, triggeredRules: [], requiredEquipment: [], suggestedSpecialty: null, rationale: '' }),
      level: 'HIGH' as const, uncertainty: 'LOW' as const, suggestedSpecialty: c.decision?.suggestedSpecialty ?? 'EMERG',
      rationale: 'Vérifié par un médecin : consultation aux urgences aujourd’hui.' };
    c.decision = decision;
    c.level = 'HIGH';
    c.status = 'RESULT_READY';
    events.emit({ type: 'case.reviewed', caseId: c.id, level: 'HIGH', decision });
    assignIfNeeded(c);
  }, MOCK_TIMING.clinicianReview);
}

// ---------- Simulated ambulance (always labeled SIMULATED in the UI) ----------

type AmbulanceSim = { route: LatLng[]; step: number; status: AmbulanceStatus; pause: number; view: AmbulanceView; tripMinutes: number };
const ambulances = new Map<string, AmbulanceSim>();   // referralId → simulation

/** Mock "road" route: interpolated points with a slight bend (the real backend uses OSRM / OpenRouteService). */
function buildRoute(from: LatLng, to: LatLng, points = 30): LatLng[] {
  const bend = { lat: (to.lng - from.lng) * 0.15, lng: -(to.lat - from.lat) * 0.15 };
  return Array.from({ length: points + 1 }, (_, i) => {
    const t = i / points, k = 4 * t * (1 - t);   // 0 at the ends, 1 in the middle
    return { lat: from.lat + (to.lat - from.lat) * t + bend.lat * k, lng: from.lng + (to.lng - from.lng) * t + bend.lng * k };
  });
}

function startAmbulance(c: CaseDetail, referral: Referral) {
  if (!c.location || ambulances.has(referral.id)) return;
  const route = buildRoute({ lat: referral.lat, lng: referral.lng }, c.location);
  const sim: AmbulanceSim = {
    route, step: 0, status: 'DISPATCHED', pause: 2, tripMinutes: referral.etaMinutes,
    view: { unitName: 'AMB-03', status: 'DISPATCHED', position: route[0], etaMinutes: referral.etaMinutes, simulated: true },
  };
  ambulances.set(referral.id, sim);
  const ticksPerLeg = Math.max(1, Math.round((MOCK_TIMING.ambulanceTripSeconds * 1000) / MOCK_TIMING.ambulanceTick));
  const stride = route.length / ticksPerLeg;
  let progress = 0;

  const timer = setInterval(() => {
    if (sim.pause > 0) { sim.pause -= MOCK_TIMING.ambulanceTick / 1000; }
    else if (sim.status === 'DISPATCHED') { sim.status = 'EN_ROUTE_TO_PATIENT'; }
    else if (sim.status === 'EN_ROUTE_TO_PATIENT' || sim.status === 'TRANSPORTING') {
      progress = Math.min(route.length - 1, progress + stride);
      sim.step = Math.floor(progress);
      if (sim.step >= route.length - 1) {
        if (sim.status === 'EN_ROUTE_TO_PATIENT') {
          sim.status = 'AT_PATIENT'; sim.pause = MOCK_TIMING.ambulanceAtPatientSeconds;
        } else {
          sim.status = 'ARRIVED';
        }
      }
    } else if (sim.status === 'AT_PATIENT') {
      sim.status = 'TRANSPORTING'; sim.route = [...route].reverse(); progress = 0; sim.step = 0;
    }

    const leg = sim.status === 'TRANSPORTING' ? sim.route : route;
    const remaining = sim.status === 'ARRIVED' ? 0 : (1 - sim.step / (leg.length - 1)) * (sim.status === 'TRANSPORTING' ? 1 : 2);
    sim.view = {
      ...sim.view,
      status: sim.status,
      position: sim.status === 'ARRIVED' ? { lat: referral.lat, lng: referral.lng } : leg[Math.min(sim.step, leg.length - 1)],
      etaMinutes: Math.max(0, Math.round(remaining * sim.tripMinutes)),
    };
    events.emit({ type: 'tracking.position', caseId: c.id, ambulance: { ...sim.view } });

    if (sim.status === 'ARRIVED') {
      clearInterval(timer);
      referral.status = 'ARRIVED';
      addChat(referral.id, c.id, { sender: 'SYSTEM', kind: 'SYSTEM', text: `Arrivé à ${referral.facilityName}` });
      events.emit({ type: 'referral.status', caseId: c.id, referral: { ...referral } });
    }
  }, MOCK_TIMING.ambulanceTick);
}

// ---------- Simulated LLM report ----------

function buildReport(c: CaseDetail): StructuredReport {
  const patientTurns = c.turns.filter((t) => t.role === 'PATIENT');
  const said = patientTurns.map((t) => t.text);
  const level = c.level ?? 'UNCERTAIN';
  const time = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const actions: Record<string, string[]> = {
    EMERGENCY: ['Appeler le 190 si ce n’est pas déjà fait.', 'Ne pas conduire. Rester accompagné.', 'Prise en charge immédiate aux urgences.'],
    HIGH: ['Se rendre aux urgences aujourd’hui.', 'Apporter la liste des médicaments en cours.'],
    LOW: ['Repos et surveillance à domicile.', 'Consulter un médecin si les symptômes persistent ou s’aggravent.'],
    UNCERTAIN: ['Un médecin vérifie la situation.', 'Appeler le 190 en cas d’aggravation.'],
  };
  return {
    summary: `Patient ayant décrit : « ${said.join(' » ; « ') || '—'} ». Niveau évalué : ${level}. ${c.decision?.rationale ?? ''}`.trim(),
    chiefComplaint: said[0] ?? '—',
    timeline: [
      ...c.turns.filter((t) => t.role !== 'SYSTEM').map((t) => ({ at: time(t.createdAt), event: t.role === 'PATIENT' ? `Patient : ${t.text}` : `Assistant : ${t.text}` })),
      ...(c.referral ? [{ at: time(c.referral.createdAt), event: `Dossier envoyé à ${c.referral.facilityName}` }] : []),
    ].slice(-8),
    positives: said,
    negatives: [],
    history: [],
    medications: [],
    redFlags: c.decision?.triggeredRules.map((r) => r.name) ?? [],
    risk: { level, pFinal: c.decision?.pFinal ?? null, uncertainty: c.decision?.uncertainty ?? 'HIGH' },
    recommendedActions: actions[level],
    openQuestions: ['Durée exacte des symptômes', 'Traitements en cours'],
    disclaimer: 'Triage assisté par IA. Les décisions cliniques appartiennent à l’équipe qui vous reçoit.',
  };
}

/** Cases that need a hospital get one assigned as soon as the location is known. */
function needsHospital(c: CaseDetail) {
  return c.status === 'EMERGENCY' || (c.status === 'RESULT_READY' && c.level === 'HIGH');
}

function assignIfNeeded(c: CaseDetail) {
  if (!c.location || c.referral || !needsHospital(c)) return;
  const [best] = rankFacilities(c);
  if (best) setTimeout(() => { if (!c.referral) createReferralFor(c, best.facilityId, best.reason); }, 800);
}

export const mockApi: PatientApi = {
  async startSession() {
    await ready;
    await delay();
    session ??= { userId: 'patient-' + id(), token: 'mock-token-' + id(), deviceId: 'device-' + id() };
    save();
    return session;
  },

  async createCase(firstMessage, language) {
    await ready;
    await delay(500, 1200);
    const c: CaseDetail = {
      id: 'case-' + id(), referenceCode: referenceCode(), status: 'TRIAGING', level: null, decision: null,
      turns: [], location: null, referral: null, createdAt: now(), closedAt: null,
    };
    cases.set(c.id, c);
    const result = runTriage(c, firstMessage, language);
    save();
    return result;
  },

  async sendMessage(caseId, text, language) {
    await ready;
    await delay(500, 1200);
    const c = getCaseOrThrow(caseId);
    const result = runTriage(c, text, language);
    assignIfNeeded(c); // location may already be known (e.g. the level rose later)
    save();
    return result;
  },

  async getCase(caseId) {
    await ready;
    await delay(150, 300);
    return structuredClone(getCaseOrThrow(caseId));
  },

  async listCases(): Promise<CaseSummary[]> {
    await ready;
    await delay(150, 300);
    return [...cases.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((c) => ({ id: c.id, referenceCode: c.referenceCode, status: c.status, level: c.level,
        facilityName: c.referral?.facilityName ?? null, createdAt: c.createdAt }));
  },

  async closeCase(caseId, arrived) {
    await ready;
    await delay();
    const c = getCaseOrThrow(caseId);
    c.status = 'CLOSED';
    c.closedAt = now();
    if (c.referral) c.referral.status = arrived ? 'ARRIVED' : 'CANCELLED';
    save();
  },

  async setLocation(caseId, location: CaseLocation) {
    await ready;
    await delay(150, 300);
    const c = getCaseOrThrow(caseId);
    c.location = location;
    assignIfNeeded(c); // automatic assignment (docs §23–24): the patient never picks a hospital
    save();
  },

  async getReport(caseId): Promise<PatientReport> {
    await ready;
    await delay(MOCK_TIMING.reportGeneration, MOCK_TIMING.reportGeneration + 500);
    const c = getCaseOrThrow(caseId);
    return {
      caseId, referenceCode: c.referenceCode, facilityName: c.referral?.facilityName ?? null,
      version: 1, author: 'AI', reviewedByClinician: false, generatedAt: now(),
      caseLink: `https://sahhanito.example/p/${c.id}`, pdfUrl: null, report: buildReport(c),
    };
  },

  async getTracking(caseId): Promise<TrackingView> {
    await ready;
    await delay(150, 300);
    const c = getCaseOrThrow(caseId);
    const r = c.referral;
    if (!r) throw new Error('No hospital assigned yet');
    const hospital = { lat: r.lat, lng: r.lng, name: r.facilityName, edPhone: r.edPhone };
    const patient = c.location ? { lat: c.location.lat, lng: c.location.lng, address: c.location.address } : null;
    const sim = ambulances.get(r.id);
    return {
      caseId, referralId: r.id, arrivalMode: r.arrivalMode, hospital, patient,
      ambulance: sim ? { ...sim.view } : null,
      route: patient ? buildRoute(hospital, patient) : [],
      distanceKm: patient ? Number(distanceKm(patient, hospital).toFixed(1)) : null,
      etaMinutes: sim ? sim.view.etaMinutes : r.etaMinutes,
    };
  },

  async getChat(referralId) {
    await ready;
    await delay(150, 300);
    return [...(chats.get(referralId) ?? [])];
  },

  async sendChat(referralId, text, kind: ChatKind = 'TEXT', questionId?: string) {
    await ready;
    await delay(200, 400);
    const c = [...cases.values()].find((x) => x.referral?.id === referralId);
    if (!c) throw new Error('Referral not found');
    const mine = addChat(referralId, c.id, { sender: 'PATIENT', kind, text, replyTo: questionId });

    if (kind === 'ANSWER') {
      setTimeout(() => addChat(referralId, c.id, { sender: 'STAFF', senderName: STAFF, kind: 'TEXT', text: 'Merci, c’est noté dans votre dossier.' }), MOCK_TIMING.edReply);
      return mine;
    }

    if (kind === 'WORSE') {
      setTimeout(() => {
        const instruction = 'Appelez le 190 maintenant et ne conduisez pas.';
        addChat(referralId, c.id, { sender: 'STAFF', senderName: STAFF, kind: 'INSTRUCTION', text: instruction });
        c.level = 'EMERGENCY';
        events.emit({ type: 'case.escalated', caseId: c.id, level: 'EMERGENCY', instruction });
      }, MOCK_TIMING.edEscalate);
    } else {
      setTimeout(() => {
        addChat(referralId, c.id, { sender: 'STAFF', senderName: STAFF, kind: 'TEXT',
          text: 'Bien reçu. Où êtes-vous maintenant ? Quelqu’un est-il avec vous ?' });
      }, MOCK_TIMING.edReply);
    }
    return mine;
  },

  subscribe(caseId, onEvent) {
    return events.on(caseId, onEvent);
  },
};
