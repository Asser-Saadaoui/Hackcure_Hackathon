import { Download, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LevelBadge } from "@/components/LevelBadge";
import { downloadFeedbackCsv } from "@/api";
import { ago, pct } from "@/lib/format";
import type { TriageFeedback } from "@/types";

/** Clinicians / AI team: every false negative (and over-triage) reported by the hospitals. */
export function FeedbackView({ items, onError }: { items: TriageFeedback[]; onError: (m: string) => void }) {
  const fn = items.filter((i) => i.kind === "FALSE_NEGATIVE").length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Retours sur le triage</h1>
          <p className="text-sm text-muted-foreground">{fn} faux négatif(s) · {items.length - fn} surévaluation(s). À transmettre à l'équipe IA pour corriger les règles et le modèle.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadFeedbackCsv().catch((e) => onError((e as Error).message))}><Download className="mr-1.5 h-4 w-4" />Exporter (CSV)</Button>
      </div>
      {items.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card py-16 text-center text-sm text-muted-foreground"><Flag className="h-8 w-8" />Aucun signalement.</div>
      )}
      <ul className="space-y-2">
        {items.map((f) => (
          <li key={f.id} className="space-y-1.5 rounded-xl border bg-card p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={f.kind === "FALSE_NEGATIVE" ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800" : "rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800"}>
                {f.kind === "FALSE_NEGATIVE" ? "Faux négatif" : "Surévalué"}
              </span>
              <LevelBadge level={f.aiLevel} /> <span className="text-muted-foreground">→</span> <LevelBadge level={f.actualLevel} />
              <span className="text-xs text-muted-foreground">{f.hospitalName ?? f.hospitalKey} · {f.reportedBy} · {ago(f.createdAt)}</span>
            </div>
            {f.snapshot && <p className="font-medium">{f.snapshot.chief_complaint}</p>}
            {f.missedSigns.length > 0 && <p><span className="text-muted-foreground">Signes manqués :</span> {f.missedSigns.join(", ")}</p>}
            {f.note && <p className="text-muted-foreground" dir="auto">{f.note}</p>}
            {f.snapshot && (
              <p className="text-xs text-muted-foreground">p_nlp {pct(f.snapshot.p_nlp)} · s_rule {pct(f.snapshot.s_rule)} · p_final {pct(f.snapshot.p_final)} · incertitude {f.snapshot.uncertainty ?? "—"}
                {f.snapshot.rules.length > 0 && ` · règles ${f.snapshot.rules.join(", ")}`} · langue {f.snapshot.language}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
