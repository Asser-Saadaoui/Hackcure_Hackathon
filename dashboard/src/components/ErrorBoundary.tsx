import { t } from "@/i18n";
import { Component, type ReactNode } from "react";

/** Keeps a rendering error from blanking the dashboard: shows a message and a way back. */
export class ErrorBoundary extends Component<{ children: ReactNode; onReset?: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
        <p className="font-medium text-destructive">{t("Cet écran n'a pas pu s'afficher.")}</p>
        <p className="text-muted-foreground">{this.state.error.message}</p>
        <button className="rounded-md border bg-card px-3 py-1.5" onClick={() => { this.setState({ error: null }); this.props.onReset?.(); }}>{t("Retour")}</button>
      </div>
    );
  }
}
