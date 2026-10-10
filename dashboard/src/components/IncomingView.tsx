import { Ambulance, ChevronRight, Inbox, MessageSquare, ShieldAlert } from "lucide-react";
import { LevelBadge } from "@/components/LevelBadge";
import { ago, LEVEL, STATUS } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReferralRow } from "@/types";

interface Props {
  rows: ReferralRow[];
  scope: "active" | "history";
  onScope: (s: "active" | "history") => void;
  onOpen: (id: string) => void;
  error: string | null;
}

export function IncomingView({ rows, scope, onScope, onOpen, error }: Props) {
  const waiting = rows.filter((r) => r.status === "SENT" || r.status === "INFO_REQUESTED").length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Patients orientés vers vous</h1>
          <p className="text-sm text-muted-foreground">
            {scope === "active" ? `${waiting} en attente de décision · mise à jour en direct` : "Dossiers terminés, refusés ou réorientés"}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          {(["active", "history"] as const).map((s) => (
            <button key={s} onClick={() => onScope(s)}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium", scope === s ? "bg-card shadow-sm" : "text-muted-foreground")}>
              {s === "active" ? "En cours" : "Historique"}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      {rows.length === 0 && !error && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-16 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{scope === "active" ? "Aucun patient en route pour le moment." : "Aucun dossier."}</p>
        </div>
      )}

      <ul className="space-y-2">
        {rows.map((r) => {
          const pending = r.status === "SENT" || r.status === "INFO_REQUESTED";
          return (
            <li key={r.id}>
              <button onClick={() => onOpen(r.id)}
                className={cn("flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/40",
                  pending && r.level === "EMERGENCY" && "border-red-300 ring-1 ring-red-200")}>
                <span className={cn("h-10 w-1.5 shrink-0 rounded-full", LEVEL[r.level ?? "UNCERTAIN"].dot)} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <LevelBadge level={r.level} />
                    <span className="font-mono text-xs text-muted-foreground">{r.referenceCode}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", pending ? "bg-amber-100 text-amber-800" : "bg-secondary text-secondary-foreground")}>
                      {STATUS[r.status] ?? r.status}
                    </span>
                    {r.arrivalMode === "AMBULANCE" && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Ambulance className="h-3.5 w-3.5" /> ambulance (simulée)</span>}
                  </div>
                  <p className="truncate text-sm font-medium">« {r.chiefComplaint} »</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {r.redFlags.length > 0 && <span className="inline-flex items-center gap-1 text-red-700"><ShieldAlert className="h-3.5 w-3.5" />{r.redFlags.join(" · ")}</span>}
                    {r.suggestedSpecialty && <span>{r.suggestedSpecialty}</span>}
                    <span>{r.distanceKm ?? "?"} km · ~{r.etaMinutes} min</span>
                    <span>{ago(r.createdAt)}</span>
                    {r.lastMessage?.sender === "PATIENT" && <span className="inline-flex items-center gap-1 text-primary"><MessageSquare className="h-3.5 w-3.5" />nouveau message</span>}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>
      {scope === "active" && rows.length > 0 && (
        <p className="text-xs text-muted-foreground">Sans décision dans le délai, le dossier est automatiquement proposé à l'hôpital suivant.</p>
      )}
    </div>
  );
}
