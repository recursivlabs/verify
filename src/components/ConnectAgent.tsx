'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const MODELS = ['openai/gpt-5.5', 'anthropic/claude-opus-4.8', 'anthropic/claude-sonnet-4.6', 'google/gemini-3.1-pro'];

const CAPS = [
  { key: 'tools', label: 'Uses tools / APIs' },
  { key: 'code', label: 'Runs code' },
  { key: 'email', label: 'Sends email or messages' },
  { key: 'money', label: 'Moves money or data' },
];

export function ConnectAgent() {
  const router = useRouter();
  const [mode, setMode] = useState<'recursiv' | 'own'>('recursiv');
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [model, setModel] = useState(MODELS[0]);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [caps, setCaps] = useState<string[]>(['tools']);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleCap(k: string) {
    setCaps((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));
  }

  async function submit() {
    setErr(null);
    if (!name.trim() || !purpose.trim()) { setErr('Give your agent a name and say what it does.'); return; }
    if (mode === 'own' && !endpointUrl.trim()) { setErr('Add your agent’s endpoint URL.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, name, purpose, model, systemPrompt, endpointUrl, capabilities: caps }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not connect agent');
      router.push(`/agents/${data.id}?run=1`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold text-ink">Connect an agent</h1>
      <p className="mt-2 text-muted">We’ll check it against AIUC-1 and keep the results current.</p>

      {/* mode toggle */}
      <div className="mt-7 grid grid-cols-2 gap-3">
        <button
          onClick={() => setMode('recursiv')}
          className={`rounded-xl border p-4 text-left transition-colors ${mode === 'recursiv' ? 'border-accent-dim bg-panel shadow-glow' : 'border-line bg-panel/50 hover:border-line-bright'}`}
        >
          <div className="text-sm text-ink">◇ Recursiv agent</div>
          <div className="mt-1 text-xs text-faint">Test an agent by model + instructions.</div>
        </button>
        <button
          onClick={() => setMode('own')}
          className={`rounded-xl border p-4 text-left transition-colors ${mode === 'own' ? 'border-accent-dim bg-panel shadow-glow' : 'border-line bg-panel/50 hover:border-line-bright'}`}
        >
          <div className="text-sm text-ink">⟁ Your own agent</div>
          <div className="mt-1 text-xs text-faint">Connect an agent running anywhere.</div>
        </button>
      </div>

      <div className="mt-6 space-y-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Support Resolver" className={inputCls} />
        </Field>
        <Field label="What it does">
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Answers customer billing questions" className={inputCls} />
        </Field>

        {mode === 'recursiv' ? (
          <>
            <Field label="Model">
              <select value={model} onChange={(e) => setModel(e.target.value)} className={inputCls}>
                {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Instructions (optional)">
              <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={3} placeholder="You are a billing support agent for…" className={inputCls} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Endpoint URL">
              <input value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} placeholder="https://api.yourcompany.com/agent" className={inputCls} />
            </Field>
            <div className="rounded-lg border border-line bg-bg p-3 font-mono text-[11px] text-muted">
              <div className="mb-1 text-faint">// we’ll POST tasks as {'{ input, message }'} and read the reply</div>
              <div>npm i @recursiv/verify   <span className="text-faint">// SDK connector — coming soon</span></div>
            </div>
          </>
        )}

        <Field label="What can it do?">
          <div className="grid grid-cols-2 gap-2">
            {CAPS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => toggleCap(c.key)}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${caps.includes(c.key) ? 'border-accent-dim bg-panel text-ink' : 'border-line text-muted hover:border-line-bright'}`}
              >
                {caps.includes(c.key) ? '✓ ' : ''}{c.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-faint">This sets which AIUC-1 requirements apply.</p>
        </Field>
      </div>

      {err && <p className="mt-4 text-sm text-fail">{err}</p>}

      <button
        onClick={submit}
        disabled={busy}
        className="mt-7 w-full rounded-lg bg-accent px-4 py-3 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Connecting…' : 'Connect & run first check →'}
      </button>
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-line-bright bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-accent-dim';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}
