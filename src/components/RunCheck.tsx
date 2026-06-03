'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const STEPS = ['Designing tests from what it does…', 'Running the agent…', 'Grading results…', 'Mapping to AIUC-1…'];

export function RunCheck({ agentId, hasRun, autostart }: { agentId: string; hasRun: boolean; autostart: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const fired = useRef(false);

  async function run() {
    if (running) return;
    setRunning(true);
    setErr(null);
    setStep(0);
    const ticker = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 9000);
    try {
      const res = await fetch(`/api/agents/${agentId}/run`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check failed');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Check failed');
    } finally {
      clearInterval(ticker);
      setRunning(false);
    }
  }

  useEffect(() => {
    if (autostart && !fired.current) { fired.current = true; run(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart]);

  if (running) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-line bg-panel px-4 py-2.5">
        <span className="live-dot h-2 w-2 rounded-full bg-accent" />
        <span className="text-sm text-muted">{STEPS[step]}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={run} className="rounded-lg border border-line-bright bg-panel px-4 py-2 text-sm text-ink transition-colors hover:border-accent-dim">
        {hasRun ? '↻ Re-run check' : 'Run check'}
      </button>
      {err && <span className="text-xs text-fail">{err}</span>}
    </div>
  );
}
