import { t, useLanguage, LanguageSelect } from "@/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, ClipboardCheck, Flag, Gauge, Inbox, LogOut, Network } from "lucide-react";
import { Brand } from "@/components/Brand";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { FeedbackView } from "@/components/FeedbackView";
import { AvailabilityView } from "@/components/AvailabilityView";
import { CaseView } from "@/components/CaseView";
import { IncomingView } from "@/components/IncomingView";
import { LoginScreen } from "@/components/LoginScreen";
import { NetworkView } from "@/components/NetworkView";
import { ReviewView } from "@/components/ReviewView";
import { api, ApiError, session, setUnauthorizedHandler, subscribe } from "@/api";
import { cn } from "@/lib/utils";
import type { CaseDetail, Hospital, ReferralRow, ReviewItem, StaffUser, TriageFeedback } from "@/types";

type View = "incoming" | "availability" | "network" | "reviews" | "feedback";

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.2);
    });
  } catch { /* audio blocked until the user interacts */ }
}

export default function App() {
  const language = useLanguage();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState<View>("incoming");
  const [scope, setScope] = useState<"active" | "history">("active");
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [network, setNetwork] = useState<{ hospitals: Hospital[]; ok: boolean }>({ hospitals: [], ok: true });
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [feedback, setFeedback] = useState<TriageFeedback[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [failures, setFailures] = useState<Record<string, string | null>>({});
  const [updated, setUpdated] = useState<Record<string, string>>({});
  const requests = useRef<Record<string, number>>({});
  const [alerts, setAlerts] = useState(typeof Notification !== "undefined" && Notification.permission === "granted");
  const openRef = useRef<string | null>(null);
  openRef.current = openId;

  const isHospital = user?.role === "ED_STAFF" || user?.role === "MANAGER";
  const isClinician = user?.role === "CLINICIAN" || user?.role === "ADMIN";
  const resource = useCallback(async <T,>(key: string, fetcher: () => Promise<T>, apply: (value: T) => void) => {
    const id = (requests.current[key] ?? 0) + 1;
    requests.current[key] = id;
    setLoading(x => ({ ...x, [key]: true }));
    try {
      const value = await fetcher();
      if (requests.current[key] !== id) return;
      apply(value); setFailures(x => ({ ...x, [key]: null }));
      setLoaded(x => ({ ...x, [key]: true })); setUpdated(x => ({ ...x, [key]: new Date().toISOString() }));
    } catch (err) {
      if (requests.current[key] === id) setFailures(x => ({ ...x, [key]: (err as Error).message }));
    } finally { if (requests.current[key] === id) setLoading(x => ({ ...x, [key]: false })); }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    if (!session.get()) { setBooting(false); return; }
    api.me().then(setUser).catch(err => { if (err instanceof ApiError && err.status === 401) session.clear(); }).finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (user) return;
    Object.keys(requests.current).forEach(key => requests.current[key]++);
    setRows([]); setDetail(null); setHospital(null); setReviews([]); setFeedback([]); setOpenId(null);
    setNetwork({ hospitals: [], ok: false }); setLoading({}); setLoaded({}); setFailures({}); setUpdated({});
  }, [user]);

  useEffect(() => { if (user) setView(isHospital ? "incoming" : "reviews"); }, [user, isHospital]);

  const loadRows = useCallback(async () => {
    if (!isHospital) return;
    await resource("incoming", () => api.referrals(scope), setRows);
  }, [isHospital, scope, resource]);
  const loadDetail = useCallback(async () => {
    const id = openRef.current;
    if (id) await resource("detail", () => api.referral(id), value => { if (openRef.current === id) setDetail(value); });
  }, [resource]);
  const loadHospital = useCallback(async () => { if (isHospital) await resource("availability", api.hospital, setHospital); }, [isHospital, resource]);
  const loadNetwork = useCallback(async () => { await resource("network", api.hospitals, n => setNetwork({ hospitals: n.hospitals, ok: n.simulator.ok })); }, [resource]);
  const loadReviews = useCallback(async () => { if (isClinician) await resource("reviews", api.reviews, setReviews); }, [isClinician, resource]);
  const loadFeedback = useCallback(async () => { await resource("feedback", api.allFeedback, setFeedback); }, [resource]);

  useEffect(() => { loadRows(); }, [loadRows]);
  useEffect(() => { setDetail(null); loadDetail(); }, [openId, loadDetail]);
  useEffect(() => {
    if (!user) return;
    if (view === "availability") loadHospital().catch(() => {});
    if (view === "network") loadNetwork().catch(() => {});
    if (view === "reviews") loadReviews().catch(() => {});
    if (view === "feedback") loadFeedback();
  }, [user, view, loadHospital, loadNetwork, loadReviews, loadFeedback]);

  // Live events, plus a slow poll as a safety net (proxies can drop SSE).
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribe((e) => {
      // Ambulance monitor telemetry (every few seconds): the monitor card polls it; only an alert beeps.
      if (e.type === "iot.alert") { beep(); return; }
      if (e.type === "iot.vitals") return;
      if (e.type === "referral.new") {
        if (e.level === "EMERGENCY" || e.level === "HIGH") beep();
        if (alerts && document.visibilityState !== "visible") new Notification(`Sahhanito · ${t("Nouveau patient")}`, { body: `${t("Niveau")} : ${e.level}`, icon: "/mascot.png" });
      }
      if (e.type === "patient.worse") beep();
      if (e.type.startsWith("review.")) loadReviews().catch(() => {});
      loadRows();
      if (openRef.current && (e.referralId === openRef.current || e.type === "case.escalated")) loadDetail();
    });
    const timer = setInterval(() => {
      loadRows();
      loadDetail();
      if (view === "availability") loadHospital().catch(() => {});
      if (view === "network") loadNetwork().catch(() => {});
      if (view === "reviews") loadReviews().catch(() => {});
    }, 20000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [user, alerts, view, loadRows, loadDetail, loadHospital, loadNetwork, loadReviews, language]);

  useEffect(() => {
    const waiting = rows.filter((r) => r.status === "SENT" || r.status === "INFO_REQUESTED").length;
    document.title = waiting ? `(${waiting}) Sahhanito · Urgences` : "Sahhanito · Urgences";
  }, [rows]);

  if (booting) return <div className="flex min-h-screen items-center justify-center"><p role="status">{t("Chargement…")}</p></div>;
  if (!user) return <LoginScreen onLogin={setUser} />;

  const nav: { id: View; label: string; icon: typeof Inbox; show: boolean }[] = [
    { id: "incoming", label: t("Patients"), icon: Inbox, show: isHospital },
    { id: "availability", label: t("Disponibilité"), icon: Gauge, show: isHospital },
    { id: "reviews", label: t("À vérifier"), icon: ClipboardCheck, show: isClinician },
    { id: "feedback", label: t("Retours"), icon: Flag, show: isClinician },
    { id: "network", label: t("Réseau"), icon: Network, show: true },
  ];

  async function logout() {
    try { await api.logout(); } catch { /* already expired */ }
    session.clear();
    Object.keys(requests.current).forEach(key => requests.current[key]++);
    setRows([]); setDetail(null); setHospital(null); setReviews([]); setFeedback([]); setNetwork({ hospitals: [], ok: false });
    setLoaded({}); setFailures({}); setUpdated({}); setOpenId(null);
    setUser(null);
  }

  return (
    <div className="min-h-screen bg-background">
      <a className="skip-link" href="#main-content">{t("Aller au contenu")}</a>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Brand section={user.hospitalName ?? t("Régulation")} />
          <nav aria-label={t("Urgences")} className="order-3 flex w-full flex-wrap gap-1 sm:order-none sm:ms-6 sm:w-auto">
            {nav.filter((n) => n.show).map((n) => (
              <button key={n.id} aria-current={view === n.id ? 'page' : undefined} onClick={() => { setView(n.id); setOpenId(null); setError(null); }}
                className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium", view === n.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
                <n.icon className="h-4 w-4" />{t(n.label)}
                {n.id === "reviews" && reviews.length > 0 && <span className="rounded-full bg-orange-500 px-1.5 text-xs text-white">{reviews.length}</span>}
              </button>
            ))}
          </nav>
          <div className="ms-auto flex flex-wrap items-center gap-2 text-sm">
            <LanguageSelect />
            {!alerts && typeof Notification !== "undefined" && (
              <button onClick={() => Notification.requestPermission().then((p) => setAlerts(p === "granted"))}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"><Bell className="h-3.5 w-3.5" />{t("Activer les alertes")}</button>
            )}
            <span className="hidden text-muted-foreground md:inline">{user.name}</span>
            <button onClick={logout} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={t("Se déconnecter")}><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span role="status">{loading[openId ? 'detail' : view] ? t("Chargement…") : updated[openId ? "detail" : view] ? `${t("Dernière mise à jour")} · ${new Date(updated[openId ? "detail" : view]).toLocaleTimeString(language === 'fr' ? 'fr-TN' : language === 'en' ? 'en-GB' : 'ar-TN', { hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}</span>
          <button className="rounded-lg border bg-card px-3 py-2" disabled={loading[openId ? 'detail' : view]} onClick={() => {
            if (openId) loadDetail(); else if (view === 'incoming') loadRows(); else if (view === 'network') loadNetwork(); else if (view === 'availability') loadHospital(); else if (view === 'reviews') loadReviews(); else loadFeedback();
          }}>{t("Actualiser")}</button>
        </div>
        {(failures[openId ? 'detail' : view] || error) && <div role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-semibold">{t("Données non actualisées")}</p><p>{t(failures[openId ? 'detail' : view] || error || '')}</p>
        </div>}
        <ErrorBoundary key={`${view}:${openId ?? ""}`} onReset={() => setOpenId(null)}>
        {view === "incoming" && !openId && <IncomingView rows={rows} scope={scope} loading={loading.incoming || !loaded.incoming && !failures.incoming} onScope={s => { if (s !== scope) { requests.current.incoming = (requests.current.incoming ?? 0) + 1; setRows([]); setLoading(x => ({ ...x, incoming: true })); setScope(s); } }} onOpen={setOpenId} error={failures.incoming ?? null} />}
        {view === "incoming" && openId && (detail
          ? <CaseView detail={detail} onBack={() => setOpenId(null)} onChanged={() => { loadDetail(); loadRows(); }} />
          : !failures.detail && <p role="status" className="text-sm text-muted-foreground">{t("Chargement du dossier…")}</p>)}
        {view === "availability" && hospital && <AvailabilityView hospital={hospital} onChanged={setHospital} />}
        {!loaded[view] && !failures[view] && view !== 'incoming' && <p role="status">{t("Chargement…")}</p>}
        {view === "network" && loaded.network && <NetworkView hospitals={network.hospitals} simulatorOk={network.ok} />}
        {view === "reviews" && loaded.reviews && <ReviewView items={reviews} onDone={() => loadReviews()} />}
        {view === "feedback" && loaded.feedback && <FeedbackView items={feedback} onError={setError} />}
        </ErrorBoundary>
      </main>
    </div>
  );
}
