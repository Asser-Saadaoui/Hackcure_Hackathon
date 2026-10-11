import { useLayoutEffect, useRef } from 'react';
import type { TextProps } from 'react-native';
import { annotate } from 'rough-notation';
import { AppText } from './app-text';
import { useI18n } from '@/i18n';

/** Magic UI Highlighter, using Rough Notation directly instead of adding Motion. */
export function Highlighter({ children, color='#E85466', style }: { children:string; color?:string; style?:TextProps['style'] }) {
  const elementRef=useRef<HTMLSpanElement>(null);
  const {rtl}=useI18n();
  useLayoutEffect(()=> {
    const element=elementRef.current;
    if(!element) return;
    const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
    const annotation=annotate(element,{type:'underline',color,strokeWidth:2,animationDuration:650,iterations:2,padding:3,multiline:true,rtl,animate:!preference.matches});
    let shown=false;
    const show=()=> {
      annotation.animate=!shown && !preference.matches;
      annotation.show(); shown=true;
      element.parentElement?.querySelectorAll('svg.rough-annotation').forEach(svg=>svg.setAttribute('aria-hidden','true'));
    };
    const observer=new IntersectionObserver(entries=> { if(entries.some(entry=>entry.isIntersecting)) { show(); observer.disconnect(); } });
    const resize=new ResizeObserver(()=> { if(shown) show(); });
    const motionChanged=()=> { if(shown) show(); };
    observer.observe(element); resize.observe(element);
    preference.addEventListener('change',motionChanged);
    return ()=> { annotation.remove(); observer.disconnect(); resize.disconnect(); preference.removeEventListener('change',motionChanged); };
  },[children,color,rtl]);
  return <AppText variant="small" style={style}><span ref={elementRef} style={{position:'relative',display:'inline'}}>{children}</span></AppText>;
}
