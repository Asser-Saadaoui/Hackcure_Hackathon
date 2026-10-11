import { useEffect, useId, useState, type RefObject } from 'react';

type Props = {
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  curvature?: number;
  delay?: number;
  duration?: number;
  gradientStartColor?: string;
  gradientStopColor?: string;
};

/** Magic UI Animated Beam (MIT), adapted to SVG animation to avoid adding Motion to Expo web.
 * Retains measured ref endpoints and quadratic paths. No animation for reduced-motion users.
 */
export function AnimatedBeam({ containerRef, fromRef, toRef, curvature = 0, delay = 0,
  duration = 5, gradientStartColor = '#245CAF', gradientStopColor = '#64B8D5' }: Props) {
  const id = `care-beam-${useId().replace(/:/g, '')}`;
  const [geometry, setGeometry] = useState({ width: 0, height: 0, path: '', reverse: false });
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const update = () => {
      if (!containerRef.current || !fromRef.current || !toRef.current) return;
      const box = containerRef.current.getBoundingClientRect();
      const from = fromRef.current.getBoundingClientRect();
      const to = toRef.current.getBoundingClientRect();
      const x1 = from.left - box.left + from.width / 2;
      const y1 = from.top - box.top + from.height / 2;
      const x2 = to.left - box.left + to.width / 2;
      const y2 = to.top - box.top + to.height / 2;
      setGeometry({ width: box.width, height: box.height, reverse: x1 > x2,
        path: `M ${x1},${y1} Q ${(x1 + x2) / 2},${y1 - curvature} ${x2},${y2}` });
    };
    const observer = new ResizeObserver(update);
    for (const ref of [containerRef, fromRef, toRef]) if (ref.current) observer.observe(ref.current);
    update();
    return () => observer.disconnect();
  }, [containerRef, fromRef, toRef, curvature]);
  const { width, height, path, reverse } = geometry;
  return <svg aria-hidden="true" focusable="false" fill="none" width={width} height={height}
    viewBox={`0 0 ${width || 1} ${height || 1}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
    <path d={path} stroke="#C6D7ED" strokeWidth="2" strokeLinecap="round" />
    {!reduced && <>
      <path d={path} stroke={`url(#${id})`} strokeWidth="2.5" strokeLinecap="round" />
      <defs><linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0%" x2="0%" y1="0%" y2="0%">
        <animate attributeName="x1" values={reverse ? '90%;-10%' : '10%;110%'} dur={`${duration}s`} begin={`${delay}s`} repeatCount="indefinite" />
        <animate attributeName="x2" values={reverse ? '100%;0%' : '0%;100%'} dur={`${duration}s`} begin={`${delay}s`} repeatCount="indefinite" />
        <stop stopColor={gradientStartColor} stopOpacity="0" />
        <stop offset="12%" stopColor={gradientStartColor} />
        <stop offset="32.5%" stopColor={gradientStopColor} />
        <stop offset="100%" stopColor={gradientStopColor} stopOpacity="0" />
      </linearGradient></defs>
    </>}
  </svg>;
}
