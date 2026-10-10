import { Badge } from "@/components/ui/badge";
import { LEVEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Level } from "@/types";

export function LevelBadge({ level, className }: { level: Level | null; className?: string }) {
  const cfg = LEVEL[level ?? "UNCERTAIN"];
  return <Badge className={cn(cfg.className, className)}>{cfg.label}</Badge>;
}
