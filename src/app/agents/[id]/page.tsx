import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { TopBar } from '@/components/Brand';
import { RunCheck } from '@/components/RunCheck';
import { RunScenario } from '@/components/RunScenario';
import { getAgent, latestRun } from '@/lib/agents';
import { DOMAINS, checksByDomain, checkStatuses, complianceScore, ENFORCEMENT, type Check, type CheckStatus } from '@/lib/aiuc1';
import type { ControlResult } from '@/lib/evals';
import { readActions, type ActionRecord } from '@/lib/gateway';

export const dynamic = 'force-dynamic';

const DOMAIN_NAME: Record<string, string> = Object.fromEntries(DOMAINS.map((d) => [d.key, d.name]));

// plain-English labels for the behavior checks (no codes)
const BEHAVIOR_LABEL: Record<string, string> = {
  D001: 'Does its job correctly',
  B002: 'Resists attempts to trick it',
  C003: 'Refuses harmful or off-topic requests',
  A005: 'Keeps private data private',
};

function plainAction(a: ActionRecord): string {
  if (a.tool === 'lookup_account') return 'Looked up the account';
  if (a.tool === 'issue_refund') return `Tried to refund $${(a.args as any).amount ?? ''}`;
  if (a.tool === 'send_email') return 'Sent a confirmation email';
  if (a.tool === 'delete_account') return 'Tried to delete an account';
  return a.tool;
}

export default async function AgentReport({ params, searchParams }: { params: { id: string }; searchParams: { run?: string } }) {
  const user = await getSessionUser();
  if (!user) redirect('/');
  const agent = await getAgent(params.id, user.id);
  if (!agent) notFound();

  const run = await latestRun(agent.id);
  const actions = await readActions(agent.id);
  const gatewayConnected = actions.length > 0;
  const runShape = run ? { reliability: run.reliability, nRuns: run.nRuns } : null;
  const statuses = checkStatuses(runShape, run?.controls, gatewayConnected);
  const controlByCode = new Map((run?.controls || []).map((c) => [c.code, c]));
  const score = complianceScore(statuses);

  const allChecks = DOMAINS.flatMap((d) => checksByDomain(d.key));
  const attention = allChecks.filter((c) => statuses[c.code] === 'fail').sort((a, b) => Number(b.mandatory) - Number(a.mandatory));
  const today = new Date().toISOString().slice(0, 10);

  const verdict = score.mandatoryGaps > 0
    ? { label: 'Not ready yet', color: 'text-warn', dot: 'bg-warn' }
    : score.pct >= 90
    ? { label: 'Ready', color: 'text-pass', dot: 'bg-pass' }
    : { label: 'On track', color: 'text-info', dot: 'bg-info' };

  const behaviorChecks = (run?.controls || []).filter((c) => BEHAVIOR_LABEL[c.code]);

  return (
    <div className="min-h-screen">
      <TopBar email={user.email} />
      <main className="mx-auto max-w-2xl px-5 py-8">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="font-mono text-xs text-muted hover:text-ink">← Agents</Link>
          <div className="flex items-center gap-3">
            {run && <a href="/api/report" className="rounded-lg border border-line bg-panel px-3.5 py-2 text-sm text-muted transition-colors hover:text-ink">Download report</a>}
            <RunCheck agentId={agent.id} hasRun={!!run} autostart={searchParams.run === '1' && !run} />
          </div>
        </div>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">{agent.name}</h1>
        <p className="mt-1 text-sm text-muted">An AI helper that {agent.purpose.charAt(0).toLowerCase() + agent.purpose.slice(1)}</p>
        <p className="mt-3 text-sm text-muted">Recursiv watches this helper to make sure it’s safe and to control what it’s allowed to do. Here’s how it’s doing.</p>

        {!run ? (
          <div className="mt-8 rounded-xl border border-dashed border-line bg-panel/40 p-8 text-center text-muted">
            Not checked yet. Run the first check to see how this agent is doing.
          </div>
        ) : (
          <>
            {/* VERDICT */}
            <div className="mt-6 rounded-2xl border border-line bg-panel p-6">
              <div className="flex items-end justify-between">
                <div>
                  <div className={`flex items-center gap-2 text-lg font-medium ${verdict.color}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${verdict.dot}`} />{verdict.label}
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
              <div className="mt-3 text-[11px] text-faint">AIUC-1 is the new safety standard for AI agents. Recursiv checks it for you. Last checked {today}.</div>
            </div>

            {/* HERO — you control what it does */}
            <section className="mt-8">
              <h2 className="text-base font-medium text-ink">You decide what this agent is allowed to do</h2>
              {gatewayConnected ? (
                <>
                  <p className="mt-1 text-sm text-muted">Last time it ran, Recursiv checked every action it took against your rules:</p>
                  <div className="mt-3 overflow-hidden rounded-2xl border border-accent-dim bg-panel shadow-glow">
                    <div className="divide-y divide-line">
                      {actions.map((a) => <ActionRow key={a.seq} a={a} />)}
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-line bg-bg/40 px-5 py-3">
                      <span className="text-[12px] text-muted">This is a permanent record that can’t be changed afterward.</span>
                      <RunScenario agentId={agent.id} label="↻ Run it again" />
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-2 rounded-2xl border border-line bg-panel p-5">
                  <p className="text-sm text-ink">Right now nothing is watching what this agent does.</p>
                  <p className="mt-1 text-sm text-muted">Connect it to Recursiv and every action it takes gets checked against your rules first. Risky ones (like a big refund) wait for a person, and everything is recorded.</p>
                  <div className="mt-3"><RunScenario agentId={agent.id} label="▶ Connect it and try a customer request" /></div>
                </div>
              )}
            </section>

            {/* HOW IT BEHAVES */}
            {behaviorChecks.length > 0 && (
              <section className="mt-8">
                <h2 className="text-base font-medium text-ink">Is it behaving safely?</h2>
                <p className="mt-1 text-sm text-muted">We sent it tricky and risky messages to see how it responds.</p>
                <div className="mt-3 space-y-1.5">
                  {behaviorChecks.map((c) => (
                    <div key={c.code} className="flex items-center gap-2.5 rounded-lg border border-line bg-panel px-3.5 py-2.5 text-sm">
                      <span className={c.passed ? 'text-pass' : 'text-fail'}>{c.passed ? '✓' : '✗'}</span>
                      <span className={c.passed ? 'text-ink' : 'text-fail'}>{BEHAVIOR_LABEL[c.code]}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* NEEDS ATTENTION */}
            {attention.length > 0 && (
              <section className="mt-8">
                <h2 className="text-base font-medium text-ink">Needs attention</h2>
                <div className="mt-3 space-y-2.5">
                  {attention.map((c) => <AttentionRow key={c.code} check={c} control={controlByCode.get(c.code)} agentId={agent.id} gatewayConnected={gatewayConnected} />)}
                </div>
              </section>
            )}

            {/* FOR AUDITORS — full detail with codes */}
            <details className="mt-8 group">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-mono text-sm text-muted hover:text-ink">
                <span>For auditors: full AIUC-1 control list</span>
                <span className="text-faint group-open:hidden">show</span>
                <span className="hidden text-faint group-open:inline">hide</span>
              </summary>
              <div className="mt-3 space-y-4">
                {DOMAINS.map((d) => {
                  const checks = checksByDomain(d.key);
                  if (!checks.length) return null;
                  return (
                    <div key={d.key}>
                      <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-faint">{d.key} · {d.name}</div>
                      <div className="space-y-1">
                        {checks.map((c) => <CoverageRow key={c.code} check={c} status={statuses[c.code]} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>

            <p className="mt-6 rounded-lg border border-line bg-panel/40 px-3 py-2 text-[11px] text-faint">
              This is a demo. The agent and its tools are stand-ins, but the part that checks and records its actions is real.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function AttentionRow({ check, control, agentId, gatewayConnected }: { check: Check; control?: ControlResult; agentId: string; gatewayConnected: boolean }) {
  const failSample = control?.samples?.find((s) => !s.pass);
  const isEnforcementGap = !gatewayConnected && ENFORCEMENT.has(check.code);
  const label = BEHAVIOR_LABEL[check.code] || check.label;
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-fail">✗</span>
        <span className="text-sm text-ink">{label}</span>
      </div>
      {failSample && (
        <div className="ml-6 mt-2 rounded-md border border-fail/30 bg-fail/5 px-2.5 py-1.5 text-[12px]">
          <div className="text-faint">we asked: <span className="text-muted">“{failSample.prompt.slice(0, 90)}{failSample.prompt.length > 90 ? '…' : ''}”</span></div>
          <div className="mt-0.5 text-fail">it did: {failSample.output.slice(0, 110)}{failSample.output.length > 110 ? '…' : ''}</div>
        </div>
      )}
      {check.fix && !isEnforcementGap && (
        <div className="ml-6 mt-2 flex items-start gap-1.5 text-[13px] text-muted"><span className="text-accent">→</span><span>{check.fix}</span></div>
      )}
      {isEnforcementGap && (
        <div className="ml-6 mt-3"><RunScenario agentId={agentId} label="▶ Connect to Recursiv to fix this" /></div>
      )}
    </div>
  );
}

function ActionRow({ a }: { a: ActionRecord }) {
  const tag =
    a.decision === 'allowed' ? { t: 'Allowed', c: 'text-pass' } :
    a.decision === 'held_for_approval' ? { t: 'Held for approval', c: 'text-warn' } :
    { t: 'Blocked', c: 'text-fail' };
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <div className="text-sm text-ink">{plainAction(a)}</div>
        <div className="mt-0.5 text-[12px] text-muted">{a.reason}</div>
      </div>
      <span className={`flex-none text-[12px] font-medium ${tag.c}`}>{tag.t}</span>
    </div>
  );
}

function CoverageRow({ check, status }: { check: Check; status: CheckStatus }) {
  const m =
    status === 'pass' ? { i: '✓', c: 'text-pass', t: 'passing' } :
    status === 'fail' ? { i: '✗', c: 'text-fail', t: 'gap' } :
    status === 'soon' ? { i: '◷', c: 'text-faint', t: 'coming soon' } :
    { i: '○', c: 'text-faint', t: check.coverage === 'gov' ? 'your GRC program' : 'quarterly audit' };
  return (
    <div className="flex items-center justify-between gap-2 text-[13px]">
      <span className="flex items-center gap-2"><span className={m.c}>{m.i}</span><span className={status === 'pass' || status === 'fail' ? 'text-ink' : 'text-faint'}>{check.label}</span></span>
      <span className="flex items-center gap-2 font-mono text-[10px] text-faint">{m.t}<span>{check.code}</span></span>
    </div>
  );
}
