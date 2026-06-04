import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { TopBar } from '@/components/Brand';
import { RunCheck } from '@/components/RunCheck';
import { RunScenario } from '@/components/RunScenario';
import { getAgent, latestRun } from '@/lib/agents';
import { DOMAINS, checksByDomain, checkStatuses, complianceScore, ENFORCEMENT, type Check, type CheckStatus } from '@/lib/aiuc1';
import { readActions, type ActionRecord } from '@/lib/gateway';

export const dynamic = 'force-dynamic';

const CALENDLY = 'https://calendly.com/jackottman';

// plain-English labels (drop any parenthetical jargon)
function plainLabel(c: Check): string {
  return c.label.replace(/\s*\(.*\)\s*$/, '');
}

function plainAction(a: ActionRecord): string {
  if (a.tool === 'lookup_account') return 'Looked up the account';
  if (a.tool === 'issue_refund') return `Tried to refund $${(a.args as any).amount ?? ''}`;
  if (a.tool === 'send_email') return 'Sent a confirmation email';
  if (a.tool === 'delete_account') return 'Tried to delete an account';
  return a.tool;
}

export default async function AgentReport({ params, searchParams }: { params: { id: string }; searchParams: { run?: string; show?: string } }) {
  const user = await getSessionUser();
  if (!user) redirect('/');
  const agent = await getAgent(params.id, user.id);
  if (!agent) notFound();

  const run = await latestRun(agent.id);
  const actions = await readActions(agent.id);
  const monitored = actions.length > 0; // routed through Recursiv = continuously monitored
  const runShape = run ? { reliability: run.reliability, nRuns: run.nRuns } : null;
  const statuses = checkStatuses(runShape, run?.controls, monitored);
  const controlByCode = new Map((run?.controls || []).map((c) => [c.code, c]));
  const score = complianceScore(statuses);

  const allChecks = DOMAINS.flatMap((d) => checksByDomain(d.key));
  const scored = allChecks.filter((c) => ['pass', 'fail', 'soon'].includes(statuses[c.code]));
  const passing = scored.filter((c) => statuses[c.code] === 'pass');
  const failing = scored.filter((c) => statuses[c.code] === 'fail');
  const soon = scored.filter((c) => statuses[c.code] === 'soon');
  const today = new Date().toISOString().slice(0, 10);

  const allowed = actions.filter((a) => a.decision === 'allowed');
  const held = actions.filter((a) => a.decision === 'held_for_approval');
  const blocked = actions.filter((a) => a.decision === 'blocked');
  const show = searchParams.show || 'all';
  const logRows = [...actions].reverse().filter((a) =>
    show === 'all' ? true : show === 'held' ? a.decision === 'held_for_approval' : show === 'blocked' ? a.decision === 'blocked' : a.decision === 'allowed');

  const verdict = score.mandatoryGaps > 0
    ? { label: 'Not ready yet', color: 'text-warn', dot: 'bg-warn' }
    : score.pct >= 90
    ? { label: 'Ready', color: 'text-pass', dot: 'bg-pass' }
    : { label: 'On track', color: 'text-info', dot: 'bg-info' };

  const enforcementFails = failing.filter((c) => ENFORCEMENT.has(c.code));

  return (
    <div className="min-h-screen">
      <TopBar email={user.email} />
      <main className="mx-auto max-w-2xl px-5 py-8">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="font-mono text-xs text-muted hover:text-ink">← Agents</Link>
          <div className="flex items-center gap-3">
            {run && <a href="/api/report" className="rounded-lg border border-line bg-panel px-3.5 py-2 text-sm text-muted transition-colors hover:text-ink">Download report</a>}
            <RunCheck agentId={agent.id} hasRun={!!run} autostart={(searchParams.run === '1' || !run)} />
          </div>
        </div>

        {/* 1 + 2: agent + description */}
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">{agent.name}</h1>
        <p className="mt-1 text-sm text-muted">An AI helper that {agent.purpose.charAt(0).toLowerCase() + agent.purpose.slice(1)}</p>

        {!run ? (
          <div className="mt-8 rounded-xl border border-dashed border-line bg-panel/40 p-8 text-center text-muted">
            Checking this agent now. This takes a minute. Refresh to see the score.
          </div>
        ) : (
          <>
            {/* 3: scorecard */}
            <div className="mt-6 rounded-2xl border border-line bg-panel p-6">
              <div className="flex items-end justify-between">
                <div>
                  <div className={`flex items-center gap-2 text-lg font-medium ${verdict.color}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${verdict.dot}`} />{verdict.label}
                    {monitored
                      ? <span className="rounded-full bg-pass/10 px-2 py-0.5 text-[10px] font-normal text-pass">monitored</span>
                      : <span className="rounded-full bg-warn/10 px-2 py-0.5 text-[10px] font-normal text-warn">not monitored</span>}
                  </div>
                  <div className="mt-1.5 text-sm text-muted">{score.passing} of {score.total} checks passing</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-4xl text-ink tabular">{score.pct}%</div>
                  <div className="text-[11px] text-faint">ready to pass a safety review</div>
                </div>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-bg">
                <div className="bar-grow h-full rounded-full bg-accent" style={{ width: `${score.pct}%` }} />
              </div>
              <div className="mt-3 text-[11px] text-faint">
                Last checked by Recursiv on {today}. {monitored ? 'Re-checked automatically, all year.' : 'Checked once. Recursiv customers get automatic re-checks all year.'}
              </div>
            </div>

            {/* 4: the checks, plain english, passing vs not */}
            <section className="mt-8">
              <h2 className="text-base font-medium text-ink">The {score.total} checks</h2>
              <div className="mt-3 space-y-1.5">
                {passing.map((c) => (
                  <div key={c.code} className="flex items-center gap-2.5 rounded-lg border border-line bg-panel px-3.5 py-2.5 text-sm">
                    <span className="text-pass">✓</span><span className="text-ink">{plainLabel(c)}</span>
                  </div>
                ))}
                {failing.map((c) => (
                  <div key={c.code} className="flex items-center gap-2.5 rounded-lg border border-fail/30 bg-fail/5 px-3.5 py-2.5 text-sm">
                    <span className="text-fail">✗</span><span className="text-ink">{plainLabel(c)}</span>
                  </div>
                ))}
                {soon.map((c) => (
                  <div key={c.code} className="flex items-center gap-2.5 rounded-lg border border-line bg-panel/50 px-3.5 py-2.5 text-sm">
                    <span className="text-faint">◷</span><span className="text-faint">{plainLabel(c)}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* 5: next steps */}
            {(failing.length > 0 || soon.length > 0) && (
              <section className="mt-8">
                <h2 className="text-base font-medium text-ink">Next steps</h2>
                <div className="mt-3 space-y-2">
                  {enforcementFails.length > 0 && (
                    <div className="rounded-xl border border-accent-dim bg-panel p-4 shadow-glow">
                      <div className="text-sm text-ink">Let Recursiv watch and control this agent’s actions.</div>
                      <div className="mt-1 text-[13px] text-muted">That alone fixes {enforcementFails.length} of the failing checks: every action gets checked against your rules, risky ones wait for a person, and it’s all recorded.</div>
                      <div className="mt-3"><RunScenario agentId={agent.id} label="▶ See what that looks like" /></div>
                    </div>
                  )}
                  {failing.filter((c) => !ENFORCEMENT.has(c.code)).map((c) => (
                    <div key={c.code} className="rounded-xl border border-line bg-panel p-4 text-sm">
                      <div className="text-ink">Fix: {plainLabel(c)}</div>
                      {c.fix && <div className="mt-1 text-[13px] text-muted">{c.fix}</div>}
                    </div>
                  ))}
                  {soon.length > 0 && (
                    <div className="rounded-xl border border-line bg-panel/50 p-4 text-sm text-muted">
                      Recursiv is rolling out {soon.length} more {soon.length === 1 ? 'check' : 'checks'} ({soon.map(plainLabel).join(', ')}).
                    </div>
                  )}
                  <div className="text-[12px] text-faint">Your written policies and the official yearly audit are handled by your compliance team and your auditor, not by this tool.</div>
                </div>
              </section>
            )}

            {/* 6: CTA */}
            <section className="mt-8 rounded-2xl border border-accent-dim bg-gradient-to-b from-panel to-bg p-6 shadow-glow">
              <h2 className="text-lg font-medium text-ink">Keep your agents compliant 24/7</h2>
              <p className="mt-1.5 text-sm text-muted">Recursiv checks every action your agents take, holds the risky ones for a person, records everything, and re-runs these checks automatically all year. So you stay audit-ready without thinking about it.</p>
              <a href={CALENDLY} target="_blank" rel="noreferrer" className="mt-4 inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90">Get a quote →</a>
            </section>

            {/* audit log — ground truth */}
            {monitored && (
              <section id="log" className="mt-10">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-base font-medium text-ink">Audit log</h2>
                  <span className="font-mono text-[11px] text-faint">🔒 {actions.length} actions, can’t be edited</span>
                </div>
                <p className="mt-1 text-sm text-muted">Every action this agent has taken, newest first. The record an auditor reviews.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {([['all', 'All', actions.length], ['allowed', 'Allowed', allowed.length], ['held', 'Held', held.length], ['blocked', 'Blocked', blocked.length]] as const).map(([f, lbl, n]) => (
                    <Link key={f} href={`?show=${f}`} scroll={false} className={`rounded-full border px-3 py-1 text-xs ${show === f ? 'border-accent-dim bg-panel text-accent' : 'border-line text-muted hover:text-ink'}`}>{lbl} {n}</Link>
                  ))}
                </div>
                <div className="mt-3 overflow-hidden rounded-xl border border-line">
                  {logRows.length ? logRows.map((a) => <LogRow key={a.seq} a={a} />) : <div className="px-4 py-6 text-center text-sm text-faint">No {show} actions.</div>}
                </div>
              </section>
            )}

            <p className="mt-8 text-[11px] text-faint">Demo: the agent and its tools are stand-ins, but the part that checks and records its actions is real.</p>
          </>
        )}
      </main>
    </div>
  );
}

function LogRow({ a }: { a: ActionRecord }) {
  const tag =
    a.decision === 'allowed' ? { t: 'Allowed', c: 'text-pass' } :
    a.decision === 'held_for_approval' ? { t: 'Held', c: 'text-warn' } :
    { t: 'Blocked', c: 'text-fail' };
  const when = a.ts.slice(0, 16).replace('T', ' ');
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/60 px-4 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[13px]">
          <span className={`font-medium ${tag.c}`}>{tag.t}</span>
          <span className="text-ink">{plainAction(a)}</span>
        </div>
        <div className="mt-0.5 text-[12px] text-muted">{a.reason}</div>
      </div>
      <div className="flex-none text-right">
        <div className="font-mono text-[10px] text-faint">{when} UTC</div>
        <div className="font-mono text-[10px] text-faint">#{a.hash.slice(0, 8)}</div>
      </div>
    </div>
  );
}
