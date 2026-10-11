import { t } from "@/i18n";
import { useEffect, useMemo, useState } from "react";
import { BedDouble, Check, Clock, HeartPulse, Minus, Plus, RotateCcw, Stethoscope, Users, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/api";
import { ago, time, EQUIPMENT } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Hospital } from "@/types";

type Draft = { beds: number | null; icu: number | null; wait: number | null; down: string[]; accepting: boolean; note: string; hours: number };

const DURATIONS = [1, 4, 8, 12];
const WAIT_STEP = 10;

function fromHospital(h: Hospital): Draft {
  const a = h.availability;
  return {
    beds: a.bedsAvailable, icu: a.icuAvailable, wait: a.waitMinutes,
    down: a.equipmentDown.filter((e) => h.equipment.includes(e)), accepting: a.accepting,
    note: a.override?.note ?? "", hours: 4,
  };
}

const same = (a: Draft, b: Draft) =>
  a.beds === b.beds && a.icu === b.icu && a.wait === b.wait && a.accepting === b.accepting && a.note === b.note &&
  [...a.down].sort().join() === [...b.down].sort().join();

function Stepper({ icon: Icon, label, value, total, simulated, step = 1, unit, onChange }: {
  icon: typeof BedDouble; label: string; value: number | null; total?: number | null; simulated?: number | null;
  step?: number; unit?: string; onChange: (v: number) => void;
}) {
  const v = value ?? 0;
  const changed = simulated != null && value != null && simulated !== value;
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" aria-label={t("Diminuer {label}", {label})} onClick={() => onChange(Math.max(0, v - step))}
          className="flex h-9 w-9 items-center justify-center rounded-lg border hover:bg-secondary disabled:opacity-40" disabled={v <= 0}>
          <Minus className="h-4 w-4" />
        </button>
        <Input type="number" min={0} inputMode="numeric" aria-label={label} value={value ?? ""}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="h-10 w-20 text-center text-xl font-semibold" />
        <button type="button" aria-label={t("Augmenter {label}", {label})} onClick={() => onChange(v + step)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border hover:bg-secondary">
          <Plus className="h-4 w-4" />
        </button>
        <span className="text-sm text-muted-foreground">{total != null ? `/ ${total}` : unit}</span>
      </div>
      <p className={cn("mt-2 h-4 text-xs", changed ? "text-amber-700" : "text-muted-foreground")}>
        {simulated != null ? `${t("simulé")} : ${simulated}${unit ? ` ${unit}` : ""}` : ""}
      </p>
    </div>
  );
}

function ReadOnly({ icon: Icon, label, value, total }: { icon: typeof BedDouble; label: string; value: number | null; total?: number | null }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-secondary/60 px-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="ms-auto font-semibold">{value ?? "?"}{total != null && <span className="font-normal text-muted-foreground"> / {total}</span>}</span>
    </div>
  );
}

export function AvailabilityView({ hospital, onChanged }: { hospital: Hospital; onChanged: (h: Hospital) => void }) {
  const a = hospital.availability;
  const saved = useMemo(() => fromHospital(hospital), [hospital]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const dirty = !same(draft, saved);

  // Live refreshes update the screen, but never overwrite values the user is editing.
  useEffect(() => {
    if (!dirty) setDraft((d) => ({ ...saved, hours: d.hours }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 3000);
    return () => clearTimeout(timer);
  }, [justSaved]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  async function run(fn: () => Promise<Hospital>) {
    setBusy(true);
    setError(null);
    try {
      const h = await fn();
      onChanged(h);
      setDraft({ ...fromHospital(h), hours: draft.hours });
      setJustSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const save = (patch: Partial<Draft> = {}) => {
    const d = { ...draft, ...patch };
    return run(() => api.setAvailability({ bedsAvailable: d.beds, icuAvailable: d.icu, waitMinutes: d.wait, equipmentDown: d.down,
      accepting: d.accepting, note: d.note || null, hours: d.hours }));
  };

  function toggleAccepting() {
    if (draft.accepting && !window.confirm(t("Suspendre la réception ? Aucun nouveau patient ne sera orienté vers votre hôpital."))) return;
    save({ accepting: !draft.accepting });  // urgent: applied immediately, not staged
  }

  const sim = a.simulator;
  const fromStaff = a.source === "staff" && a.override;

  return (
    <div className="space-y-5 pb-24">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("Disponibilité")}</h1>
        <p className="text-sm text-muted-foreground">{t("Ces valeurs décident si Sahhanito vous oriente des patients. Corrigez-les dès qu'elles changent.")}</p>
      </div>

      {/* Status: receiving or not, and where the numbers come from */}
      <Card className={cn(!a.accepting && "border-red-300 bg-red-50/60")}>
        <CardContent className="flex flex-wrap items-center gap-4 pt-5">
          <button type="button" role="switch" aria-checked={a.accepting} aria-label={t("Recevoir de nouveaux patients")} onClick={toggleAccepting} disabled={busy}
            className={cn("relative h-7 w-12 shrink-0 rounded-full transition", a.accepting ? "bg-emerald-600" : "bg-red-600")}>
            <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", a.accepting ? "left-6" : "left-1")} />
          </button>
          <div className="min-w-0 flex-1">
            <p className={cn("font-semibold", a.accepting ? "text-emerald-700" : "text-red-700")}>
              {a.accepting ? t("Vous recevez de nouveaux patients") : t("Réception suspendue : aucun patient ne vous est orienté")}
            </p>
            <p className="text-sm text-muted-foreground">
              {fromStaff
                ? t("Valeurs de l'équipe ({name}, {ago}) · expirent à {time}, puis retour aux valeurs simulées", { name: a.override!.updatedBy, ago: ago(a.override!.updatedAt), time: time(a.override!.expiresAt) })
                : a.source === "simulator" ? t("Valeurs simulées, mises à jour en continu. Corrigez-les si elles ne reflètent pas la réalité.")
                : t("Simulateur indisponible : saisissez vos valeurs.")}
            </p>
          </div>
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", fromStaff ? "bg-primary text-primary-foreground" : "bg-amber-100 text-amber-800")}>
            {fromStaff ? t("Saisie équipe") : t("Données simulées")}
          </span>
          {fromStaff && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => api.clearAvailability())}>
              <RotateCcw className="me-1.5 h-4 w-4" />{t("Revenir aux valeurs simulées")}{' '}</Button>
          )}
        </CardContent>
      </Card>

      {/* Editable capacity */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stepper icon={BedDouble} label={t("Lits urgences libres")} value={draft.beds} total={a.bedsTotal}
          simulated={fromStaff ? sim?.bedsAvailable : null} onChange={(v) => set({ beds: v })} />
        <Stepper icon={HeartPulse} label={t("Réanimation libre")} value={draft.icu} total={a.icuTotal}
          simulated={fromStaff ? sim?.icuAvailable : null} onChange={(v) => set({ icu: v })} />
        <Stepper icon={Clock} label={t("Attente estimée")} value={draft.wait} unit="min" step={WAIT_STEP}
          simulated={fromStaff ? sim?.waitMinutes : null} onChange={(v) => set({ wait: v })} />
      </div>

      {/* Equipment */}
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium"><Wrench className="h-4 w-4 text-muted-foreground" />{t("Plateau technique")}</p>
        <div className="flex flex-wrap gap-2">
          {hospital.equipment.map((e) => {
            const isDown = draft.down.includes(e);
            return (
              <button key={e} type="button" aria-pressed={isDown}
                onClick={() => set({ down: isDown ? draft.down.filter((x) => x !== e) : [...draft.down, e] })}
                className={cn("inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                  isDown ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>
                {isDown ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                <span className="font-medium">{t(EQUIPMENT[e] ?? e)}</span>
                <span className="text-xs opacity-80">{isDown ? t("En panne") : t("Disponible")}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Note */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t("Note pour l'équipe")}{' '}<span className="font-normal text-muted-foreground">{t("(facultatif)")}</span></p>
        <Input aria-label={t("Note pour l'équipe")} value={draft.note} maxLength={300} placeholder={t("Ex. : scanner en maintenance jusqu'à 16 h")} onChange={(e) => set({ note: e.target.value })} />
      </div>

      {/* Read-only activity from the simulator */}
      <div className="space-y-2">
        <p className="text-sm font-medium">{t("Activité")}{' '}<span className="font-normal text-muted-foreground">{t("(simulée)")}</span></p>
        <div className="grid gap-2 sm:grid-cols-2">
          <ReadOnly icon={Stethoscope} label={t("Médecins présents")} value={a.doctorsAvailable} total={a.doctorsTotal} />
          <ReadOnly icon={Users} label={t("Patients en attente")} value={a.waitingPatients} />
        </div>
        {a.staffShortage && <p className="text-xs text-orange-700">{t("Sous-effectif signalé par le simulateur.")}</p>}
      </div>

      {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{t(error)}</p>}
      {justSaved && !dirty && <p className="text-sm text-emerald-700">{t("Enregistré.")}</p>}

      {/* Save bar: only when something changed */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 shadow-lg backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <span className="text-sm font-medium">{t("Modifications non enregistrées")}</span>
            <span className="text-sm text-muted-foreground">{t("Valables")}</span>
            <div className="flex gap-1 rounded-lg bg-secondary p-1">
              {DURATIONS.map((h) => (
                <button key={h} type="button" onClick={() => set({ hours: h })}
                  className={cn("rounded-md px-2.5 py-1 text-sm", draft.hours === h ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>{h} h</button>
              ))}
            </div>
            <div className="ms-auto flex gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => setDraft({ ...saved, hours: draft.hours })}>{t("Annuler")}</Button>
              <Button disabled={busy} onClick={() => save()}>{busy ? t("Enregistrement…") : t("Enregistrer")}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
