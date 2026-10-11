import { t } from "@/i18n";
import { useState } from "react";
import {
  Ambulance, ArrowLeft, ArrowRightLeft, Check, ChevronDown, Clock, FileJson, FileText, Footprints, Hospital, MapPin, ShieldAlert,
  Flag, TriangleAlert, User, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ChatPanel } from "@/components/ChatPanel";
import { LevelBadge } from "@/components/LevelBadge";
import { LiveTrackingMap } from "@/components/LiveTrackingMap";
import { FeedbackPanel } from "@/components/FeedbackPanel";
import { ReroutePanel } from "@/components/ReroutePanel";
import { ReferralOptions } from "@/components/ReferralOptions";
import { VerifiedPhoto } from "@/components/VerifiedPhoto";
import { AmbulanceMonitor } from "@/components/AmbulanceMonitor";
import { api, downloadFhir, openReportPdf } from "@/api";
import { AMBULANCE, ago, EQUIPMENT, LANG, pct, STATUS, time } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CaseDetail } from "@/types";

const REJECT_REASONS = ["Plus de lit disponible", "Plateau technique indisponible", "Spécialité non assurée actuellement", "Saturation des urgences"];

function List({ items, empty = "—" }: { items: string[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return <ul className="list-disc space-y-0.5 ps-5 text-sm">{items.map((x, i) => <li key={i} dir="auto">{x}</li>)}</ul>;
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

/** Diverging bars: how much each element moved the NLP score (right = towards emergency). */
function ModelFactors({ factors }: { factors: { label: string; contribution: number; direction: "up" | "down" }[] }) {
  const max = Math.max(...factors.map((f) => Math.abs(f.contribution)), 0.05);
  return (
    <div className="space-y-1.5 rounded-lg border p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{t("Ce qui a pesé sur le modèle de langage")}</p>
      {factors.map((f) => {
        const width = `${Math.round((Math.abs(f.contribution) / max) * 50)}%`;
        return (
          <div key={f.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_3.5rem] items-center gap-2 text-sm">
            <span className="truncate" title={f.label}>{f.label}</span>
            <div className="relative h-2.5 rounded-full bg-secondary">
              <span className="absolute left-1/2 top-[-3px] h-[16px] w-px bg-border" />
              <span className={cn("absolute top-0 h-2.5 rounded-full", f.direction === "up" ? "left-1/2 bg-red-500" : "right-1/2 bg-emerald-500")} style={{ width }} />
            </div>
            <span className={cn("text-right text-xs tabular-nums", f.direction === "up" ? "text-red-700" : "text-emerald-700")}>
              {f.contribution > 0 ? "+" : ""}{Math.round(f.contribution * 100)} pts
            </span>
          </div>
        );
      })}
      <p className="text-[11px] text-muted-foreground">{t("Variation du score du modèle quand l'élément est retiré du dossier. → vers l'urgence · ← vers « non urgent ». Indicatif, non calibré cliniquement.")}</p>
    </div>
  );
}

function Fact({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{children}</span>;
}

export function CaseView({ detail, onBack, onChanged }: { detail: CaseDetail; onBack: () => void; onChanged: () => void }) {
  const { referral: r, case: c, report, explanation: why } = detail;
  const photos = detail.photos ?? [];   // added during triage; never used by the AI
  const a = c.assessment;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [moved, setMoved] = useState<string | null>(null);
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const [explanation, setExplanation] = useState("");
  const [tab, setTab] = useState("summary");
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const pending = r.status === "SENT" || r.status === "INFO_REQUESTED";
  const open = pending || r.status === "ACCEPTED";
  const criticalFlags = a.triggeredRules.filter((x) => x.severity === "critical");

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
      {/* Sticky header: who, how urgent, when, and the decision buttons — always visible */}
      <div className="sticky top-0 z-20 -mx-4 space-y-2 border-b bg-background/95 px-4 pb-3 pt-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> {' '}{t("Patients")}</button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setReporting(true); setReported(false); }} title={t("Le niveau donné par Sahhanito était faux")}>
              <Flag className="me-1.5 h-4 w-4" />{t("Signaler un faux négatif")}{' '}</Button>
            <Button variant="outline" size="sm" title={t("HL7 FHIR R4 (Bundle document) à importer dans le dossier patient de l'hôpital")}
              onClick={() => downloadFhir(r.id, c.referenceCode).catch((err) => setError((err as Error).message))}>
              <FileJson className="me-1.5 h-4 w-4" />{t("Export FHIR")}{' '}</Button>
            <Button variant="outline" size="sm" onClick={() => openReportPdf(r.id).catch((err) => setError((err as Error).message))}>
              <FileText className="me-1.5 h-4 w-4" />{t("Rapport PDF")}{' '}</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LevelBadge level={c.level} className="text-sm" />
          <span className="font-mono text-sm text-muted-foreground">{c.referenceCode}</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">{t(STATUS[r.status] ?? r.status)}</span>
          {detail.patientAge && <Fact icon={User}>{detail.patientAge}</Fact>}
          <Fact icon={Clock}>{r.distanceKm ?? "?"} km · ~{detail.ambulance ? detail.ambulance.etaMinutes : r.etaMinutes} min</Fact>
          {r.arrivalMode && <Fact icon={r.arrivalMode === "AMBULANCE" ? Ambulance : Footprints}>{r.arrivalMode === "AMBULANCE" ? t("Ambulance (simulée)") : t("Vient seul")}</Fact>}
          <span className="text-xs text-muted-foreground">{t("reçu")}{ago(r.createdAt)} · {t(LANG[c.language] ?? c.language)}</span>
        </div>
        <p className="truncate text-base font-semibold" dir="auto">{report.chiefComplaint}</p>
        {criticalFlags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {criticalFlags.map((x) => (
              <span key={x.id} className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800">
                <ShieldAlert className="h-3.5 w-3.5" />{x.rationale?.fr ?? x.name}
              </span>
            ))}
          </div>
        )}
        {pending && !rejecting && !rerouting && (
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => run(() => api.accept(r.id, "AMBULANCE"))}><Ambulance className="me-2 h-4 w-4" />{t("Accepter · ambulance")}</Button>
            <Button disabled={busy} variant="outline" onClick={() => run(() => api.accept(r.id, "SELF"))}><Footprints className="me-2 h-4 w-4" />{t("Accepter · vient seul")}</Button>
            <Button disabled={busy} variant="ghost" onClick={() => setRerouting(true)}><ArrowRightLeft className="me-2 h-4 w-4" />{t("Réorienter")}</Button>
            <Button disabled={busy} variant="ghost" onClick={() => setRejecting(true)}><X className="me-2 h-4 w-4" />{t("Ne peut pas recevoir")}</Button>
          </div>
        )}
        {r.status === "ACCEPTED" && !rerouting && (
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => run(() => api.arrived(r.id))}><Check className="me-2 h-4 w-4" />{t("Patient arrivé")}</Button>
            <Button disabled={busy} variant="outline" onClick={() => setRerouting(true)}><ArrowRightLeft className="me-2 h-4 w-4" />{t("Réorienter")}</Button>
            {c.level !== "EMERGENCY" && (
              <Button disabled={busy} variant="destructive" onClick={() => run(() => api.escalate(r.id, "EMERGENCY", t("Appelez le 190 maintenant et ne conduisez pas.")))}>
                <TriangleAlert className="me-2 h-4 w-4" />{t("Passer en urgence vitale")}{' '}</Button>
            )}
          </div>
        )}
      </div>

      {reporting && (
        <FeedbackPanel referralId={r.id} aiLevel={c.level} onCancel={() => setReporting(false)}
          onDone={() => { setReporting(false); setReported(true); }} />
      )}
      {reported && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{t("Merci : le signalement est transmis à l'équipe IA.")}</p>}
      {moved && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{t("Patient réorienté vers")}{' '}{moved}{t(". Le dossier reste consultable dans l'historique.")}</p>}
      {rerouting && (
        <ReroutePanel referralId={r.id} accepted={r.status === "ACCEPTED"} onCancel={() => setRerouting(false)}
          onDone={(name) => { setRerouting(false); setMoved(name ?? t("un autre hôpital")); onChanged(); }} />
      )}
      {rejecting && (
        <Card className="border-amber-300">
          <CardContent className="space-y-3 pt-5">
            <p className="text-sm font-medium">{t("Le dossier sera proposé automatiquement à l'hôpital adapté suivant.")}</p>
            <div className="flex flex-wrap gap-1.5">
              {REJECT_REASONS.map((x) => (
                <button key={x} onClick={() => setReason(x)} className={cn("rounded-full border px-3 py-1 text-sm", reason === x && "border-primary bg-accent text-accent-foreground")}>{t(x)}</button>
              ))}
            </div>
            <Textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} maxLength={1000} rows={3}
              placeholder={t("Expliquez pourquoi vous ne pouvez pas recevoir ce patient (obligatoire).")} />
            <p className="text-xs text-muted-foreground">
              {explanation.trim().length < 10 ? t("Au moins 10 caractères.") : t("Journalisé et transmis à l'hôpital suivant. Le patient reçoit seulement un message neutre.")}
            </p>
            <div className="flex gap-2">
              <Button variant="destructive" disabled={busy || explanation.trim().length < 10} onClick={() => run(() => api.reject(r.id, reason, explanation.trim()))}>{t("Confirmer le refus")}</Button>
              <Button variant="ghost" onClick={() => setRejecting(false)}>{t("Annuler")}</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{t(error)}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Tabs defaultValue="summary" value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="summary">{t("Résumé")}</TabsTrigger>
            <TabsTrigger value="conversation">{t("Conversation")}</TabsTrigger>
            <TabsTrigger value="journey">{t("Parcours")}{detail.journey.length > 1 ? ` (${detail.journey.length})` : ""}</TabsTrigger>
            <TabsTrigger value="report">{t("Rapport")}</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-4 pt-4">
            {c.location && <LiveTrackingMap referralId={r.id} />}
            {detail.ambulance && <AmbulanceMonitor referralId={r.id} />}
            {photos.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t("Photos du patient ({n})", { n: photos.length })}</CardTitle>
                  <p className="text-xs text-muted-foreground">{t("Ajoutées pendant le triage. Non utilisées par l’IA : elles n’ont pas influencé le niveau.")}</p>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  {photos.map((p) => (
                    <div key={p.id} className="space-y-1">
                      <VerifiedPhoto path={`/referrals/${r.id}/photos/${p.id}`} sha256={p.sha256} />
                      <p className="text-[10px] text-muted-foreground">{time(p.createdAt)}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {/* Why this level, in plain words; numbers only on demand */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">{t("Pourquoi ce niveau")}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm font-medium" dir="auto">{why.headline}</p>
                <List items={why.points} />
                {why.modelFactors && why.modelFactors.length > 0 && <ModelFactors factors={why.modelFactors} />}
                <p className="text-xs">
                  <span className={cn("rounded-full px-2 py-0.5 font-medium",
                    why.confidence === t("élevée") ? "bg-emerald-100 text-emerald-800" : why.confidence === "moyenne" ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-800")}>
                    {t("Confiance")}{' '}{why.confidence}
                  </span>{" "}<span className="text-muted-foreground">{why.confidenceNote}</span>
                </p>
                <details className="group rounded-lg border bg-secondary/30 p-3">
                  <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground">
                    <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />{t("Détails techniques")}{' '}</summary>
                  <div className="mt-3 space-y-3">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Bar label={t("Modèle NLP (p_nlp)")} value={a.pNlp} hint={a.pNlp == null ? `modèle : ${a.nlpStatus}` : undefined} />
                      <Bar label={t("Moteur de règles (s_rule)")} value={a.sRule} />
                      <Bar label={t("Score fusionné (p_final)")} value={a.pFinal} hint={`incertitude : ${a.uncertainty}`} />
                    </div>
                    {a.triggeredRules.length > 0 && (
                      <table className="w-full text-xs">
                        <thead><tr className="text-start text-muted-foreground"><th className="py-1">{t("Règle")}</th><th>{t("Gravité")}</th><th>{t("Poids")}</th></tr></thead>
                        <tbody>{a.triggeredRules.map((x) => (
                          <tr key={x.id} className="border-t"><td className="py-1"><span className="font-mono">{x.id}</span> {x.name}</td><td>{x.severity}</td><td>{x.weight ?? "—"}</td></tr>))}</tbody>
                      </table>
                    )}
                    {a.uncertaintyReasons.length > 0 && <p className="text-xs text-muted-foreground">{t("Incertitude :")}{' '}{a.uncertaintyReasons.join(" ; ")}</p>}
                    <p className="text-[11px] text-muted-foreground">{t("Scores non calibrés cliniquement : aide à la décision, pas une probabilité.")}</p>
                  </div>
                </details>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">{t("Ce que le patient a signalé")}</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{t("Symptômes")}</p><List items={report.positives} /></div>
                <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{t("Absents")}</p><List items={report.negatives} /></div>
                <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{t("Informations recueillies")}</p><List items={report.history} /></div>
                <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{t("Traitements")}</p><List items={report.medications} /></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">{t("Orientation")}</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {c.decision && (c.decision.suggestedSpecialty || c.decision.requiredEquipment.length > 0) && (
                  <p>{t("Spécialité :")}{' '}<span className="font-medium">{c.decision.suggestedSpecialty ?? t("Urgences")}</span>
                    {c.decision.requiredEquipment.length > 0 && <> {' '}{t("· plateau :")}{' '}{c.decision.requiredEquipment.map((e) => EQUIPMENT[e] ?? e).join(", ")}</>}</p>
                )}
                {r.options ? <ReferralOptions options={r.options} /> : <p className="text-muted-foreground">{t("Pourquoi votre hôpital :")}{' '}{r.matchReason}</p>}
                {c.location && (
                  <a className="inline-flex items-center gap-1 text-primary hover:underline" target="_blank" rel="noreferrer"
                    href={`https://www.openstreetmap.org/?mlat=${c.location.lat}&mlon=${c.location.lng}#map=16/${c.location.lat}/${c.location.lng}`}>
                    <MapPin className="h-4 w-4" />{t("Position du patient")}{' '}</a>
                )}
                {r.status === "ACCEPTED" && (
                  <p className="flex items-center gap-2 rounded-lg bg-accent/60 p-2">
                    {r.arrivalMode === "AMBULANCE" ? <Ambulance className="h-4 w-4 text-primary" /> : <Hospital className="h-4 w-4 text-primary" />}
                    {r.arrivalMode === "AMBULANCE" ? t("Ambulance (simulée)") : t("Vient par ses propres moyens")}
                    {detail.ambulance && <span className="text-muted-foreground">· {detail.ambulance.unitName} · {t(AMBULANCE[detail.ambulance.status] ?? detail.ambulance.status)}</span>}
                    {r.decidedBy && <span className="text-muted-foreground">{t("· accepté par")}{r.decidedBy}</span>}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="conversation" className="pt-4">
            <Card>
              <CardContent className="space-y-1.5 pt-5">
                {[...detail.transcript.map((turn) => ({ at: turn.createdAt, turn, photo: null })),
                  ...photos.map((photo) => ({ at: photo.createdAt, turn: null, photo }))]
                  .sort((a, b) => a.at.localeCompare(b.at))
                  .map(({ turn, photo }) => turn ? (
                    <p key={turn.id} className="text-sm" dir="auto"><span className="me-2 font-mono text-xs text-muted-foreground">{time(turn.createdAt)}</span>
                      <span className="font-medium">{turn.role === "PATIENT" ? t("Patient") : turn.role === "ASSISTANT" ? t("Assistant") : t("Système")} :</span> {turn.text}</p>
                  ) : photo && (
                    <div key={photo.id} className="flex items-start gap-2 py-1">
                      <span className="me-2 font-mono text-xs text-muted-foreground">{time(photo.createdAt)}</span>
                      <span className="text-sm font-medium">{t("Patient")} :</span>
                      <VerifiedPhoto path={`/referrals/${r.id}/photos/${photo.id}`} sha256={photo.sha256} />
                    </div>
                  ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="journey" className="pt-4">
            <Card>
              <CardContent className="pt-5">
                <ol className="space-y-3">
                  {detail.journey.map((j, i) => (
                    <li key={j.referralId} className="flex gap-3 text-sm">
                      <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                        j.referralId === r.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>{i + 1}</span>
                      <div className="min-w-0">
                        <p><span className="font-medium">{j.facilityName}</span> · {j.statusLabel}
                          <span className="text-muted-foreground"> · {time(j.sentAt)}{j.decidedBy ? ` · ${j.decidedBy}` : ""}</span></p>
                        {j.reason && <p className="text-muted-foreground" dir="auto">{j.reason}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="report" className="pt-4">
            <Card>
              <CardContent className="space-y-3 pt-5 text-sm">
                <p dir="auto">{report.summary}</p>
                {report.redFlags.length > 0 && <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{t("Signes d'alerte")}</p><List items={report.redFlags} /></div>}
                <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{t("Conduite à tenir")}</p><List items={report.recommendedActions} /></div>
                <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{t("Questions ouvertes")}</p><List items={report.openQuestions} /></div>
                <p className="text-xs text-muted-foreground">{report.disclaimer}</p>
                <Button variant="outline" size="sm" onClick={() => openReportPdf(r.id).catch((err) => setError((err as Error).message))}><FileText className="me-1.5 h-4 w-4" />{t("Télécharger le PDF")}</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="flex h-[640px] flex-col lg:sticky lg:top-56">
          <CardHeader className="border-b pb-3"><CardTitle className="text-base">{t("Échange direct avec le patient")}</CardTitle></CardHeader>
          <div className="min-h-0 flex-1"><ChatPanel patientLanguage={c.language === "ar" || c.language === "en" || c.language === "darija" ? c.language : "fr"} referralId={r.id} messages={detail.chat} disabled={!open} onSent={onChanged} /></div>
        </Card>
      </div>
    </div>
  );
}
