import { useEffect, useState } from "react";
import { Activity, HeartPulse, ShieldCheck, Siren, Thermometer, Wind } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/api";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { VitalReading } from "@/types";

/**
 * Live readings of the SIMULATED ambulance monitor (iot-sim/): signed device telemetry every ~5 s while the patient is
 * on board. Display and alerts only: these values are never used by the AI.
 */
const POLL_MS = 5000;

function Spark({ values, color, low, high }: { values: number[]; color: string; low: number; high: number }) {
  if (values.length < 2) return <div className="h-8" />;
  const w = 120, h = 32;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((Math.min(high, Math.max(low, v)) - low) / (high - low)) * h}`).join(" ");
  return <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none" aria-hidden><polyline points={pts} fill="none" stroke={color} strokeWidth="2" /></svg>;
}

function Tile({ icon: Icon, label, value, unit, alert }: { icon: typeof HeartPulse; label: string; value: string; unit: string; alert: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3", alert ? "border-red-300 bg-red-50 text-red-900" : "bg-card")}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{value}<span className="ms-1 text-xs font-normal text-muted-foreground">{unit}</span></p>
    </div>
  );
}

export function AmbulanceMonitor({ referralId }: { referralId: string }) {
  const [readings, setReadings] = useState<VitalReading[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => api.vitals(referralId).then((r) => { if (alive) setReadings(r.readings); }).catch(() => {});
    load();
    const timer = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [referralId]);

  const last = readings.at(-1);
  if (!last) return null;   // the monitor starts when the patient is on board
  const v = last.vitals;
  const has = (label: string) => last.alerts.some((a) => a.startsWith(label));
  const age = last.measuredAt ? Math.round((Date.now() - new Date(last.measuredAt).getTime()) / 1000) : null;
  const series = (k: keyof VitalReading["vitals"]) => readings.map((x) => x.vitals[k]).filter((x): x is number => typeof x === "number");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />{t("Moniteur ambulance")}
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{t("SIMULÉ")}</span>
          <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground" title={t("Message signé par l’appareil (HMAC-SHA256), horodaté, numéro de séquence vérifié")}>
            <ShieldCheck className="h-3.5 w-3.5" />{last.deviceId} · {age != null ? t("il y a {s} s", { s: age }) : ""}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("Données simulées, affichées seulement : jamais utilisées par l’IA ni pour le niveau.")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {last.alerts.length > 0 && (
          <p role="alert" className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            <Siren className="h-4 w-4" />{last.alerts.join(" · ")}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Tile icon={HeartPulse} label={t("FC")} value={`${v.heartRate ?? "?"}`} unit="/min" alert={has("FC")} />
          <Tile icon={Activity} label="SpO₂" value={`${v.spo2 ?? "?"}`} unit="%" alert={has("SpO2")} />
          <Tile icon={Activity} label={t("PA")} value={`${v.systolic ?? "?"}/${v.diastolic ?? "?"}`} unit="mmHg" alert={has("PAS")} />
          <Tile icon={Wind} label={t("FR")} value={`${v.respRate ?? "?"}`} unit="/min" alert={has("FR")} />
          <Tile icon={Thermometer} label={t("Temp.")} value={`${v.temperature ?? "?"}`} unit="°C" alert={has("T ")} />
        </div>
        <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
          <div><p>{t("FC (5 dernières min)")}</p><Spark values={series("heartRate").slice(-60)} color="#DC2626" low={40} high={160} /></div>
          <div><p>{t("SpO₂ (5 dernières min)")}</p><Spark values={series("spo2").slice(-60)} color="#2563EB" low={80} high={100} /></div>
        </div>
      </CardContent>
    </Card>
  );
}
