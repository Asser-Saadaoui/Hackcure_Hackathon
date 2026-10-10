import type { Level } from "@/types";

export const LEVEL: Record<Level, { label: string; className: string; dot: string }> = {
  EMERGENCY: { label: "Urgence vitale", className: "bg-red-600 text-white border-transparent", dot: "bg-red-600" },
  HIGH: { label: "Urgent", className: "bg-orange-500 text-white border-transparent", dot: "bg-orange-500" },
  UNCERTAIN: { label: "À vérifier", className: "bg-slate-500 text-white border-transparent", dot: "bg-slate-500" },
  LOW: { label: "Peu urgent", className: "bg-emerald-600 text-white border-transparent", dot: "bg-emerald-600" },
};

export const STATUS: Record<string, string> = {
  SENT: "Nouveau", INFO_REQUESTED: "Question posée", ACCEPTED: "Accepté", REJECTED: "Refusé", TIMED_OUT: "Sans réponse",
  CANCELLED: "Annulé", ARRIVED: "Arrivé", COMPLETED: "Terminé", REROUTED: "Réorienté par vous",
};

export const AMBULANCE: Record<string, string> = {
  DISPATCHED: "Ambulance engagée", EN_ROUTE_TO_PATIENT: "En route vers le patient", AT_PATIENT: "Auprès du patient",
  TRANSPORTING: "Transport vers l'hôpital", ARRIVED: "Arrivée",
};

export const EQUIPMENT: Record<string, string> = {
  CT: "Scanner", MRI: "IRM", CATH_LAB: "Salle de cathétérisme", ICU: "Réanimation", NICU: "Réa néonatale", DIALYSIS: "Hémodialyse",
};

export const LANG: Record<string, string> = { fr: "Français", ar: "Arabe", darija: "Darija", en: "Anglais" };

export function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const secs = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (secs < 60) return `il y a ${secs} s`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `il y a ${hrs} h` : `il y a ${Math.round(hrs / 24)} j`;
}

export const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
export const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)} %`);
