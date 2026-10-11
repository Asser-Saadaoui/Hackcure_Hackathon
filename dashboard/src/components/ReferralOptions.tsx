import { Check, Hospital } from "lucide-react";
import { t } from "@/i18n";
import type { ReferralOptions as Options, ReferralReason } from "@/types";

/** Why this hospital was the most adequate for the case, and the next two hospitals the system compared it with. */
const SPECIALTY: Record<string, string> = {
  CARDIO: "cardiologie", NEURO: "neurologie", NEUROSURG: "neurochirurgie", TRAUMA: "traumatologie", BURNS: "grands brûlés",
  OBGYN: "maternité", PEDIA: "pédiatrie", PNEUMO: "pneumologie", OPHTA: "ophtalmologie", PSY: "psychiatrie", SURG: "chirurgie",
  INTMED: "médecine interne", EMERG: "urgences générales",
};

function reason(r: ReferralReason): string {
  switch (r.code) {
    case "faster": return t("{n} min plus proche que les options suivantes", { n: r.minutes ?? 0 });
    case "as_fast": return t("Aussi proche que les options suivantes, mieux adapté au cas");
    case "equipment": return t("Plateau technique requis disponible");
    case "specialty": return t("Service spécialisé : {s}", { s: t(SPECIALTY[r.specialty ?? ""] ?? r.specialty ?? "") });
    case "more_beds": return t("Plus de lits libres ({n})", { n: r.beds ?? "?" });
    case "shorter_wait": return t("Attente plus courte (≈ {n} min de moins)", { n: r.minutes ?? 0 });
    case "emergency_time": return t("Urgence vitale : délai d'accès aux soins prioritaire");
    case "saturated": return t("Tous les services pleins : le plus proche reçoit les urgences vitales");
    case "staff_choice": return t("Choisi par une équipe des urgences (réorientation)");
    default: return t("Meilleur compromis distance, capacité, attente");
  }
}

export function ReferralOptions({ options }: { options: Options }) {
  return (
    <div className="space-y-2 rounded-lg bg-secondary/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Pourquoi cet hôpital est le plus adapté")}</p>
      <ul className="space-y-1">
        {options.why.map((r, i) => (
          <li key={`${r.code}-${i}`} className="flex items-start gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{reason(r)}</li>
        ))}
      </ul>
      {options.alternatives.length > 0 && (
        <>
          <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Options suivantes comparées")}</p>
          <ol className="space-y-1">
            {options.alternatives.map((o, i) => (
              <li key={o.key} className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full border bg-card text-[11px] font-semibold">{i + 2}</span>
                <Hospital className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{o.name}</span>
                <span className="text-xs text-muted-foreground">
                  ~{o.etaMinutes} min · {o.distanceKm} km{o.bedsAvailable != null ? ` · ${o.bedsAvailable === 0 ? t("complet") : t("{n} lits libres", { n: o.bedsAvailable })}` : ""}
                  {o.waitMinutes != null ? ` · ${t("attente {n} min", { n: o.waitMinutes })}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
