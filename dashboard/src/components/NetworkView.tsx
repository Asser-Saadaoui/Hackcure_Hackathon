import { t } from "@/i18n";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { EQUIPMENT } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Hospital } from "@/types";

const GRAND_TUNIS: [number, number] = [36.81, 10.17];

/** Green: beds free · amber: few beds · red: full or not receiving · grey: unknown. */
function status(h: Hospital): { color: string; label: string } {
  const a = h.availability;
  if (!a.accepting || a.bedsAvailable === 0) return { color: "#DC2626", label: a.accepting ? t("Complet") : t("Ne reçoit plus") };
  if (a.bedsAvailable == null) return { color: "#94A3B8", label: t("Inconnu") };
  if (a.bedsAvailable < 5 || a.equipmentDown.length > 0) return { color: "#F59E0B", label: t("Places limitées") };
  return { color: "#16A34A", label: t("Disponible") };
}

/** Leaflet measures its container once; recompute when the layout settles. */
function FixSize() {
  const map = useMap();
  useEffect(() => {
    const timers = [0, 200, 600].map((ms) => setTimeout(() => map.invalidateSize(), ms));
    return () => timers.forEach(clearTimeout);
  }, [map]);
  return null;
}

export function NetworkView({ hospitals, simulatorOk }: { hospitals: Hospital[]; simulatorOk: boolean }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("Réseau Grand Tunis")}</h1>
        <p className="text-sm text-muted-foreground">{simulatorOk ? t("Disponibilités simulées en direct, corrigées par les équipes quand elles les saisissent.") : t("Simulateur indisponible : dernières valeurs connues.")}</p>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card magic-surface">
        <MapContainer center={GRAND_TUNIS} zoom={11} scrollWheelZoom={false} className="h-[380px] w-full" attributionControl>
          <FixSize />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
          {hospitals.map((h) => {
            const s = status(h);
            const a = h.availability;
            return (
              <CircleMarker key={h.key} center={[h.lat, h.lng]} radius={9}
                pathOptions={{ color: "#FFFFFF", weight: 2, fillColor: s.color, fillOpacity: 0.95 }}>
                <Popup>
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold">{h.name}</p>
                    <p style={{ color: s.color }} className="font-medium">{s.label}</p>
                    <p>{t("Lits libres :")}{' '}{a.bedsAvailable ?? "?"}{a.bedsTotal != null && ` / ${a.bedsTotal}`} {' '}{t("· Réa :")}{' '}{a.icuAvailable ?? "?"}</p>
                    <p>{t("Attente :")}{' '}{a.waitMinutes != null ? `${a.waitMinutes} min` : "?"}</p>
                    {a.equipmentDown.length > 0 && <p>{t("Indisponible :")}{' '}{a.equipmentDown.map((e) => t(EQUIPMENT[e] ?? e)).join(", ")}</p>}
                    <p className="text-xs text-gray-500">{a.source === "staff" ? t("Saisie de l'équipe") : t("Valeurs simulées")}</p>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
        <div className="flex flex-wrap gap-4 border-t px-3 py-2 text-xs text-muted-foreground">
          {[["#16A34A", t("Disponible")], ["#F59E0B", t("Places limitées")], ["#DC2626", t("Complet / ne reçoit plus")], ["#94A3B8", t("Inconnu")]].map(([c, l]) => (
            <span key={l} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{l}</span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card magic-surface">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-start text-xs text-muted-foreground">
            <tr><th className="px-3 py-2">{t("Hôpital")}</th><th>{t("Lits libres")}</th><th>{t("Réa")}</th><th>{t("Attente")}</th><th>{t("Indisponible")}</th><th className="pe-3">{t("Source")}</th></tr>
          </thead>
          <tbody>
            {hospitals.map((h) => {
              const a = h.availability;
              return (
                <tr key={h.key} className="border-t">
                  <td className="px-3 py-2">
                    <p className="flex items-center gap-2 font-medium"><span className="h-2.5 w-2.5 rounded-full" style={{ background: status(h).color }} />{h.name}</p>
                    <p className="text-xs text-muted-foreground">{h.specialties.join(" · ")}</p>
                  </td>
                  <td className={cn(a.bedsAvailable === 0 && "font-semibold text-red-700")}>{a.bedsAvailable ?? "?"}{a.bedsTotal != null && ` / ${a.bedsTotal}`}</td>
                  <td className={cn(a.icuAvailable === 0 && "text-red-700")}>{a.icuAvailable ?? "?"}{a.icuTotal != null && ` / ${a.icuTotal}`}</td>
                  <td>{a.waitMinutes != null ? `${a.waitMinutes} min` : "?"}</td>
                  <td className="text-xs">{!a.accepting ? t("Ne reçoit plus") : a.equipmentDown.map((e) => t(EQUIPMENT[e] ?? e)).join(", ") || "—"}</td>
                  <td className="pe-3"><span className={cn("rounded-full px-2 py-0.5 text-xs", a.source === "staff" ? "bg-primary text-primary-foreground" : "bg-amber-100 text-amber-800")}>
                    {a.source === "staff" ? t("équipe") : a.source === "simulator" ? t("simulé") : "?"}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
