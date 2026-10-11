import { t, LanguageSelect } from "@/i18n";
import { useState, type FormEvent } from "react";
import { GridPattern } from "@/components/ui/grid-pattern";
import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button";
import { MagicCard } from "@/components/ui/magic-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/Brand";
import { NetworkBeam } from "@/components/NetworkBeam";
import { api, session } from "@/api";
import type { StaffUser } from "@/types";

export function LoginScreen({ onLogin }: { onLogin: (u: StaffUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token, user } = await api.login(email, password);
      session.set(token);
      onLogin(user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <GridPattern width={44} height={44} squares={[[3, 2], [5, 6], [9, 3], [14, 8], [18, 4], [22, 9], [7, 11], [26, 5]]}
        className="fill-primary/5 stroke-primary/10 [mask-image:radial-gradient(900px_circle_at_center,white,transparent)]" />
      <div className="relative z-10 grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="hidden space-y-4 lg:block">
          <h2 className="text-2xl font-semibold tracking-tight">{t("Le patient, relié au bon soin")}</h2>
          <p className="text-sm text-muted-foreground">{t("Triage par l’application, orientation vers l’hôpital ou la clinique adaptés, suivi de l’ambulance en direct.")}</p>
          <NetworkBeam className="h-[340px]" />
        </div>
        <div className="mx-auto w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <Brand />
            <LanguageSelect />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{t("Bienvenue dans votre espace")}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{t("Équipes hospitalières du Grand Tunis")}</p>
            </div>
          </div>
          <MagicCard>
            <form onSubmit={submit} className="space-y-4 p-6">
              <div className="space-y-1.5">
                <Label htmlFor="email">{t("E-mail professionnel")}</Label>
                <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">{t("Mot de passe")}</Label>
                <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {error && <p className="text-sm text-destructive" role="alert">{t(error)}</p>}
              <InteractiveHoverButton type="submit" className="w-full" disabled={busy}>
                {busy ? t("Connexion…") : t("Se connecter")}
              </InteractiveHoverButton>
            </form>
          </MagicCard>
          <p className="text-center text-xs text-muted-foreground">{t("Prototype non validé cliniquement. Capacités et suivi ambulance simulés.")}</p>
          <p className="text-center text-xs text-muted-foreground">{t("Accès réservé au personnel autorisé. Toutes les actions sont journalisées.")}</p>
        </div>
      </div>
    </div>
  );
}
