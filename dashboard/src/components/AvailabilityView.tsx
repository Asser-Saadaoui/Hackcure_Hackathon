import { useEffect, useState } from "react";
import { BedDouble, Clock, HeartPulse, RotateCcw, Save, Stethoscope, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/api";
import { ago, EQUIPMENT } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Hospital } from "@/types";

function Stat({ icon: Icon, label, value, total }: { icon: typeof BedDouble; label: string; value: number | null; total?: number | null }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
      <p className="mt-1 text-2xl font-semibold">{value ?? "?"}{total != null && <span className="text-base font-normal text-muted-foreground"> / {total}</span>}</p>
    </div>
  );
}

export function AvailabilityView({ hospital, onChanged }: { hospital: Hospital; onChanged: (h: Hospital) => void }) {
  const a = hospital.availability;
  const [beds, setBeds] = useState("");
  const [icu, setIcu] = useState("");
  const [wait, setWait] = useState("");
  const [down, setDown] = useState<string[]>([]);
  const [accepting, setAccepting] = useState(true);
  const [note, setNote] = useState("");
  const [hours, setHours] = useState("4");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBeds(a.bedsAvailable?.toString() ?? "");
    setIcu(a.icuAvailable?.toString() ?? "");
    setWait(a.waitMinutes?.toString() ?? "");
    setDown(a.equipmentDown.filter((e) => hospital.equipment.includes(e)));
    setAccepting(a.accepting);
    setNote(a.override?.note ?? "");
    // Reset the form only when the source changes, not on every simulator tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.source, hospital.key]);

  async function run(fn: () => Promise<Hospital>) {
    setBusy(true);
    setError(null);
    try { onChanged(await fn()); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Disponibilité · {hospital.name}</h1>
        <p className="text-sm text-muted-foreground">
          {a.source === "staff" && a.override
            ? `Valeurs saisies par ${a.override.updatedBy} ${ago(a.override.updatedAt)} · expirent ${new Date(a.override.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
            : a.source === "simulator" ? "Valeurs simulées (OpenHospital Sim), mises à jour en continu. Corrigez-les si elles ne reflètent pas la réalité."
            : "Simulateur indisponible : saisissez les valeurs."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat icon={BedDouble} label="Lits urgences libres" value={a.bedsAvailable} total={a.bedsTotal} />
        <Stat icon={HeartPulse} label="Réanimation libre" value={a.icuAvailable} total={a.icuTotal} />
        <Stat icon={Clock} label="Attente estimée (min)" value={a.waitMinutes} />
        <Stat icon={Stethoscope} label="Médecins présents" value={a.doctorsAvailable} total={a.doctorsTotal} />
        <Stat icon={Users} label="Patients en attente" value={a.waitingPatients} />
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className={cn("rounded-full px-2.5 py-1 font-medium", a.source === "staff" ? "bg-primary text-primary-foreground" : "bg-amber-100 text-amber-800")}>
          {a.source === "staff" ? "Saisie équipe" : a.source === "simulator" ? "Données simulées" : "Inconnu"}
        </span>
        {!a.accepting && <span className="rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-800">Ne reçoit plus de patients</span>}
        {a.staffShortage && <span className="rounded-full bg-orange-100 px-2.5 py-1 font-medium text-orange-800">Sous-effectif</span>}
        {a.equipmentDown.map((e) => <span key={e} className="rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-800">{EQUIPMENT[e] ?? e} indisponible</span>)}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Corriger la disponibilité</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1.5"><Label>Lits urgences libres</Label><Input type="number" min={0} value={beds} onChange={(e) => setBeds(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Réanimation libre</Label><Input type="number" min={0} value={icu} onChange={(e) => setIcu(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Attente (min)</Label><Input type="number" min={0} value={wait} onChange={(e) => setWait(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Valable pendant (h)</Label><Input type="number" min={1} max={48} value={hours} onChange={(e) => setHours(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Équipement indisponible</Label>
            <div className="flex flex-wrap gap-1.5">
              {hospital.equipment.map((e) => (
                <button key={e} type="button" onClick={() => setDown((d) => (d.includes(e) ? d.filter((x) => x !== e) : [...d, e]))}
                  className={cn("rounded-full border px-3 py-1 text-sm", down.includes(e) && "border-red-300 bg-red-50 text-red-800")}>{EQUIPMENT[e] ?? e}</button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!accepting} onChange={(e) => setAccepting(!e.target.checked)} />
            Suspendre la réception de nouveaux patients</label>
          <div className="space-y-1.5"><Label>Note (visible par l'équipe)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => run(() => api.setAvailability({ bedsAvailable: num(beds), icuAvailable: num(icu), waitMinutes: num(wait),
              equipmentDown: down, accepting, note: note || null, hours: Number(hours) || 4 }))}><Save className="mr-2 h-4 w-4" />Enregistrer</Button>
            {a.source === "staff" && <Button variant="outline" disabled={busy} onClick={() => run(() => api.clearAvailability())}><RotateCcw className="mr-2 h-4 w-4" />Revenir aux valeurs simulées</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
