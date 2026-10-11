import { t } from "@/i18n";
import { useMemo, useState } from "react";
import { Ambulance, ChevronRight, Inbox, MessageSquare, ShieldAlert, User } from "lucide-react";
import { LevelBadge } from "@/components/LevelBadge";
import { MagicCard } from "@/components/ui/magic-card";
import { Button } from "@/components/ui/button";
import { ago, LEVEL, STATUS } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Level, ReferralRow } from "@/types";

interface Props {
  rows: ReferralRow[];
  scope: "active" | "history";
  onScope: (s: "active" | "history") => void;
  onOpen: (id: string) => void;
  error: string | null;
  loading: boolean;
}

const VIEWED_KEY = "sahhanito.staff.viewed";
const LEVEL_FILTERS: { value: Level | "ALL"; label: string }[] = [
  { value: "ALL", label: "Tous" }, { value: "EMERGENCY", label: "Urgence vitale" }, { value: "HIGH", label: "Urgent" },
  { value: "UNCERTAIN", label: "À vérifier" }, { value: "LOW", label: "Peu urgent" },
];
const STATUS_FILTERS = [
  { value: "ALL", label: "Tous" }, { value: "DECIDE", label: "À décider" }, { value: "ACCEPTED", label: "Acceptés" },
] as const;

function loadViewed(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(VIEWED_KEY) ?? "[]")); } catch { return new Set(); }
}

/** Presentation filters only; server urgency and case ordering are preserved. */
export function filterReferrals(rows: ReferralRow[], query: string, level: Level | 'ALL', status: 'ALL' | 'DECIDE' | 'ACCEPTED', unreadOnly: boolean) {
  const search = query.trim().toLocaleLowerCase();
  return rows.filter(r => (level === 'ALL' || r.level === level) &&
    (!unreadOnly || r.unread > 0) &&
    (!search || `${r.referenceCode} ${r.chiefComplaint}`.toLocaleLowerCase().includes(search)) &&
    (status === 'ALL' || (status === 'DECIDE' ? r.status === 'SENT' || r.status === 'INFO_REQUESTED' : r.status === 'ACCEPTED')));
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button aria-pressed={active} onClick={onClick} className={cn("rounded-full border px-3 py-2 text-xs font-medium transition",
      active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}>{children}</button>
  );
}

export function IncomingView({ rows, scope, onScope, onOpen, error, loading }: Props) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<Level | "ALL">("ALL");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["value"]>("ALL");
  const [viewed, setViewed] = useState<Set<string>>(loadViewed);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const waiting = rows.filter((r) => r.status === "SENT" || r.status === "INFO_REQUESTED").length;
  const visible = useMemo(() => filterReferrals(rows, query, level, status, unreadOnly), [rows, level, status, query, unreadOnly]);
  const reset = () => { setQuery(""); setLevel("ALL"); setStatus("ALL"); setUnreadOnly(false); };
  const unavailable = rows.length === 0 && (!!error || loading);
  const cards = [
    {label:"Dossiers dans cette vue", count:rows.length, Icon:Inbox, active:level === "ALL" && status === "ALL" && !unreadOnly && !query, action:reset},
    ...(scope === "active" ? [{label:"À décider", count:waiting, Icon:User, active:status === "DECIDE", action:() => { reset(); setStatus("DECIDE"); }}] : []),
    {label:"Urgence vitale", count:rows.filter(r => r.level === "EMERGENCY").length, Icon:ShieldAlert, active:level === "EMERGENCY", action:() => { reset(); setLevel("EMERGENCY"); }},
    {label:"Messages à lire", count:rows.filter(r => r.unread > 0).length, Icon:MessageSquare, active:unreadOnly, action:() => { reset(); setUnreadOnly(true); }},
  ];

  function open(id: string) {
    const next = new Set(viewed).add(id);
    setViewed(next);
    try { localStorage.setItem(VIEWED_KEY, JSON.stringify([...next].slice(-500))); } catch { /* private mode */ }
    onOpen(id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("Patients orientés vers vous")}</h1>
          <p className="text-sm text-muted-foreground">
            {scope === "active" ? t("{n} en attente de décision · mise à jour en direct", {n: waiting}) : t("Dossiers terminés, refusés ou réorientés")}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          {(["active", "history"] as const).map((s) => (
            <button key={s} aria-pressed={scope === s} onClick={() => { reset(); onScope(s); }}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium", scope === s ? "bg-card shadow-sm" : "text-muted-foreground")}>
              {s === "active" ? t("En cours") : t("Historique")}
            </button>
          ))}
        </div>
      </div>

      <section aria-label={t("Vue d’ensemble de la file")} className="space-y-2">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map(({label,count,Icon,active,action}) => <MagicCard key={label} className={cn(active && "ring-2 ring-primary/40")} gradientOpacity={0.3}>
            <button type="button" className="flex min-h-32 w-full flex-col items-start gap-3 rounded-xl p-4 text-start focus-visible:ring-inset" aria-pressed={active} disabled={unavailable} onClick={action}>
              <span className="flex w-full items-center justify-between"><Icon aria-hidden="true" className={cn("h-5 w-5", label === "Urgence vitale" ? "text-destructive" : "text-primary")} /><ChevronRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" /></span>
              <span className="text-2xl font-semibold tabular-nums">{unavailable ? '—' : count}</span>
              <span className="text-xs font-medium text-muted-foreground">{t(label)}</span>
            </button>
          </MagicCard>)}
        </div>
        <p className="text-xs text-muted-foreground">{error ? t("Les compteurs peuvent être périmés.") : t("Compteurs avant filtres. Sélectionnez une carte pour filtrer la liste.")}</p>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {LEVEL_FILTERS.map((f) => (
          <Pill key={f.value} active={level === f.value} onClick={() => setLevel(f.value)}>
            {t(f.label)}{f.value !== "ALL" && ` (${rows.filter((r) => r.level === f.value).length})`}
          </Pill>
        ))}
        {scope === "active" && (
          <>
            <span className="mx-1 h-4 w-px bg-border" />
            {STATUS_FILTERS.map((f) => <Pill key={f.value} active={status === f.value} onClick={() => setStatus(f.value)}>{t(f.label)}</Pill>)}
          </>
        )}
      </div>

      <label className="block space-y-1 text-sm"><span>{t("Rechercher un dossier")}</span><input type="search" placeholder={t("Code du dossier ou symptômes décrits")} className="min-h-11 w-full rounded-lg border bg-card px-3" dir="auto" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-xs text-muted-foreground">{unavailable ? t("En attente de données") : t("{n} dossier(s) affiché(s) sur {total}", {n:visible.length,total:rows.length})}</p>
        {(query || level !== "ALL" || status !== "ALL" || unreadOnly) && <Button size="sm" variant="outline" onClick={reset}>{t("Réinitialiser les filtres")}</Button>}
      </div>
      {loading && rows.length === 0 && <p role="status">{t("Chargement…")}</p>}

      {visible.length === 0 && !error && !loading && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-16 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {rows.length > 0 ? t("Aucun dossier pour ce filtre.") : scope === "active" ? t("Aucun patient en route pour le moment.") : t("Aucun dossier.")}
          </p>
        </div>
      )}

      <ul aria-label={t("Patients orientés vers vous")} aria-busy={loading} className="space-y-2">
        {visible.map((r) => {
          const pending = r.status === "SENT" || r.status === "INFO_REQUESTED";
          const isNew = scope === "active" && !viewed.has(r.id);
          return (
            <li key={r.id}>
              <button onClick={() => open(r.id)}
                className={cn("flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-start shadow-sm transition hover:border-primary/40",
                  pending && r.level === "EMERGENCY" && "border-red-300 ring-1 ring-red-200",
                  isNew && "bg-sky-50/60")}>
                <span className={cn("h-10 w-1.5 shrink-0 rounded-full", LEVEL[r.level ?? "UNCERTAIN"].dot)} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <LevelBadge level={r.level} />
                    {isNew && <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-semibold uppercase text-white">{t("Nouveau")}</span>}
                    <span className="font-mono text-xs text-muted-foreground">{r.referenceCode}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", pending ? "bg-amber-100 text-amber-800" : "bg-secondary text-secondary-foreground")}>
                      {t(STATUS[r.status] ?? r.status)}
                    </span>
                    {r.arrivalMode === "AMBULANCE" && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Ambulance className="h-3.5 w-3.5" /> {' '}{t("ambulance (simulée)")}</span>}
                  </div>
                  <p className="line-clamp-2 text-sm font-medium" dir="auto">{r.chiefComplaint}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {r.redFlags.length > 0 && <span className="inline-flex items-center gap-1 text-red-700"><ShieldAlert className="h-3.5 w-3.5" />{r.redFlags.join(" · ")}</span>}
                    {r.patientAge && <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{r.patientAge}</span>}
                    {r.suggestedSpecialty && <span>{r.suggestedSpecialty}</span>}
                    <span>{r.distanceKm ?? "?"} km · ~{r.etaMinutes} min</span>
                    <span>{ago(r.createdAt)}</span>
                  </div>
                </div>
                {r.unread > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground" title={t("Messages du patient non lus")}>
                    <MessageSquare className="h-3.5 w-3.5" />{r.unread}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>
      {scope === "active" && rows.length > 0 && (
        <p className="text-xs text-muted-foreground">{t("Sans décision dans le délai, le dossier est automatiquement proposé à l'hôpital suivant.")}</p>
      )}
    </div>
  );
}
