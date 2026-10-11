import { t, LanguageSelect } from "@/i18n";
import { useState, type FormEvent } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/Brand";
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Brand />
          <LanguageSelect />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t("Bienvenue dans votre espace")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("Équipes hospitalières du Grand Tunis")}</p>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">{t("E-mail professionnel")}</Label>
                <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">{t("Mot de passe")}</Label>
                <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {error && <p className="text-sm text-destructive" role="alert">{t(error)}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                <LogIn className="me-2 h-4 w-4" /> {busy ? t("Connexion…") : t("Se connecter")}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">{t("Prototype non validé cliniquement. Capacités et suivi ambulance simulés.")}</p>
        <p className="text-center text-xs text-muted-foreground">{t("Accès réservé au personnel autorisé. Toutes les actions sont journalisées.")}</p>
      </div>
    </div>
  );
}
