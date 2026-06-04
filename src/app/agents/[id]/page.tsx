import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { TopBar } from '@/components/Brand';
import { RunCheck } from '@/components/RunCheck';
import { RunScenario } from '@/components/RunScenario';
import { getAgent, latestRun } from '@/lib/agents';
import { DOMAINS, checksByDomain, checkStatuses, complianceScore, ENFORCEMENT, type Check, type CheckStatus } from '@/lib/aiuc1';
import { readActions, verifyChain, type ActionRecord } from '@/lib/gateway';

export const dynamic = 'force-dynamic';

const CALENDLY = 'https://calendly.com/jackottman';

function timeAgo(iso?: string | null): string {
  if (!iso) return 'just now';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 90) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? 's' : ''} ago`;
}

function plainAction(a: ActionRecord): string {
  if (a.tool === 'lookup_account') return 'Looked up customer account';
  if (a.tool === 'issue_refund') return `Issue refund · $${(a.args as any).amount ?? ''}`;
  if (a.tool === 'send_email') return 'Send confirmation email';
  if (a.tool === 'delete_account') return 'Delete customer account';
  return a.tool;
}

export default async function AgentReport({ params, searchParams }: { params: { id: string }; searchParams: { run?: string; show?: string } }) {
  const user = await getSessionUser();
  if (!user) redirect('/');
  const agent = await getAgent(params.id, user.id);
  if (!agent) notFound();

  const run = await latestRun(agent.id);
  const actions = await readActions(agent.id);
  const monitored = actions.length > 0;
  const chainOk = monitored && verifyChain(actions);
  const runShape = run ? { reliability: run.reliability, nRuns: run.nRuns } : null;
  const statuses = checkStatuses(runShape, run?.controls, monitored);
  const score = complianceScore(statuses);

  const allChecks = DOMAINS.flatMap((d) => checksByDomain(d.key));
  const failing = allChecks.filter((c) => statuses[c.code] === 'fail').sort((a, b) => Number(b.mandatory) - Number(a.mandatory));
  const soon = allChecks.filter((c) => statuses[c.code] === 'soon');
  const today = new Date().toISOString().slice(0, 10);
  const ref = agent.id.replace(/-/g, '').slice(0, 10);

  const held = actions.filter((a) => a.decision === 'held_for_approval');
  const blocked = actions.filter((a) => a.decision === 'blocked');
  const allowed = actions.filter((a) => a.decision === 'allowed');
  const show = searchParams.show || 'all';
  const logRows = [...actions].reverse().filter((a) =>
    show === 'all' ? true : show === 'held' ? a.decision === 'held_for_approval' : show === 'blocked' ? a.decision === 'blocked' : a.decision === 'allowed');

  const verdict = score.mandatoryGaps > 0
    ? { label: 'Not yet conformant', color: 'text-warn', dot: 'bg-warn' }
    : score.pct >= 90 ? { label: 'Conformant', color: 'text-pass', dot: 'bg-pass' }
    : { label: 'On track', color: 'text-info', dot: 'bg-info' };

  const coverage = DOMAINS.map((d) => {
    const codes = checksByDomain(d.key).map((c) => c.code);
    const scored = codes.map((c) => statuses[c]).filter((s) => s === 'pass' || s === 'fail' || s === 'soon');
    const pass = scored.filter((s) => s === 'pass').length;
    return { key: d.key, name: d.name, pass, total: scored.length, ratio: scored.length ? pass / scored.length : 1 };
  });

  const behavior = (run?.controls || []);

  return (
    <div className="min-h-screen">
      <TopBar email={user.email} />
      <main className="mx-auto max-w-3xl px-5 py-8">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="font-mono text-xs text-muted hover:text-ink">← Agents</Link>
          <div className="flex items-center gap-3">
            {run && <a href="/api/report" className="rounded-lg border border-line bg-panel px-3.5 py-2 text-sm text-muted transition-colors hover:text-ink">Export evidence</a>}
            <RunCheck agentId={agent.id} hasRun={!!run} autostart={(searchParams.run === '1' || !run)} />
          </div>
        </div>

        {/* header + attestation */}
        <div className="mt-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{agent.name}</h1>
            <p className="mt-1 text-sm text-muted">{agent.purpose}</p>
            <p className="mt-0.5 font-mono text-[11px] text-faint">model {agent.model}</p>
          </div>
          <div className="flex flex-none items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2">
            <svg width="16" height="16" viewBox="0 0 32 32" fill="none"><path d="M16 4l10 4.5v6.2c0 6.3-4.1 10.9-10 12.8C10.1 25.6 6 21 6 14.7V8.5L16 4z" stroke="#39e0c8" strokeWidth="1.6" fill="rgba(57,224,200,0.06)" /><path d="M11.5 16.2l3.2 3.3 6-7" stroke="#39e0c8" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <div className="font-mono text-[10px] leading-tight text-faint">
              <div className="text-accent">AIUC-1 CONFORMANCE EVIDENCE</div>
              <div>continuous · {today} · ref {ref}</div>
            </div>
          </div>
        </div>

        {!run ? (
          <div className="mt-8 rounded-xl border border-dashed border-line bg-panel/40 p-8 text-center text-muted">Generating evidence for this agent. This takes a minute.</div>
        ) : (
          <>
            {/* verdict + AIUC-1 control-area coverage */}
            <div className="mt-6 rounded-2xl border border-line bg-panel p-6">
              <div className="flex items-end justify-between">
                <div>
                  <div className={`flex items-center gap-2 text-lg font-medium ${verdict.color}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${verdict.dot}`} />{verdict.label}
                  </div>
                  <div className="mt-1.5 text-sm text-muted">{score.passing} of {score.total} AIUC-1 controls evidenced · Last checked {timeAgo(run.finishedAt)}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-4xl text-ink tabular">{score.pct}%</div>
                  <div className="text-[11px] text-faint">audit-ready</div>
                </div>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-bg"><div className="bar-grow h-full rounded-full bg-accent" style={{ width: `${score.pct}%` }} /></div>
              <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {coverage.map((d) => {
                  const c = d.ratio >= 1 ? 'border-pass/40 text-pass' : d.ratio >= 0.5 ? 'border-warn/40 text-warn' : 'border-fail/40 text-fail';
                  return (
                    <div key={d.key} className={`rounded-lg border bg-bg/40 px-2 py-2 text-center ${c}`}>
                      <div className="font-mono text-sm">{d.pass}/{d.total}</div>
                      <div className="mt-0.5 text-[9px] uppercase leading-tight tracking-wide text-faint">{d.name}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs text-muted">This is a point-in-time check. Continuous monitoring re-verifies every action around the clock and keeps this evidence audit-ready automatically.</span>
                <a href={CALENDLY} className="shrink-0 whitespace-nowrap rounded-lg border border-accent-dim bg-accent/5 px-3.5 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/10">Get a quote for continuous monitoring →</a>
              </div>
            </div>

            {/* RUNTIME EVIDENCE — the hero */}
            <section className="mt-8">
              <div className="flex items-baseline justify-between">
                <h2 className="text-base font-medium text-ink">Runtime evidence</h2>
                <span className="text-[11px] text-faint">what the agent actually did, captured in the path — not screenshots</span>
              </div>
              {monitored ? (
                <div className="mt-3 overflow-hidden rounded-2xl border border-accent-dim bg-panel shadow-glow">
                  <div className="grid grid-cols-3 divide-x divide-line border-b border-line text-center">
                    <div className="px-3 py-3"><div className="font-mono text-xl text-pass tabular">{allowed.length}</div><div className="text-[10px] uppercase tracking-wide text-faint">allowed</div></div>
                    <div className="px-3 py-3"><div className="font-mono text-xl text-warn tabular">{held.length}</div><div className="text-[10px] uppercase tracking-wide text-faint">held for approval</div></div>
                    <div className="px-3 py-3"><div className="font-mono text-xl text-fail tabular">{blocked.length}</div><div className="text-[10px] uppercase tracking-wide text-faint">blocked</div></div>
                  </div>
                  <div className="divide-y divide-line">
                    {logRows.map((a) => <LogRow key={a.seq} a={a} />)}
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-line bg-bg/40 px-5 py-3">
                    <span className="flex items-center gap-3 font-mono text-[11px] text-muted">
                      <span className={chainOk ? 'text-pass' : 'text-fail'}>🔒 {chainOk ? 'tamper-evident · hash chain verified' : 'chain broken'}</span>
                      <span className="hidden sm:inline">deterministic API evidence · {actions.length} actions</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {([['all', 'All'], ['held', 'Held'], ['blocked', 'Blocked']] as const).map(([f, lbl]) => (
                        <Link key={f} href={`?show=${f}`} scroll={false} className={`text-[11px] ${show === f ? 'text-accent' : 'text-faint hover:text-muted'}`}>{lbl}</Link>
                      ))}
                      <RunScenario agentId={agent.id} label="↻ Run" />
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-line bg-panel p-5">
                  <p className="text-sm text-ink">No runtime evidence yet. This agent’s actions are not routed through Recursiv.</p>
                  <p className="mt-1 text-sm text-muted">Point its tool calls at the Recursiv gateway and every action is authorized against policy, gated if high-impact, and written to a tamper-evident log. No change to the agent itself.</p>
                  <div className="mt-3"><RunScenario agentId={agent.id} label="▶ Capture a live run" /></div>
                </div>
              )}
            </section>

            {/* behavioral conformance */}
            {behavior.length > 0 && (
              <section className="mt-8">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-base font-medium text-ink">Adversarial &amp; safety testing</h2>
                  <span className="text-[11px] text-faint">continuous, re-run as models change</span>
                </div>
                <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                  {behavior.map((c) => (
                    <div key={c.code} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3.5 py-2.5 text-[13px]">
                      <span className={`flex items-center gap-2 ${c.passed ? 'text-ink' : 'text-fail'}`}>{c.passed ? <span className="text-pass">✓</span> : <span className="text-fail">✗</span>}{c.label}</span>
                      <span className="font-mono text-[10px] text-faint">{c.code}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* full coverage by AIUC-1 control area */}
            <section className="mt-8">
              <h2 className="text-base font-medium text-ink">Control coverage</h2>
              <p className="mt-1 text-[12px] text-faint">
                <span className="text-pass">✓ evidenced</span> by Recursiv · <span className="text-fail">✗ gap</span> to close ·
                {' '}<span className="text-muted">coming soon</span> = Recursiv is adding it ·
                {' '}<span className="text-muted">your policy / AIUC test</span> = handled by your compliance program or the official AIUC assessment, not this tool.
              </p>
              <div className="mt-3 space-y-4">
                {DOMAINS.map((d) => {
                  const checks = checksByDomain(d.key);
                  if (!checks.length) return null;
                  return (
                    <div key={d.key}>
                      <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-faint">{d.key} · {d.name}</div>
                      <div className="space-y-1">{checks.map((c) => <CoverageRow key={c.code} check={c} status={statuses[c.code]} />)}</div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* gaps + remediation */}
            {(failing.length > 0 || soon.length > 0) && (
              <section className="mt-8">
                <h2 className="text-base font-medium text-ink">Gaps &amp; remediation</h2>
                <div className="mt-3 space-y-2">
                  {failing.map((c) => (
                    <div key={c.code} className="rounded-xl border border-line bg-panel p-4 text-sm">
                      <div className="flex items-center justify-between"><span className="text-ink">{c.label}</span><span className="font-mono text-[10px] text-faint">{c.code}</span></div>
                      {c.fix && <div className="mt-1 text-[13px] text-muted">{c.fix}</div>}
                      {!monitored && ENFORCEMENT.has(c.code) && <div className="mt-2"><RunScenario agentId={agent.id} label="▶ Route through Recursiv to close this" /></div>}
                    </div>
                  ))}
                  {soon.length > 0 && <div className="rounded-xl border border-line bg-panel/50 p-4 text-sm text-muted">Coming soon from Recursiv (optional, not your action): {soon.map((c) => c.label).join(', ')}.</div>}
                  <p className="text-[12px] text-faint">Not shown as gaps: written policies and the annual audit. Those are owned by your compliance program (e.g. Vanta) and the AIUC auditor. Recursiv covers the runtime controls above.</p>
                </div>
              </section>
            )}

            {/* CTA */}
            <section className="mt-10 rounded-2xl border border-accent-dim bg-gradient-to-b from-panel to-bg p-6 shadow-glow">
              <h2 className="text-lg font-medium text-ink">Continuous AIUC-1 conformance, on every agent</h2>
              <p className="mt-1.5 text-sm text-muted">Recursiv authorizes and records every action your agents take, holds the risky ones, and re-tests behavior continuously. It produces the runtime agent evidence your GRC platform and ISO 42001 audit can’t collect — automatically, and ready to hand to your auditor.</p>
              <a href={CALENDLY} target="_blank" rel="noreferrer" className="mt-4 inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90">Get a quote →</a>
            </section>

            <p className="mt-6 text-[11px] text-faint">Demo: the agent and its tools are stand-ins. The runtime gateway, enforcement, and evidence are real and externally callable.</p>
          </>
        )}
      </main>
    </div>
  );
}

function LogRow({ a }: { a: ActionRecord }) {
  const tag =
    a.decision === 'allowed' ? { t: 'ALLOWED', c: 'text-pass' } :
    a.decision === 'held_for_approval' ? { t: 'HELD', c: 'text-warn' } :
    { t: 'BLOCKED', c: 'text-fail' };
  const when = a.ts.slice(0, 16).replace('T', ' ');
  const argStr = Object.entries(a.args).filter(([k]) => k !== 'amount').map(([k, v]) => `${k}: ${typeof v === 'string' ? v.slice(0, 24) : JSON.stringify(v)}`).join(', ');
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <span className={`mt-0.5 w-16 flex-none font-mono text-[10px] ${tag.c}`}>{tag.t}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-ink">{plainAction(a)}{argStr ? <span className="font-mono text-[11px] text-faint"> · {argStr}</span> : null}</div>
        <div className="mt-0.5 text-[12px] text-muted">{a.reason}</div>
      </div>
      <div className="flex-none text-right">
        <div className="font-mono text-[10px] text-faint">{when}</div>
        <div className="font-mono text-[10px] text-faint">#{a.hash.slice(0, 8)}</div>
      </div>
    </div>
  );
}

function CoverageRow({ check, status }: { check: Check; status: CheckStatus }) {
  const m =
    status === 'pass' ? { i: '✓', c: 'text-pass', t: 'evidenced' } :
    status === 'fail' ? { i: '✗', c: 'text-fail', t: 'gap' } :
    status === 'soon' ? { i: '◷', c: 'text-faint', t: 'coming soon' } :
    { i: '○', c: 'text-faint', t: check.coverage === 'gov' ? 'your policy' : 'AIUC test' };
  return (
    <div className="flex items-center justify-between gap-2 text-[13px]">
      <span className="flex items-center gap-2"><span className={m.c}>{m.i}</span><span className={status === 'pass' || status === 'fail' ? 'text-ink' : 'text-faint'}>{check.label}</span></span>
      <span className="flex items-center gap-2 font-mono text-[10px] text-faint">{m.t}<span>{check.code}</span></span>
    </div>
  );
}
