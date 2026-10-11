// Magic UI Magic Card (MIT), shared gradient mode without changing child layout.
import { forwardRef, type CSSProperties, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
interface MagicCardProps extends HTMLAttributes<HTMLDivElement> {
  gradientSize?: number; gradientColor?: string; gradientOpacity?: number;
  gradientFrom?: string; gradientTo?: string;
}
export const MagicCard = forwardRef<HTMLDivElement, MagicCardProps>(function MagicCard({
  className, children, gradientSize = 200, gradientColor = '#95BFD1', gradientOpacity = 0.15,
  gradientFrom, gradientTo, style, ...props
}, ref) {
  return <div {...props} ref={ref} className={cn('magic-surface relative rounded-xl border bg-card shadow-sm', className)}
    style={{ '--magic-size':`${gradientSize}px`, '--magic-from':gradientFrom, '--magic-to':gradientTo,
      '--magic-glow':gradientColor, '--magic-opacity':Math.min(0.15,gradientOpacity), ...style } as CSSProperties}>{children}</div>;
});
