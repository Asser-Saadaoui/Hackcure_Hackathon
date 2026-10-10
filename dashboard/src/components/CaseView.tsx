import { useState } from "react";
import { Ambulance, ArrowLeft, Check, Footprints, Hospital, MapPin, ShieldAlert, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChatPanel } from "@/components/ChatPanel";
import { LevelBadge } from "@/components/LevelBadge";
import { api } from "@/api";
import { AMBULANCE, ago, EQUIPMENT, LANG, pct, STATUS, time } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CaseDetail } from "@/types";

const REJECT_REASONS = ["Plus de lit disponible", "Plateau technique indisponible", "Spécialité non assurée actuellement", "Saturation des urgences"];

function List({ items, empty = "—" }: { items: string[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return <ul className="list-disc space-y-0.5 pl-5 text-sm">{items.map((x, i) => <li key={i} dir="auto">{x}</li>)}</ul>;
}

function Bar({ label, value, hint }: { label: string; value: number | null; hint?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="font-medium">{pct(value)}</span></div>
      <div className="h-1.5 rounded-full bg-secondary"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.round((value ?? 0) * 100)}%` }} /></div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function CaseView({ detail, onBack, onChanged }: { detail: CaseDetail; onBack: () => void; onChanged: () => void }) {
  const { referral: r, case: c, report } = detail;
  const a = c.assessment;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const pending = r.status === "SENT" || r.status === "INFO_REQUESTED";
  const open = pending || r.status === "ACCEPTED";

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Patients</button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <LevelBadge level={c.level} className="text-sm" />
            <span className="font-mono text-sm text-muted-foreground">{c.referenceCode}</span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">{STATUS[r.status] ?? r.status}</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight" dir="auto">« {report.chiefComplaint} »</h1>
          <p className="text-sm text-muted-foreground">
            Reçu {ago(r.createdAt)} · langue : {LANG[c.language] ?? c.language} · {r.distanceKm ?? "?"} km, ~{r.etaMinutes} min
            {c.location && <> · <a className="inline-flex items-center gap-0.5 text-primary hover:underline" target="_blank" rel="noreferrer"
              href={`https://www.openstreetmap.org/?mlat=${c.location.lat}&mlon=${c.location.lng}#map=16/${c.location.lat}/${c.location.lng}`}><MapPin className="h-3.5 w-3.5" />position</a></>}
          </p>
        </div>
        {pending && !rejecting && (
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => run(() => api.accept(r.id, "AMBULANCE"))}><Ambulance className="mr-2 h-4 w-4" />Accepter · ambulance</Button>
            <Button disabled={busy} variant="outline" onClick={() => run(() => api.accept(r.id, "SELF"))}><Footprints className="mr-2 h-4 w-4" />Accepter · vient seul</Button>
            <Button disabled={busy} variant="ghost" onClick={() => setRejecting(true)}><X className="mr-2 h-4 w-4" />Ne peut pas recevoir</Button>
          </div>
        )}
        {r.status === "ACCEPTED" && (
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => run(() => api.arrived(r.id))}><Check className="mr-2 h-4 w-4" />Patient arrivé</Button>
            {c.level !== "EMERGENCY" && (
              <Button disabled={busy} variant="destructive" onClick={() => run(() => api.escalate(r.id, "EMERGENCY", "Appelez le 190 maintenant et ne conduisez pas."))}>
                <TriangleAlert className="mr-2 h-4 w-4" />Passer en urgence vitale
              </Button>
            )}
          </div>
        )}
      </div>

      {rejecting && (
        <Card className="border-amber-300">
          <CardContent className="space-y-3 pt-5">
            <p className="text-sm font-medium">Le dossier sera proposé automatiquement à l'hôpital adapté suivant.</p>
            <div className="flex flex-wrap gap-1.5">
              {REJECT_REASONS.map((x) => (
                <button key={x} onClick={() => setReason(x)} className={cn("rounded-full border px-3 py-1 text-sm", reason === x && "border-primary bg-accent text-accent-foreground")}>{x}</button>
              ))}
            </div>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="destructive" disabled={busy || reason.trim().length < 2} onClick={() => run(() => api.reject(r.id, reason.trim()))}>Confirmer le refus</Button>
              <Button variant="ghost" onClick={() => setRejecting(false)}>Annuler</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      {r.status === "ACCEPTED" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-accent/50 p-3 text-sm">
          {r.arrivalMode === "AMBULANCE" ? <Ambulance className="h-4 w-4 text-primary" /> : <Hospital className="h-4 w-4 text-primary" />}
          <span className="font-medium">{r.arrivalMode === "AMBULANCE" ? "Ambulance (simulée)" : "Le patient vient par ses propres moyens"}</span>
          {detail.ambulance && <span className="text-muted-foreground">· {detail.ambulance.unitName} · {AMBULANCE[detail.ambulance.status] ?? detail.ambulance.status} · ~{detail.ambulance.etaMinutes} min</span>}
          {r.decidedBy && <span className="text-muted-foreground">· accepté par {r.decidedBy}</span>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {report.redFlags.length > 0 && (
            <Card className="border-red-200 bg-red-50/60">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base text-red-800"><ShieldAlert className="h-4 w-4" />Signes d'alerte</CardTitle></CardHeader>
              <CardContent><List items={report.redFlags} /></CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Résumé du triage</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm" dir="auto">{report.summary}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Symptômes signalés</p><List items={report.positives} /></div>
                <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Absents</p><List items={report.negatives} /></div>
                <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Antécédents · informations</p><List items={report.history} /></div>
                <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Traitements</p><List items={report.medications} /></div>
              </div>
              {c.decision && (c.decision.suggestedSpecialty || c.decision.requiredEquipment.length > 0) && (
                <p className="text-sm text-muted-foreground">Orientation : <span className="font-medium text-foreground">{c.decision.suggestedSpecialty ?? "Urgences"}</span>
                  {c.decision.requiredEquipment.length > 0 && <> · plateau : {c.decision.requiredEquipment.map((e) => EQUIPMENT[e] ?? e).join(", ")}</>}</p>
              )}
              <p className="text-sm text-muted-foreground">Pourquoi cet hôpital : {r.matchReason}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Comment le niveau a été décidé</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Bar label="Modèle NLP (p_nlp)" value={a.pNlp} hint={a.pNlp == null ? `modèle : ${a.nlpStatus}` : undefined} />
                <Bar label="Moteur de règles (s_rule)" value={a.sRule} />
                <Bar label="Score fusionné (p_final)" value={a.pFinal} hint={`incertitude : ${a.uncertainty}`} />
              </div>
              {a.triggeredRules.length > 0 && (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Règle</th><th>Gravité</th><th>Mots du patient</th></tr></thead>
                  <tbody>{a.triggeredRules.map((x) => (
                    <tr key={x.id} className="border-t"><td className="py-1.5"><span className="font-mono text-xs text-muted-foreground">{x.id}</span> {x.name}</td>
                      <td><span className={cn("rounded-full px-2 py-0.5 text-xs", x.severity === "critical" ? "bg-red-100 text-red-800" : x.severity === "high" ? "bg-orange-100 text-orange-800" : "bg-secondary")}>{x.severity}</span></td>
                      <td className="text-xs" dir="auto">{(x.evidence ?? []).join(" · ") || "—"}</td></tr>))}</tbody>
                </table>
              )}
              {a.uncertaintyReasons.length > 0 && <p className="text-xs text-muted-foreground">Incertitude : {a.uncertaintyReasons.join(" ; ")}</p>}
              {c.review && <p className="text-xs text-muted-foreground">Vérifié par {c.review.by} : {c.review.note ?? c.review.level}</p>}
              <p className="text-xs text-muted-foreground">{report.disclaimer}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Conversation de triage</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              {detail.transcript.map((t) => (
                <p key={t.id} className="text-sm" dir="auto"><span className="mr-2 font-mono text-xs text-muted-foreground">{time(t.createdAt)}</span>
                  <span className="font-medium">{t.role === "PATIENT" ? "Patient" : t.role === "ASSISTANT" ? "Assistant" : "Système"} :</span> {t.text}</p>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="flex h-[640px] flex-col lg:sticky lg:top-4">
          <CardHeader className="border-b pb-3"><CardTitle className="text-base">Échange direct avec le patient</CardTitle></CardHeader>
          <div className="min-h-0 flex-1"><ChatPanel referralId={r.id} messages={detail.chat} disabled={!open} onSent={onChanged} /></div>
        </Card>
      </div>
    </div>
  );
}
