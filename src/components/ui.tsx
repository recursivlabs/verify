'use client';

import { useEffect, useRef, useState } from 'react';

/** Count a number up when it scrolls into view. */
export function CountUp({ to, suffix = '', duration = 900 }: { to: number; suffix?: string; duration?: number }) {
  const [n, setN] = useState(0);
  const started = useRef(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !started.current) {
        started.current = true;
        const start = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setN(Math.round(to * eased));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);
  return <span ref={ref} className="tabular">{n}{suffix}</span>;
}

/** The "Continuously verified by Recursiv" stamp. */
export function Stamp({ score, date, attestId }: { score: number; date: string; attestId: string }) {
  return (
    <div className="w-[210px] rounded-xl border border-line bg-panel p-4 shadow-glow">
      <div className="flex items-center gap-2">
        <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
          <path d="M16 4l10 4.5v6.2c0 6.3-4.1 10.9-10 12.8C10.1 25.6 6 21 6 14.7V8.5L16 4z" stroke="#39e0c8" strokeWidth="1.6" fill="rgba(57,224,200,0.06)" />
          <path d="M11.5 16.2l3.2 3.3 6-7" stroke="#39e0c8" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="font-mono text-[11px] uppercase leading-tight tracking-wide text-accent">Continuously<br />verified</span>
      </div>
      <div className="mt-3 font-mono text-3xl text-ink tabular">{score}</div>
      <div className="mt-0.5 text-xs text-muted">compliance score</div>
      <div className="mt-3 space-y-0.5 border-t border-line pt-2 font-mono text-[10px] text-faint">
        <div>AIUC-1 · {date}</div>
        <div>by Recursiv · {attestId}</div>
      </div>
    </div>
  );
}
