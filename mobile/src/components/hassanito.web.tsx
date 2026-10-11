import { createPortal } from 'react-dom';
import { useWindowDimensions } from 'react-native';
import { Mascot } from 'page-mascot';
import { Asset } from 'expo-asset';
import { useFocusEffect, usePathname } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { mascotCopy, mascotFrame, resolveMascotState, type MascotProps } from './hassanito-state';

const directions = Asset.fromModule(require('../../assets/mascots/sahhanito-directions.webp')).uri;
const reactions = Asset.fromModule(require('../../assets/mascots/sahhanito-reactions.webp')).uri;
export function Hassanito({ state = 'idle', compact = false, message, presentation = 'inline' }: MascotProps) {
  const { width, fontScale } = useWindowDimensions();
  const path = usePathname();
  const docked = width >= 1400 && fontScale <= 1.4 && path !== '/emergency';
  const { language, rtl } = useI18n();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  const active = resolveMascotState(state);
  const [reduceMotion, setReduceMotion] = useState(() => typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const frame = mascotFrame(active);
  const size = docked ? 168 : presentation === 'hero' ? 190 : compact ? 64 : 112;
  const appFrame = active !== 'idle' && active !== 'listening';
  const companion = <section className={`hassanito hassanito-${active} hassanito-${docked ? 'hero' : presentation}${docked ? ' hassanito-docked' : ''}${focused ? '' : ' hassanito-paused'}`} dir={rtl ? 'rtl' : 'ltr'} aria-label="Hassanito">
    <style>{`
      .hassanito{display:flex;align-items:center;gap:12px;flex-wrap:wrap;max-width:100%;color:#185079;font:14px/1.5 system-ui}
      .hassanito-docked{position:fixed;inset-inline-end:24px;bottom:104px;width:168px;z-index:20;pointer-events:none}
      .hassanito-docked .hassanito-figure{pointer-events:auto}
      .hassanito-bubble{flex:1;min-width:140px;padding:12px 16px;border:1px solid #D6E5EC;border-radius:18px;background:#fff}
      .hassanito-hero{flex-direction:column;gap:0;isolation:isolate;text-align:center}
      .hassanito-hero .hassanito-bubble{flex:auto;width:100%;min-width:0;box-sizing:border-box;box-shadow:0 8px 25px #2445660c}
      .hassanito-hero .hassanito-figure{filter:drop-shadow(0 12px 7px #35628b18)}
      .hassanito-docked .hassanito-bubble{position:absolute;width:1px;height:1px;min-width:0;overflow:hidden;clip-path:inset(50%);padding:0;border:0;box-shadow:none}
      .hassanito-thinking .hassanito-bubble{border-color:#3885AB}
      .hassanito-alert .hassanito-bubble{background:#fff3ee;border-color:#b64e3b;color:#742c23}
      .hassanito-figure{flex-shrink:0;animation:hassanito-float 3.6s ease-in-out infinite}
      .hassanito-alert .hassanito-figure{animation:none}
      .hassanito-thinking .hassanito-figure{animation:hassanito-think 2.4s ease-in-out infinite}
      .hassanito-happy .hassanito-figure{animation:hassanito-celebrate .8s ease-in-out 2}
      .hassanito-paused *{animation:none!important}
      @keyframes hassanito-float{50%{transform:translateY(-6px)}}
      @keyframes hassanito-think{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
      @keyframes hassanito-celebrate{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
      @media(max-width:600px){.hassanito-hero .hassanito-figure{width:140px!important;height:140px!important}}
      @media(prefers-reduced-motion:reduce){.hassanito *{animation:none!important;transition:none!important}}
    `}</style>
    {appFrame || reduceMotion || !focused ? <div className="hassanito-figure" role="img" aria-label={active === 'alert' ? 'Hassanito, calm and still' : `Hassanito, ${active}`}
      style={{ width: size, height: size, backgroundImage: `url(${frame.sheet === 'directions' ? directions : reactions})`, backgroundSize: '300% 300%', backgroundPosition: `${(frame.index % 3) * 50}% ${Math.floor(frame.index / 3) * 50}%` }} />
      : <Mascot directions={directions} reactions={reactions} size={size} label="Hassanito, Sahhanito’s owl companion" className="hassanito-figure" />}
    <div className="hassanito-bubble" role={active === 'alert' ? 'alert' : 'status'}>{message ?? mascotCopy(language, active)}</div>
  </section>;
  // Escape scroll containers and animated route transforms; keep the same screen-owned state.
  if (docked && typeof document !== 'undefined') return focused ? createPortal(companion, document.body) : null;
  return companion;
}
