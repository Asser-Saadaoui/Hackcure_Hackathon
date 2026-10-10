import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/api";
import { ago, LANG, pct } from "@/lib/format";
import type { ReviewItem } from "@/types";

export function ReviewView({ items, onDone }: { items: ReviewItem[]; onDone: () => void }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function decide(caseId: string, level: "EMERGENCY" | "HIGH" | "LOW") {
    setError(null);
    try { await api.review(caseId, level, notes[caseId]); onDone(); } catch (err) { setError((err as Error).message); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dossiers à vérifier</h1>
        <p className="text-sm text-muted-foreground">Le système n'avait pas assez d'informations ou ses signaux divergeaient. Votre décision est envoyée au patient immédiatement.</p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {items.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card py-16 text-center text-sm text-muted-foreground">
          <CheckCircle2 className="h-8 w-8" />Aucun dossier en attente.
        </div>
      )}
      {items.map((it) => (
        <Card key={it.caseId}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base" dir="auto">« {it.chiefComplaint} »</CardTitle>
            <p className="text-xs text-muted-foreground">{it.referenceCode} · {ago(it.createdAt)} · {LANG[it.language] ?? it.language}
              {it.assessment && <> · p_nlp {pct(it.assessment.p_nlp)} · s_rule {pct(it.assessment.s_rule)} · p_final {pct(it.assessment.p_final)}</>}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {it.assessment?.uncertainty_reasons?.length ? <p className="text-sm text-muted-foreground">Pourquoi : {it.assessment.uncertainty_reasons.join(" ; ")}</p> : null}
            {(it.report.history.length > 0 || it.report.positives.length > 0) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Informations recueillies</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm">{it.report.history.map((x, i) => <li key={i} dir="auto">{x}</li>)}</ul></div>
                <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Symptômes reconnus</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm">{it.report.positives.map((x, i) => <li key={i} dir="auto">{x}</li>)}</ul></div>
              </div>
            )}
            <div className="space-y-1 rounded-lg bg-secondary/50 p-3">
              {it.transcript.map((t) => <p key={t.id} className="text-sm" dir="auto"><span className="font-medium">{t.role === "PATIENT" ? "Patient" : "Assistant"} :</span> {t.text}</p>)}
            </div>
            <Input placeholder="Note pour le patient (facultatif)" value={notes[it.caseId] ?? ""} onChange={(e) => setNotes({ ...notes, [it.caseId]: e.target.value })} />
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" onClick={() => decide(it.caseId, "EMERGENCY")}>Urgence vitale</Button>
              <Button className="bg-orange-500 hover:bg-orange-500/90" onClick={() => decide(it.caseId, "HIGH")}>Urgent aujourd'hui</Button>
              <Button variant="outline" onClick={() => decide(it.caseId, "LOW")}>Peu urgent</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
