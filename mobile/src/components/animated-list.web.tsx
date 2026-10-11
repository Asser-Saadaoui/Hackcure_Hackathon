import { Children, useEffect, useRef, useState, type ReactNode } from 'react';

/** Magic UI Animated List (MIT), adapted to CSS: enter once on view, retain readable DOM order.
 * No notification loop, Motion dependency, or repeated screen-reader announcements.
 */
export function AnimatedList({ children, delay = 600 }: { children: ReactNode; delay?: number }) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: .15 });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={container} className={`mascot-animated-list${visible ? ' is-visible' : ''}`} role="list">
    <style>{`
      .mascot-animated-list { display:flex; flex-direction:column; gap:10px; }
      .mascot-animated-list.is-visible > .mascot-list-item { animation:mascot-message-enter .5s cubic-bezier(.16,1,.3,1) both; }
      @keyframes mascot-message-enter { from { opacity:0; transform:translateY(8px) scale(.98); } to { opacity:1; transform:none; } }
      @media(prefers-reduced-motion:reduce) { .mascot-animated-list.is-visible > .mascot-list-item { animation:none; } }
    `}</style>
    {Children.map(children, (child, index) => <div role="listitem" className="mascot-list-item" style={{ animationDelay:`${index * Math.max(0, delay)}ms` }}>{child}</div>)}
  </div>;
}
