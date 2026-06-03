'use client';

import { useState } from 'react';

export function Login() {
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send code');
      setStage('code');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid code');
      // Full-page navigation so the just-set session cookie is sent on the next request.
      window.location.href = '/dashboard';
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-line bg-panel p-7 shadow-glow">
      <h2 className="mb-1 font-mono text-base text-ink">Sign in</h2>
      <p className="mb-6 text-sm text-muted">
        {stage === 'email' ? 'We’ll email you a one-time code.' : `Enter the code sent to ${email}.`}
      </p>

      {stage === 'email' ? (
        <form onSubmit={sendCode} className="space-y-3">
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-lg border border-line-bright bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-accent-dim"
          />
          <button
            disabled={busy}
            className="w-full rounded-lg bg-accent px-3.5 py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <input
            inputMode="numeric"
            required
            autoFocus
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="123456"
            className="tabular w-full rounded-lg border border-line-bright bg-bg px-3.5 py-2.5 text-center text-lg tracking-[0.4em] text-ink outline-none placeholder:text-faint focus:border-accent-dim"
          />
          <button
            disabled={busy}
            className="w-full rounded-lg bg-accent px-3.5 py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Verifying…' : 'Verify & continue'}
          </button>
          <button
            type="button"
            onClick={() => { setStage('email'); setOtp(''); setErr(null); }}
            className="w-full text-center font-mono text-xs text-faint hover:text-muted"
          >
            ← use a different email
          </button>
        </form>
      )}

      {err && <p className="mt-4 text-sm text-fail">{err}</p>}
    </div>
  );
}
