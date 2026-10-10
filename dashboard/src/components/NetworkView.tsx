import { EQUIPMENT } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Hospital } from "@/types";

export function NetworkView({ hospitals, simulatorOk }: { hospitals: Hospital[]; simulatorOk: boolean }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Réseau Grand Tunis</h1>
        <p className="text-sm text-muted-foreground">{simulatorOk ? "Disponibilités simulées en direct, corrigées par les équipes quand elles les saisissent." : "Simulateur indisponible : dernières valeurs connues."}</p>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr><th className="px-3 py-2">Hôpital</th><th>Lits libres</th><th>Réa</th><th>Attente</th><th>Indisponible</th><th className="pr-3">Source</th></tr>
          </thead>
          <tbody>
            {hospitals.map((h) => {
              const a = h.availability;
              return (
                <tr key={h.key} className="border-t">
                  <td className="px-3 py-2"><p className="font-medium">{h.name}</p><p className="text-xs text-muted-foreground">{h.specialties.join(" · ")}</p></td>
                  <td className={cn(a.bedsAvailable === 0 && "font-semibold text-red-700")}>{a.bedsAvailable ?? "?"}{a.bedsTotal != null && ` / ${a.bedsTotal}`}</td>
                  <td className={cn(a.icuAvailable === 0 && "text-red-700")}>{a.icuAvailable ?? "?"}{a.icuTotal != null && ` / ${a.icuTotal}`}</td>
                  <td>{a.waitMinutes != null ? `${a.waitMinutes} min` : "?"}</td>
                  <td className="text-xs">{!a.accepting ? "Ne reçoit plus" : a.equipmentDown.map((e) => EQUIPMENT[e] ?? e).join(", ") || "—"}</td>
                  <td className="pr-3"><span className={cn("rounded-full px-2 py-0.5 text-xs", a.source === "staff" ? "bg-primary text-primary-foreground" : "bg-amber-100 text-amber-800")}>
                    {a.source === "staff" ? "équipe" : a.source === "simulator" ? "simulé" : "?"}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
