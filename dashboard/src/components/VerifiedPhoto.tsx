import { useEffect, useState } from "react";
import { ImageOff, ShieldAlert, ShieldCheck } from "lucide-react";
import { verifiedImageUrl, type Integrity } from "@/api";
import { t } from "@/i18n";

/** Patient photo: integrity-checked (SHA-256) before display, thumbnail, full size in a new tab. */
export function VerifiedPhoto({ path, sha256 }: { path: string; sha256?: string }) {
  const [img, setImg] = useState<{ url: string; integrity: Integrity; sha256: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let current: string | null = null;
    verifiedImageUrl(path, sha256)
      .then((r) => { current = r.url; setImg(r); })
      .catch((e: Error) => setError(e.message));
    return () => { if (current) URL.revokeObjectURL(current); };
  }, [path, sha256]);
  const blocked = error?.includes("Intégrité");
  if (error) {
    return <p role="alert" className="flex items-center gap-1 text-xs opacity-80">{blocked ? <ShieldAlert className="h-3.5 w-3.5" /> : <ImageOff className="h-3.5 w-3.5" />} {blocked ? t("Intégrité de la photo non vérifiée : affichage bloqué.") : t("Photo indisponible")}</p>;
  }
  if (!img) return <div role="status" aria-label={t("Chargement de la photo…")} className="h-40 w-56 motion-safe:animate-pulse rounded-lg bg-secondary" />;
  return (
    <div className="space-y-1">
      <a href={img.url} target="_blank" rel="noreferrer" title={t("Ouvrir en taille réelle")}>
        <img src={img.url} alt={t("Photo envoyée par le patient")} className="max-h-64 w-56 rounded-lg object-cover" />
      </a>
      <p className="flex items-center gap-1 text-[10px] opacity-70" title={img.sha256 ? `SHA-256 ${img.sha256}` : undefined}>
        <ShieldCheck className="h-3 w-3" />
        {img.integrity === "verified" ? t("Intégrité vérifiée · SHA-256 {hash}…", { hash: img.sha256?.slice(0, 12) ?? "" }) : t("Intégrité non vérifiable (connexion non sécurisée)")}
      </p>
    </div>
  );
}
