import { t } from "@/i18n";
import { useEffect, useState } from "react";
import { ArrowRightLeft, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/api";
import { cn } from "@/lib/utils";
import type { Alternative } from "@/types";

const REASONS = ["Plateau technique indisponible", "Plus de lit disponible", "Spécialité plus adaptée ailleurs", "Patient plus proche d'un autre hôpital"];

/** ED staff move a case to another hospital: chosen from the ranked list, or the best one automatically. */
export function ReroutePanel({ referralId, accepted, onDone, onCancel }: { referralId: string; accepted: boolean; onDone: (name: string | null) => void; onCancel: () => void }) {
  const [options, setOptions] = useState<Alternative[] | null>(null);
  const [target, setTarget] = useState<string | null>(null);   // null = automatic
  const [reason, setReason] = useState(REASONS[0]);
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.alternatives(referralId).then(setOptions).catch((err) => setError((err as Error).message));
  }, [referralId]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.reroute(referralId, target, reason, explanation.trim());
      onDone(r.facilityName);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const chosen = options?.find((o) => o.key === target);

  return (
    <Card className="border-primary/40">
      <CardContent className="space-y-4 pt-5">
        <div>
          <p className="flex items-center gap-2 font-semibold"><ArrowRightLeft className="h-4 w-4" />{t("Réorienter le patient")}</p>
          <p className="text-sm text-muted-foreground">
            {accepted ? t("Le patient a déjà été accepté : il sera informé du changement et l'ambulance simulée éventuelle est annulée.") : t("Le dossier sera envoyé à l'hôpital choisi, qui devra l'accepter.")}
          </p>
        </div>

        <div className="space-y-2">
          <button type="button" aria-pressed={target === null} onClick={() => setTarget(null)}
            className={cn("flex w-full items-center gap-3 rounded-lg border p-3 text-start text-sm", target === null && "border-primary bg-accent")}>
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="flex-1"><span className="font-medium">{t("Choix automatique")}</span>{t("· le meilleur hôpital disponible selon la position, l'urgence et la disponibilité")}{options && options[0] && <span className="text-muted-foreground">{t("(actuellement :")}{options[0].name})</span>}</span>
            {target === null && <Check className="h-4 w-4 text-primary" />}
          </button>
          {options === null && !error && <p className="text-sm text-muted-foreground">{t("Recherche des hôpitaux…")}</p>}
          {options?.length === 0 && <p className="text-sm text-muted-foreground">{t("Aucun autre hôpital ne peut recevoir ce patient pour le moment.")}</p>}
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {options?.map((o) => (
              <button key={o.key} aria-pressed={target === o.key} type="button" onClick={() => setTarget(o.key)}
                className={cn("flex w-full items-center gap-3 rounded-lg border p-3 text-start text-sm", target === o.key && "border-primary bg-accent")}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{o.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{o.reason}</p>
                </div>
                {!o.capable && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{t("plateau incomplet")}</span>}
                <span className="shrink-0 text-xs text-muted-foreground">~{o.eta} min</span>
                {target === o.key && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("Motif")}<span className="font-normal text-muted-foreground">{t("(journalisé, transmis au prochain hôpital, jamais montré au patient)")}</span></p>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((x) => (
              <button key={x} type="button" onClick={() => setReason(x)}
                className={cn("rounded-full border px-3 py-1 text-sm", reason === x && "border-primary bg-accent text-accent-foreground")}>{t(x)}</button>
            ))}
          </div>
          <Textarea aria-label={t("Motif")} value={explanation} onChange={(e) => setExplanation(e.target.value)} maxLength={1000} rows={3}
            placeholder={t("Expliquez pourquoi (obligatoire) : ex. salle de cathétérisme occupée jusqu'à 18 h, l'hôpital X a confirmé par téléphone.")} />
          <p className="text-xs text-muted-foreground">{explanation.trim().length < 10 ? t("Au moins 10 caractères.") : t("Visible par l'équipe qui recevra le patient.")}</p>
        </div>

        {error && <p className="text-sm text-destructive" role="alert">{t(error)}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || options === null || explanation.trim().length < 10 || options?.length === 0} onClick={confirm}>
            <ArrowRightLeft className="me-2 h-4 w-4" />{busy ? t("Réorientation…") : chosen ? t("Réorienter vers {name}", {name: chosen.name}) : t("Réorienter automatiquement")}
          </Button>
          <Button variant="ghost" onClick={onCancel}>{t("Annuler")}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
