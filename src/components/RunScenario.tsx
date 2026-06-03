'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const STEPS = ['Sending a customer request to the agent…', 'Agent calls its tools…', 'Recursiv gateway authorizing & logging…', 'Writing tamper-evident records…'];

export function RunScenario({ agentId, label }: { agentId: string; label: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (running) return;
    setRunning(true);
    setErr(null);
    setStep(0);
    const ticker = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 4000);
    try {
      const res = await fetch(`/api/agents/${agentId}/simulate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scenario failed');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Scenario failed');
    } finally {
      clearInterval(ticker);
      setRunning(false);
    }
  }

  if (running) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-accent-dim bg-panel px-4 py-2.5 shadow-glow">
        <span className="live-dot h-2 w-2 rounded-full bg-accent" />
        <span className="text-sm text-ink">{STEPS[step]}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button onClick={run} className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-bg shadow-glow transition-opacity hover:opacity-90">
        {label}
      </button>
      {err && <span className="text-xs text-fail">{err}</span>}
    </div>
  );
}
