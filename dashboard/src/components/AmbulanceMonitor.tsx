import { useEffect, useState } from "react";
import { Activity, ShieldCheck, Siren } from "lucide-react";
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";
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

/** One vital sign as a circular gauge: the arc shows where the value sits in its range, the centre the value itself. */
function Gauge({ label, value, display, unit, min, max, alert }: { label: string; value?: number; display?: string; unit: string; min: number; max: number; alert: boolean }) {
  return (
    <div className={cn("flex flex-col items-center gap-1 rounded-lg border p-2", alert ? "border-red-300 bg-red-50" : "bg-card")}>
      <AnimatedCircularProgressBar className="size-24 text-base" min={min} max={max} value={value ?? min}
        gaugePrimaryColor={alert ? "#DC2626" : "#3885AB"} gaugeSecondaryColor={alert ? "#FECACA" : "#E2E8F0"}>
        <span className={cn("font-mono text-lg font-semibold tabular-nums", alert && "text-red-700")}>{display ?? value ?? "?"}</span>
        <span className="text-[10px] font-normal text-muted-foreground">{unit}</span>
      </AnimatedCircularProgressBar>
      <p className={cn("text-xs font-medium", alert ? "text-red-800" : "text-muted-foreground")}>{label}</p>
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
          <span className="rounded-full bg-cream-100 px-2 py-0.5 text-xs font-medium text-cream-800">{t("SIMULÉ")}</span>
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
          <Gauge label={t("FC")} value={v.heartRate} unit="/min" min={30} max={200} alert={has("FC")} />
          <Gauge label="SpO₂" value={v.spo2} unit="%" min={70} max={100} alert={has("SpO2")} />
          <Gauge label={t("PA")} value={v.systolic} display={`${v.systolic ?? "?"}/${v.diastolic ?? "?"}`} unit="mmHg" min={50} max={220} alert={has("PAS")} />
          <Gauge label={t("FR")} value={v.respRate} unit="/min" min={0} max={45} alert={has("FR")} />
          <Gauge label={t("Temp.")} value={v.temperature} unit="°C" min={34} max={42} alert={has("T ")} />
        </div>
        <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
          <div><p>{t("FC (5 dernières min)")}</p><Spark values={series("heartRate").slice(-60)} color="#DC2626" low={40} high={160} /></div>
          <div><p>{t("SpO₂ (5 dernières min)")}</p><Spark values={series("spo2").slice(-60)} color="#3885AB" low={80} high={100} /></div>
        </div>
      </CardContent>
    </Card>
  );
}
