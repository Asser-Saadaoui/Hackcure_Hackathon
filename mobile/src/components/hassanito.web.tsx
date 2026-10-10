import { Mascot } from 'page-mascot';
import { Asset } from 'expo-asset';
import { useI18n } from '@/i18n';
import { mascotCopy, resolveMascotState, type MascotProps } from './hassanito-state';

const directions = Asset.fromModule(require('../../assets/mascots/sahhanito-directions.webp')).uri;
const reactions = Asset.fromModule(require('../../assets/mascots/sahhanito-reactions.webp')).uri;
export function Hassanito({ state = 'idle', compact = false }: MascotProps) {
  const { language, rtl } = useI18n();
  const active = resolveMascotState(state);
  const size = compact ? 64 : 112;
  return <section className={`hassanito hassanito-${active}`} dir={rtl ? 'rtl' : 'ltr'} aria-label="Hassanito">
    <style>{`
      .hassanito{display:flex;align-items:center;gap:12px;flex-wrap:wrap;max-width:100%;color:#163b39;font:14px/1.5 system-ui}
      .hassanito-bubble{flex:1;min-width:160px;padding:12px 16px;border:1px solid #b9d9d1;border-radius:18px;background:#f1faf5}
      .hassanito-thinking .hassanito-bubble{border-color:#769dcb}
      .hassanito-alert .hassanito-bubble{background:#fff3ee;border-color:#b64e3b;color:#742c23}
      .hassanito-figure{flex-shrink:0}
      .hassanito-thinking .hassanito-figure{animation:hassanito-breathe 2s ease-in-out infinite}
      @keyframes hassanito-breathe{50%{opacity:.7}}
      @media(prefers-reduced-motion:reduce){.hassanito *{animation:none!important;transition:none!important}}
    `}</style>
    {active === 'alert' ? <div className="hassanito-figure" role="img" aria-label="Hassanito, calm and still"
      style={{ width: size, height: size, backgroundImage: `url(${directions})`, backgroundSize: '300% 300%', backgroundPosition: '50% 50%' }} />
      : <Mascot directions={directions} reactions={reactions} size={size} label="Hassanito, Sahhanito’s owl companion" className="hassanito-figure" />}
    <div className="hassanito-bubble" role={active === 'alert' ? 'alert' : 'status'}>{mascotCopy(language, active)}</div>
  </section>;
}
