import type { CSSProperties, ReactNode } from 'react';
import type { TextProps } from 'react-native';
import { AppText } from './app-text';

/** Magic UI Animated Shiny Text (MIT), with an opaque base gradient for readable emergency labels. */
export function AnimatedShinyText({ children, color, style, shimmerWidth = 100, enabled = true }: {
  children: ReactNode; color: string; style?: TextProps['style']; shimmerWidth?: number; enabled?: boolean;
}) {
  return <AppText style={style}>
    <style>{`
      .call-190-shiny { color:var(--shiny-base); }
      @supports (background-clip:text) or (-webkit-background-clip:text) {
        .call-190-shiny.is-shiny { background-image:linear-gradient(100deg,transparent 15%,var(--shiny-glare) 50%,transparent 85%),linear-gradient(var(--shiny-base),var(--shiny-base)); background-size:var(--shiny-width) 100%,100% 100%; background-repeat:no-repeat; background-clip:text; -webkit-background-clip:text; color:transparent; animation:call-190-shiny-text 8s ease-in-out infinite; }
      }
      @keyframes call-190-shiny-text { 0%,90%,100% { background-position:calc(-100% - var(--shiny-width)) 0,0 0; } 30%,60% { background-position:calc(100% + var(--shiny-width)) 0,0 0; } }
      [dir=rtl] .call-190-shiny.is-shiny { animation-direction:reverse; }
      @media(prefers-reduced-motion:reduce) { .call-190-shiny.is-shiny { animation:none; background:none; color:var(--shiny-base); } }
      @media(forced-colors:active) { .call-190-shiny.is-shiny { animation:none; background:none; color:ButtonText; } }
    `}</style>
    <span className={`call-190-shiny${enabled ? ' is-shiny' : ''}`} style={{
      '--shiny-width':`${Math.max(1, shimmerWidth)}px`, '--shiny-base':color,
      '--shiny-glare':color === '#FFFFFF' ? '#FCE5B1' : '#185079',
    } as CSSProperties}>{children}</span>
  </AppText>;
}
