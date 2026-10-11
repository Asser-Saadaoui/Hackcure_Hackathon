import { forwardRef, useRef } from "react";
import { Ambulance, Hospital, Smartphone, Stethoscope, UserRound } from "lucide-react";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/** How a patient reaches care through Sahhanito: patient app ↔ platform ↔ hospitals, clinics, ambulances. */
const Node = forwardRef<HTMLDivElement, { className?: string; children: React.ReactNode; label: string }>(({ className, children, label }, ref) => (
  <div className="z-10 flex flex-col items-center gap-1.5">
    <div ref={ref} className={cn("flex size-14 items-center justify-center rounded-full border-2 bg-card p-3 shadow-[0_0_20px_-12px_rgba(0,0,0,0.8)]", className)}>
      {children}
    </div>
    <span className="text-xs font-medium text-muted-foreground">{label}</span>
  </div>
));
Node.displayName = "Node";

const BEAM = { gradientStartColor: "#2563EB", gradientStopColor: "#FF7C8C", pathColor: "#94A3B8", pathOpacity: 0.25 };

export function NetworkBeam({ className }: { className?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const patient = useRef<HTMLDivElement>(null);
  const app = useRef<HTMLDivElement>(null);
  const hub = useRef<HTMLDivElement>(null);
  const hospital = useRef<HTMLDivElement>(null);
  const clinic = useRef<HTMLDivElement>(null);
  const ambulance = useRef<HTMLDivElement>(null);

  return (
    <div ref={container} className={cn("relative flex w-full items-center justify-between gap-6 overflow-hidden p-6", className)}>
      <div className="flex flex-col gap-10">
        <Node ref={patient} label={t("Patient")}><UserRound className="h-6 w-6 text-slate-700" /></Node>
        <Node ref={app} label={t("Application")}><Smartphone className="h-6 w-6 text-slate-700" /></Node>
      </div>
      <Node ref={hub} label="Sahhanito" className="size-20 border-primary/40 p-2">
        <img src="/mascot.png" alt="" className="h-full w-full object-contain" />
      </Node>
      <div className="flex flex-col gap-6">
        <Node ref={hospital} label={t("Hôpital")}><Hospital className="h-6 w-6 text-primary" /></Node>
        <Node ref={clinic} label={t("Clinique")}><Stethoscope className="h-6 w-6 text-emerald-600" /></Node>
        <Node ref={ambulance} label={t("Ambulance")}><Ambulance className="h-6 w-6 text-red-600" /></Node>
      </div>

      <AnimatedBeam containerRef={container} fromRef={patient} toRef={hub} curvature={-40} {...BEAM} />
      <AnimatedBeam containerRef={container} fromRef={app} toRef={hub} curvature={40} {...BEAM} delay={0.4} />
      <AnimatedBeam containerRef={container} fromRef={hub} toRef={hospital} curvature={-40} {...BEAM} delay={1} />
      <AnimatedBeam containerRef={container} fromRef={hub} toRef={clinic} {...BEAM} delay={1.3} />
      <AnimatedBeam containerRef={container} fromRef={hub} toRef={ambulance} curvature={40} {...BEAM} delay={1.6} />
      <AnimatedBeam containerRef={container} fromRef={ambulance} toRef={hub} curvature={-30} reverse {...BEAM} delay={2.6} />
    </div>
  );
}
