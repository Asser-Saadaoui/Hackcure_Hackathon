import { useEffect } from 'react';

/** Shared Magic UI gradient-card treatment. One delegated listener for every marked surface. */
export function MagicSurfaceEffects() {
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const selector = '.magic-surface,[id^="magic-card-"]';
    let active: HTMLElement | null = null;
    let frame = 0;
    let latest: PointerEvent | null = null;
    const reset = () => { active?.removeAttribute('data-magic-active'); active = null; };
    const move = (event: PointerEvent) => {
      if (preference.matches || !pointer.matches || event.pointerType !== 'mouse') return;
      latest = event;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!latest) return;
        const surface = latest.target instanceof Element ? latest.target.closest<HTMLElement>(selector) : null;
        if (surface !== active) { reset(); active = surface; }
        if (!active) return;
        const bounds = active.getBoundingClientRect();
        active.style.setProperty('--magic-x', `${latest.clientX - bounds.left}px`);
        active.style.setProperty('--magic-y', `${latest.clientY - bounds.top}px`);
        active.setAttribute('data-magic-active', '');
      });
    };
    const out = (event: PointerEvent) => {
      if (!event.relatedTarget || (active && event.relatedTarget instanceof Node && !active.contains(event.relatedTarget))) reset();
    };
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerout', out, { passive: true });
    window.addEventListener('blur', reset);
    preference.addEventListener('change', reset);
    return () => {
      cancelAnimationFrame(frame); reset();
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerout', out);
      window.removeEventListener('blur', reset);
      preference.removeEventListener('change', reset);
    };
  }, []);
  return <style>{`
    :is(.magic-surface,[id^="magic-card-"]) { isolation:isolate; --magic-x:50%; --magic-y:50%; --magic-from:#3885AB; --magic-to:#95BFD1; }
    .magic-surface:not([class*="sticky"]):not([class*="absolute"]):not([class*="fixed"]),[id^="magic-card-"] { position:relative; }
    :is(.magic-surface,[id^="magic-card-"])::before { content:""; position:absolute; inset:0; border-radius:inherit; padding:1px; background:radial-gradient(var(--magic-size,200px) circle at var(--magic-x) var(--magic-y),var(--magic-from),var(--magic-to),transparent 100%); -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0); -webkit-mask-composite:xor; mask-composite:exclude; opacity:0; pointer-events:none; z-index:5; }
    :is(.magic-surface,[id^="magic-card-"])::after { content:""; position:absolute; inset:1px; border-radius:inherit; background:radial-gradient(var(--magic-size,200px) circle at var(--magic-x) var(--magic-y),var(--magic-glow,#95BFD1),transparent 100%); opacity:0; pointer-events:none; z-index:1; }
    :is(.magic-surface,[id^="magic-card-"]):is([data-magic-active],:focus-within)::before { opacity:1; }
    :is(.magic-surface,[id^="magic-card-"]):is([data-magic-active],:focus-within)::after { opacity:var(--magic-opacity,.15); }
    :is(.magic-surface,[id^="magic-card-"])[role="alert"],.magic-surface[class*="destructive"],.magic-surface[class*="red-"],[id^="magic-card-danger-"] { --magic-from:#C52020; --magic-to:#F87171; }
    .magic-surface[class*="cream-"],[id^="magic-card-warning-"][id] { --magic-from:#8B6748; --magic-to:#D5BFA5; }
    @media(prefers-reduced-motion:reduce),(forced-colors:active) { :is(.magic-surface,[id^="magic-card-"])::before,:is(.magic-surface,[id^="magic-card-"])::after { display:none; } }
  `}</style>;
}
