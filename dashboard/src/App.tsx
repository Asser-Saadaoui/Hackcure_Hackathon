import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, ClipboardCheck, Gauge, Inbox, LogOut, Network } from "lucide-react";
import { Brand } from "@/components/Brand";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AvailabilityView } from "@/components/AvailabilityView";
import { CaseView } from "@/components/CaseView";
import { IncomingView } from "@/components/IncomingView";
import { LoginScreen } from "@/components/LoginScreen";
import { NetworkView } from "@/components/NetworkView";
import { ReviewView } from "@/components/ReviewView";
import { api, session, setUnauthorizedHandler, subscribe } from "@/api";
import { cn } from "@/lib/utils";
import type { CaseDetail, Hospital, ReferralRow, ReviewItem, StaffUser } from "@/types";

type View = "incoming" | "availability" | "network" | "reviews";

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
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState(typeof Notification !== "undefined" && Notification.permission === "granted");
  const openRef = useRef<string | null>(null);
  openRef.current = openId;

  const isHospital = user?.role === "ED_STAFF" || user?.role === "MANAGER";
  const isClinician = user?.role === "CLINICIAN" || user?.role === "ADMIN";

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    if (!session.get()) { setBooting(false); return; }
    api.me().then(setUser).catch(() => session.clear()).finally(() => setBooting(false));
  }, []);

  useEffect(() => { if (user) setView(isHospital ? "incoming" : "reviews"); }, [user, isHospital]);

  const loadRows = useCallback(async () => {
    if (!isHospital) return;
    try { setRows(await api.referrals(scope)); setError(null); } catch (err) { setError((err as Error).message); }
  }, [isHospital, scope]);
  const loadDetail = useCallback(async () => {
    const id = openRef.current;
    if (id) { try { setDetail(await api.referral(id)); } catch (err) { setError((err as Error).message); } }
  }, []);
  const loadHospital = useCallback(async () => { if (isHospital) setHospital(await api.hospital()); }, [isHospital]);
  const loadNetwork = useCallback(async () => { const n = await api.hospitals(); setNetwork({ hospitals: n.hospitals, ok: n.simulator.ok }); }, []);
  const loadReviews = useCallback(async () => { if (isClinician) setReviews(await api.reviews()); }, [isClinician]);

  useEffect(() => { loadRows(); }, [loadRows]);
  useEffect(() => { setDetail(null); loadDetail(); }, [openId, loadDetail]);
  useEffect(() => {
    if (!user) return;
    if (view === "availability") loadHospital().catch(() => {});
    if (view === "network") loadNetwork().catch(() => {});
    if (view === "reviews") loadReviews().catch(() => {});
  }, [user, view, loadHospital, loadNetwork, loadReviews]);

  // Live events, plus a slow poll as a safety net (proxies can drop SSE).
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribe((e) => {
      if (e.type === "referral.new") {
        if (e.level === "EMERGENCY" || e.level === "HIGH") beep();
        if (alerts && document.visibilityState !== "visible") new Notification("Sahhanito · nouveau patient", { body: `Niveau : ${e.level}`, icon: "/mascot.png" });
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
  }, [user, alerts, view, loadRows, loadDetail, loadHospital, loadNetwork, loadReviews]);

  useEffect(() => {
    const waiting = rows.filter((r) => r.status === "SENT" || r.status === "INFO_REQUESTED").length;
    document.title = waiting ? `(${waiting}) Sahhanito · Urgences` : "Sahhanito · Urgences";
  }, [rows]);

  if (booting) return <div className="flex min-h-screen items-center justify-center"><img src="/mascot-thinking.png" alt="" className="h-16 w-16 animate-pulse" /></div>;
  if (!user) return <LoginScreen onLogin={setUser} />;

  const nav: { id: View; label: string; icon: typeof Inbox; show: boolean }[] = [
    { id: "incoming", label: "Patients", icon: Inbox, show: isHospital },
    { id: "availability", label: "Disponibilité", icon: Gauge, show: isHospital },
    { id: "reviews", label: "À vérifier", icon: ClipboardCheck, show: isClinician },
    { id: "network", label: "Réseau", icon: Network, show: true },
  ];

  async function logout() {
    try { await api.logout(); } catch { /* already expired */ }
    session.clear();
    setUser(null);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Brand section={user.hospitalName ?? "Régulation"} />
          <nav className="order-3 flex w-full gap-1 sm:order-none sm:ml-6 sm:w-auto">
            {nav.filter((n) => n.show).map((n) => (
              <button key={n.id} onClick={() => { setView(n.id); setOpenId(null); }}
                className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium", view === n.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
                <n.icon className="h-4 w-4" />{n.label}
                {n.id === "reviews" && reviews.length > 0 && <span className="rounded-full bg-orange-500 px-1.5 text-xs text-white">{reviews.length}</span>}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            {!alerts && typeof Notification !== "undefined" && (
              <button onClick={() => Notification.requestPermission().then((p) => setAlerts(p === "granted"))}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"><Bell className="h-3.5 w-3.5" />Activer les alertes</button>
            )}
            <span className="hidden text-muted-foreground md:inline">{user.name}</span>
            <button onClick={logout} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Se déconnecter"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <ErrorBoundary key={`${view}:${openId ?? ""}`} onReset={() => setOpenId(null)}>
        {view === "incoming" && !openId && <IncomingView rows={rows} scope={scope} onScope={setScope} onOpen={setOpenId} error={error} />}
        {view === "incoming" && openId && (detail
          ? <CaseView detail={detail} onBack={() => setOpenId(null)} onChanged={() => { loadDetail(); loadRows(); }} />
          : <p className="text-sm text-muted-foreground">Chargement du dossier…</p>)}
        {view === "availability" && hospital && <AvailabilityView hospital={hospital} onChanged={setHospital} />}
        {view === "network" && <NetworkView hospitals={network.hospitals} simulatorOk={network.ok} />}
        {view === "reviews" && <ReviewView items={reviews} onDone={() => loadReviews()} />}
        </ErrorBoundary>
      </main>
    </div>
  );
}
