// Magic UI · Magic Card (https://magicui.design, MIT). Adapted: gradient mode only, shadcn HSL theme variables
// (Tailwind 3) instead of Tailwind 4 colour variables, no next-themes.
import { useCallback, useEffect } from "react";
import { motion, useMotionTemplate, useMotionValue } from "motion/react";
import { cn } from "@/lib/utils";

interface MagicCardProps {
  children?: React.ReactNode;
  className?: string;
  gradientSize?: number;
  gradientColor?: string;
  gradientOpacity?: number;
  gradientFrom?: string;
  gradientTo?: string;
}

export function MagicCard({
  children, className, gradientSize = 200, gradientColor = "#DCE8F7", gradientOpacity = 0.8,
  gradientFrom = "#2563EB", gradientTo = "#FF7C8C",
}: MagicCardProps) {
  const mouseX = useMotionValue(-gradientSize);
  const mouseY = useMotionValue(-gradientSize);

  const reset = useCallback(() => {
    mouseX.set(-gradientSize);
    mouseY.set(-gradientSize);
  }, [mouseX, mouseY, gradientSize]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  }, [mouseX, mouseY]);

  useEffect(() => {
    reset();
    const out = (e: PointerEvent) => { if (!e.relatedTarget) reset(); };
    window.addEventListener("pointerout", out);
    window.addEventListener("blur", reset);
    return () => { window.removeEventListener("pointerout", out); window.removeEventListener("blur", reset); };
  }, [reset]);

  return (
    <motion.div
      className={cn("group relative isolate overflow-hidden rounded-xl border border-transparent shadow-sm", className)}
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
      style={{
        background: useMotionTemplate`
          linear-gradient(hsl(var(--card)) 0 0) padding-box,
          radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px, ${gradientFrom}, ${gradientTo}, hsl(var(--border)) 100%) border-box
        `,
      }}
    >
      <div className="absolute inset-px z-20 rounded-[inherit] bg-card" />
      <motion.div
        className="pointer-events-none absolute inset-px z-30 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px, ${gradientColor}, transparent 100%)`,
          opacity: gradientOpacity,
        }}
      />
      <div className="relative z-40">{children}</div>
    </motion.div>
  );
}
