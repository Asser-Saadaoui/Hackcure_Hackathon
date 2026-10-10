import { useEffect, useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { LevelBadge } from "@/components/LevelBadge";
import { api } from "@/api";
import { LEVEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Level } from "@/types";

const RANK: Record<Level, number> = { LOW: 0, UNCERTAIN: 1, HIGH: 2, EMERGENCY: 3 };
const LEVELS: ("EMERGENCY" | "HIGH" | "LOW")[] = ["EMERGENCY", "HIGH", "LOW"];

/** Report that the AI under-triaged (false negative) — or over-triaged — this patient. Saved for the AI team. */
export function FeedbackPanel({ referralId, aiLevel, onDone, onCancel }: { referralId: string; aiLevel: Level | null; onDone: () => void; onCancel: () => void }) {
  const [kind, setKind] = useState<"FALSE_NEGATIVE" | "FALSE_POSITIVE">("FALSE_NEGATIVE");
  const ai = aiLevel ?? "UNCERTAIN";
  const allowed = LEVELS.filter((l) => (kind === "FALSE_NEGATIVE" ? RANK[l] > RANK[ai] : RANK[l] < RANK[ai]));
  const [actual, setActual] = useState<"EMERGENCY" | "HIGH" | "LOW" | null>(null);
  const [signs, setSigns] = useState<string[]>([]);
  const [options, setOptions] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.feedbackOptions().then((o) => setOptions(o.missedSigns)).catch(() => {}); }, []);
  useEffect(() => { setActual(allowed[0] ?? null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kind]);

  async function submit() {
    if (!actual) return;
    setBusy(true);
    setError(null);
    try {
      await api.reportFeedback(referralId, { kind, actualLevel: actual, missedSigns: [...signs, ...(other.trim() ? [other.trim()] : [])], note: note.trim() || undefined });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-amber-300">
      <CardContent className="space-y-4 pt-5">
        <div>
          <p className="flex items-center gap-2 font-semibold"><Flag className="h-4 w-4" />Signaler une erreur de triage</p>
          <p className="text-sm text-muted-foreground">Niveau donné par Sahhanito : <LevelBadge level={ai} className="ml-1 align-middle" />. Votre retour sert à corriger les règles et le modèle ; il ne modifie pas ce dossier.</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          {([["FALSE_NEGATIVE", "Sous-évalué (faux négatif)"], ["FALSE_POSITIVE", "Surévalué"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setKind(k)} className={cn("flex-1 rounded-md px-3 py-1.5 text-sm", kind === k ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>{label}</button>
          ))}
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Niveau réel selon votre évaluation</p>
          {allowed.length === 0 ? (
            <p className="text-sm text-muted-foreground">{kind === "FALSE_NEGATIVE" ? "Le niveau était déjà le plus élevé." : "Le niveau était déjà le plus bas."}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allowed.map((l) => (
                <button key={l} onClick={() => setActual(l)}
                  className={cn("rounded-full border px-3 py-1 text-sm", actual === l ? `${LEVEL[l].className}` : "bg-card")}>{LEVEL[l].label}</button>
              ))}
            </div>
          )}
        </div>

        {kind === "FALSE_NEGATIVE" && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Signes manqués</p>
            <div className="flex flex-wrap gap-1.5">
              {options.map((o) => (
                <button key={o} onClick={() => setSigns((s) => (s.includes(o) ? s.filter((x) => x !== o) : [...s, o]))}
                  className={cn("rounded-full border px-2.5 py-1 text-xs", signs.includes(o) && "border-primary bg-accent text-accent-foreground")}>{o}</button>
              ))}
            </div>
            <input value={other} onChange={(e) => setOther(e.target.value)} maxLength={120} placeholder="Autre signe manqué (facultatif)"
              className="w-full rounded-md border bg-card px-3 py-1.5 text-sm" />
          </div>
        )}

        <Textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Commentaire clinique (facultatif) : ce qui aurait dû alerter, diagnostic retenu…" />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button disabled={busy || !actual} onClick={submit}><Flag className="mr-2 h-4 w-4" />{busy ? "Envoi…" : "Envoyer le signalement"}</Button>
          <Button variant="ghost" onClick={onCancel}>Annuler</Button>
        </div>
      </CardContent>
    </Card>
  );
}
