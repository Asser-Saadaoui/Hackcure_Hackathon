import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { Ambulance, Footprints, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/api";
import { AMBULANCE } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Tracking } from "@/types";

const COLORS = { hospital: "#177082", patient: "#2563EB", ambulance: "#DC2626" };
const STEPS = ["DISPATCHED", "EN_ROUTE_TO_PATIENT", "AT_PATIENT", "TRANSPORTING", "ARRIVED"];

function dot(color: string, size: number) {
  return L.divIcon({
    className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
  });
}

/** Fits the map once per route (not on every ambulance move), and re-measures after layout. */
function Fit({ view }: { view: Tracking }) {
  const map = useMap();
  const key = `${view.patient?.lat},${view.patient?.lng},${view.route.length}`;
  useEffect(() => {
    const pts: [number, number][] = [[view.hospital.lat, view.hospital.lng]];
    if (view.patient) pts.push([view.patient.lat, view.patient.lng]);
    view.route.forEach((p) => pts.push([p.lat, p.lng]));
    const timers = [0, 250].map((ms) => setTimeout(() => {
      map.invalidateSize();
      if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
      else map.setView(pts[0], 14);
    }, ms));
    return () => timers.forEach(clearTimeout);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** ED view of the patient and the (simulated) ambulance, live — the same map the patient follows. */
export function LiveTrackingMap({ referralId }: { referralId: string }) {
  const [view, setView] = useState<Tracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    let active = true;
    const load = () => api.tracking(referralId).then((v) => { if (active) { setView(v); setError(null); } })
      .catch((err) => { if (active) setError((err as Error).message); });
    load();
    timer.current = setInterval(load, 3000);   // ambulance position is computed every 2 s by the backend
    return () => { active = false; clearInterval(timer.current); };
  }, [referralId]);

  if (error && !view) return null;   // no patient position yet: nothing to show
  if (!view) return <Card><CardContent className="py-6 text-sm text-muted-foreground">Chargement de la carte…</CardContent></Card>;

  const amb = view.ambulance;
  const current = amb ? STEPS.indexOf(amb.status) : -1;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Suivi en direct
          {amb ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
              <Ambulance className="h-3.5 w-3.5" />{amb.unitName} · {AMBULANCE[amb.status] ?? amb.status}{amb.status !== "ARRIVED" && ` · ~${amb.etaMinutes} min`}
            </span>
          ) : view.arrivalMode === "SELF" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium"><Footprints className="h-3.5 w-3.5" />Vient par ses propres moyens · ~{view.etaMinutes} min</span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium"><MapPin className="h-3.5 w-3.5" />Position du patient · {view.distanceKm ?? "?"} km</span>
          )}
          <span className="text-xs font-normal text-muted-foreground">ambulance simulée</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-hidden rounded-lg border">
          <MapContainer center={[view.hospital.lat, view.hospital.lng]} zoom={13} scrollWheelZoom={false} className="h-[300px] w-full">
            <Fit view={view} />
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            {view.route.length > 1 && <Polyline positions={view.route.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: COLORS.hospital, weight: 4, opacity: 0.7 }} />}
            <Marker position={[view.hospital.lat, view.hospital.lng]} icon={dot(COLORS.hospital, 18)}><Tooltip>{view.hospital.name}</Tooltip></Marker>
            {view.patient && <Marker position={[view.patient.lat, view.patient.lng]} icon={dot(COLORS.patient, 16)}><Tooltip>Patient{view.patient.address ? ` · ${view.patient.address}` : ""}</Tooltip></Marker>}
            {amb && <Marker position={[amb.position.lat, amb.position.lng]} icon={dot(COLORS.ambulance, 20)} zIndexOffset={1000}><Tooltip permanent direction="top">{amb.unitName}</Tooltip></Marker>}
          </MapContainer>
        </div>
        {amb && (
          <ol className="flex flex-wrap gap-1.5 text-xs">
            {STEPS.map((s, i) => (
              <li key={s} className={cn("rounded-full px-2 py-0.5",
                i < current || amb.status === "ARRIVED" ? "bg-primary text-primary-foreground" : i === current ? "bg-red-100 font-medium text-red-800" : "bg-secondary text-muted-foreground")}>
                {AMBULANCE[s] ?? s}
              </li>
            ))}
          </ol>
        )}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {[[COLORS.patient, "Patient"], [COLORS.ambulance, "Ambulance"], [COLORS.hospital, "Votre hôpital"]].map(([c, l]) => (
            <span key={l} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{l}</span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
