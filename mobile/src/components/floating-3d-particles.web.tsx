import { useEffect, useRef } from 'react';

type Props = { quantity?:number; color?:string; size?:number; opacity?:number; drift?:number; depth?:number };
type Particle = { angle:number; radius:number; y:number; size:number; speed:number; opacity:number; x:number; sy:number; scale:number };

/** Adapted from the supplied Magic UI Floating 3D Particles (MIT).
 * Decorative welcome-only canvas; genuinely stops frame scheduling when hidden or motion is reduced.
 */
export function Floating3DParticles({quantity=140,color='#9DC6FF',size=2.8,opacity=.3,drift=.15,depth=.35}:Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d',{alpha:true});
    if (!canvas || !ctx) return;
    const hex = color.replace('#','');
    const full = hex.length===3 ? [...hex].map(c=>c+c).join('') : hex;
    const value = /^[\da-f]{6}$/i.test(full) ? parseInt(full,16) : 0x9dc6ff;
    const rgb = `${(value>>16)&255},${(value>>8)&255},${value&255}`;
    const t = Math.min(1,Math.max(0,depth));
    const fov=800-t*600, distance=100+t*700, depthRange=t*Math.min(400,fov+distance-1);
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width=1,height=1,particles:Particle[]=[],frame:number|null=null,intersecting=true,lastTime=0;
    const draw = (step=0) => {
      ctx.clearRect(0,0,width,height);
      for(const p of particles) {
        p.angle+=p.speed*step;
        p.y-=drift*step;
        if(p.y < -height) p.y=height;
        else if(p.y > height) p.y=-height;
        p.scale=fov/Math.max(1,fov+distance+Math.sin(p.angle)*depthRange);
        p.x=width/2+Math.cos(p.angle)*p.radius*p.scale;
        p.sy=height/2+p.y*p.scale;
      }
      particles.sort((a,b)=>a.scale-b.scale);
      for(const p of particles) {
        ctx.beginPath(); ctx.fillStyle=`rgba(${rgb},${p.opacity})`;
        ctx.arc(p.x,p.sy,Math.max(.1,p.size*p.scale),0,Math.PI*2); ctx.fill();
      }
    };
    const stop = () => { if(frame!==null) cancelAnimationFrame(frame); frame=null; lastTime=0; };
    const tick = (now:number) => {
      // Cap rendering at 30fps and make drift independent of display refresh rate.
      const elapsed=lastTime ? now-lastTime : 34;
      if(elapsed>=32) { draw(Math.min(elapsed,64)/16.67); lastTime=now; }
      frame=requestAnimationFrame(tick);
    };
    const sync = () => {
      stop();
      if(document.hidden || !intersecting) return;
      draw();
      if(!preference.matches) frame=requestAnimationFrame(tick);
    };
    const resize = () => {
      const box=canvas.getBoundingClientRect();
      width=Math.max(1,box.width); height=Math.max(1,box.height);
      const dpr=Math.max(1,Math.min(window.devicePixelRatio||1,2));
      canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
      const count=Math.max(0,Math.min(400,Math.round(quantity*(window.innerWidth<768 ? .2 : 1))));
      particles=Array.from({length:count},()=>({ angle:Math.random()*Math.PI*2, radius:Math.random()*Math.max(width,height)*1.2,
        y:(Math.random()-.5)*height*2, size:Math.max(.5,size*(.6+Math.random()*.8)), speed:.0007+Math.random()*.0005,
        opacity:Math.max(0,Math.min(1,opacity+(Math.random()-.5)*.16)),x:0,sy:0,scale:1 }));
      sync();
    };
    const resizeObserver=new ResizeObserver(resize);
    const visibilityObserver=new IntersectionObserver(([entry])=> { intersecting=entry.isIntersecting; sync(); });
    resizeObserver.observe(canvas); visibilityObserver.observe(canvas);
    preference.addEventListener('change',sync);
    document.addEventListener('visibilitychange',sync);
    resize();
    return () => { stop(); resizeObserver.disconnect(); visibilityObserver.disconnect();
      preference.removeEventListener('change',sync); document.removeEventListener('visibilitychange',sync); };
  },[quantity,color,size,opacity,drift,depth]);
  return <canvas ref={canvasRef} aria-hidden="true" className="sahhanito-welcome-particles" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',
    background:'radial-gradient(ellipse at 85% 10%, #254D79 0%, #142D50 65%)'}} />;
}
