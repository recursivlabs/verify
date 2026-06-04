import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { TopBar } from '@/components/Brand';
import { RunCheck } from '@/components/RunCheck';
import { RunScenario } from '@/components/RunScenario';
import { getAgent, latestRun } from '@/lib/agents';
import { DOMAINS, checksByDomain, checkStatuses, complianceScore, type Check, type CheckStatus } from '@/lib/aiuc1';
import type { ControlResult } from '@/lib/evals';
import { readActions, verifyChain, type ActionRecord } from '@/lib/gateway';

export const dynamic = 'force-dynamic';

const DOMAIN_NAME: Record<string, string> = Object.fromEntries(DOMAINS.map((d) => [d.key, d.name]));

export default async function AgentReport({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { run?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect('/');
  const agent = await getAgent(params.id, user.id);
  if (!agent) notFound();

  const run = await latestRun(agent.id);
  const results = run?.results ?? [];
  const actions = await readActions(agent.id);
  const gatewayConnected = actions.length > 0;
  const chainOk = gatewayConnected && verifyChain(actions);
  const runShape = run ? { reliability: run.reliability, nRuns: run.nRuns } : null;
  const statuses = checkStatuses(runShape, run?.controls, gatewayConnected);
  const controlByCode = new Map((run?.controls || []).map((c) => [c.code, c]));
  const score = complianceScore(statuses);

  const allChecks = DOMAINS.flatMap((d) => checksByDomain(d.key));
  const attention = allChecks.filter((c) => statuses[c.code] === 'fail').sort((a, b) => Number(b.mandatory) - Number(a.mandatory));
  const soon = allChecks.filter((c) => statuses[c.code] === 'soon');
  const passing = allChecks.filter((c) => statuses[c.code] === 'pass');

  const verdict = score.mandatoryGaps > 0
    ? { label: 'Not yet audit-ready', color: 'text-warn', dot: 'bg-warn' }
    : score.pct >= 90
    ? { label: 'Audit-ready', color: 'text-pass', dot: 'bg-pass' }
    : { label: 'On track', color: 'text-info', dot: 'bg-info' };

  const passedTests = results.filter((r) => r.pass).length;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen">
      <TopBar email={user.email} />
      <main className="mx-auto max-w-3xl px-5 py-8">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="font-mono text-xs text-muted hover:text-ink">← Agents</Link>
          <div className="flex items-center gap-3">
            {run && <a href="/api/report" className="rounded-lg border border-line bg-panel px-3.5 py-2 text-sm text-muted transition-colors hover:text-ink">Download report</a>}
            <RunCheck agentId={agent.id} hasRun={!!run} autostart={searchParams.run === '1' && !run} />
          </div>
        </div>

        <h1 className="mt-6 text-2xl font-semibold text-ink">{agent.name}</h1>
        <p className="mt-1 text-sm text-muted">{agent.purpose} · <span className="font-mono text-xs text-faint">{agent.model}</span></p>

        {!run ? (
          <div className="mt-8 rounded-xl border border-dashed border-line bg-panel/40 p-8 text-center text-muted">
            Not checked yet. Run the first check to see how ready this agent is.
          </div>
        ) : (
          <>
            {/* 1 — VERDICT */}
            <div className="mt-6 rounded-2xl border border-line bg-panel p-6">
              <div className="flex items-end justify-between">
                <div>
                  <div className={`flex items-center gap-2 text-lg font-medium ${verdict.color}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${verdict.dot}`} />
                    {verdict.label}
                  </div>
                  <div className="mt-1.5 text-sm text-muted">
                    {score.passing} of {score.total} AIUC-1 checks passing
                    {attention.length > 0 && <> · <span className="text-warn">{attention.length} need{attention.length === 1 ? 's' : ''} attention</span></>}
                    {soon.length > 0 && <> · <span className="text-faint">{soon.length} coming soon</span></>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-4xl text-ink tabular">{score.pct}%</div>
                  <div className="text-[11px] text-faint">ready for an AIUC-1 audit</div>
                </div>
              </div>
              {/* progress bar */}
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-bg">
                <div className="bar-grow h-full rounded-full bg-accent" style={{ width: `${score.pct}%` }} />
              </div>
              {/* one-line "what happened" */}
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                <span>✓ Behavior tested — passed {passedTests} of {results.length}</span>
                <span>{gatewayConnected ? `🛡 Actions enforced by Recursiv — ${actions.length} logged` : '○ Actions not yet routed through Recursiv'}</span>
                <span className="font-mono text-faint">verified by Recursiv · {today}</span>
              </div>
            </div>

            {/* 2 — NEEDS ATTENTION (the to-do list) */}
            {(attention.length > 0 || soon.length > 0) && (
              <section className="mt-8">
                <h2 className="font-mono text-sm text-muted">Needs attention</h2>
                <div className="mt-3 space-y-2.5">
                  {attention.map((c) => <AttentionRow key={c.code} check={c} control={controlByCode.get(c.code)} agentId={agent.id} gatewayConnected={gatewayConnected} />)}
                  {soon.map((c) => (
                    <div key={c.code} className="rounded-xl border border-line bg-panel/50 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-faint">◷ {c.label}</span>
                        <span className="font-mono text-[10px] text-faint">{DOMAIN_NAME[c.domain]} · {c.code}</span>
                      </div>
                      <div className="mt-1 text-xs text-faint">Recursiv is rolling this out.</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 3 — PASSING (collapsed) */}
            {passing.length > 0 && (
              <details className="mt-8 group">
                <summary className="flex cursor-pointer list-none items-center gap-2 font-mono text-sm text-muted hover:text-ink">
                  <span className="text-pass">✓</span> {passing.length} passing
                  <span className="text-faint group-open:hidden">— show</span>
                  <span className="hidden text-faint group-open:inline">— hide</span>
                </summary>
                <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                  {passing.map((c) => (
                    <div key={c.code} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm">
                      <span className="flex items-center gap-2 text-ink"><span className="text-pass">✓</span>{c.label}</span>
                      <span className="font-mono text-[10px] text-faint">{c.code}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* 4 — EVIDENCE */}
            <section className="mt-8 grid gap-4 sm:grid-cols-2">
              {/* behavior tests */}
              <details className="rounded-xl border border-line bg-panel p-4" open>
                <summary className="flex cursor-pointer list-none items-center justify-between">
                  <span className="font-mono text-xs text-muted">How it behaved</span>
                  <span className="text-sm text-ink">passed {passedTests}/{results.length}</span>
                </summary>
                <div className="mt-3 space-y-1.5">
                  {results.slice(0, 8).map((r) => (
                    <div key={r.id} className="flex items-center justify-between border-b border-line/60 py-1 text-[13px] last:border-b-0">
                      <span className="truncate text-muted">{r.category}</span>
                      <span className={r.pass ? 'text-pass' : 'text-fail'}>{r.pass ? '✓' : '✗'}</span>
                    </div>
                  ))}
                </div>
              </details>

              {/* action log */}
              <details className="rounded-xl border border-line bg-panel p-4" open>
                <summary className="flex cursor-pointer list-none items-center justify-between">
                  <span className="font-mono text-xs text-muted">What it did</span>
                  <span className="text-sm text-ink">{gatewayConnected ? `${actions.length} actions` : 'not routed'}</span>
                </summary>
                {gatewayConnected ? (
                  <>
                    <div className="mt-3 space-y-2">
                      {actions.map((a) => <ActionRow key={a.seq} a={a} />)}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
                      <span className={`font-mono text-[10px] ${chainOk ? 'text-pass' : 'text-fail'}`}>{chainOk ? '✓ tamper-evident' : '⚠ chain broken'}</span>
                      <RunScenario agentId={agent.id} label="↻ Run another request" />
                    </div>
                  </>
                ) : (
                  <div className="mt-3 text-[13px] text-muted">
                    This agent’s actions aren’t routed through Recursiv yet. Connect it (see “Needs attention”) and every tool call is enforced + logged here.
                  </div>
                )}
              </details>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

// A failing/gap check shown as an actionable to-do, with the fix and any evidence.
function AttentionRow({ check, control, agentId, gatewayConnected }: { check: Check; control?: ControlResult; agentId: string; gatewayConnected: boolean }) {
  const failSample = control?.samples?.find((s) => !s.pass);
  const isEnforcementGap = !gatewayConnected && ['E011', 'E005', 'E007', 'B006', 'B007', 'B004', 'C004', 'C005', 'A004'].includes(check.code);
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-fail">✗</span>
          <span className="text-sm text-ink">{check.label}</span>
          {check.mandatory && <span className="mt-0.5 rounded bg-warn/15 px-1 font-mono text-[9px] uppercase text-warn">required</span>}
        </div>
        <span className="font-mono text-[10px] text-faint">{DOMAIN_NAME[check.domain]} · {check.code}</span>
      </div>
      {failSample && (
        <div className="ml-6 mt-2 rounded-md border border-fail/30 bg-fail/5 px-2.5 py-1.5 text-[12px]">
          <div className="text-faint">we sent: <span className="text-muted">“{failSample.prompt.slice(0, 90)}{failSample.prompt.length > 90 ? '…' : ''}”</span></div>
          <div className="mt-0.5 text-fail">it responded: {failSample.output.slice(0, 120)}{failSample.output.length > 120 ? '…' : ''}</div>
        </div>
      )}
      {check.fix && (
        <div className="ml-6 mt-2 flex items-start gap-1.5 text-[13px] text-muted">
          <span className="text-accent">→</span><span>{check.fix}</span>
        </div>
      )}
      {isEnforcementGap && (
        <div className="ml-6 mt-3"><RunScenario agentId={agentId} label="▶ Route through Recursiv & run a request" /></div>
      )}
    </div>
  );
}

function ActionRow({ a }: { a: ActionRecord }) {
  const badge =
    a.decision === 'allowed' ? <span className="text-pass">✓ allowed</span> :
    a.decision === 'held_for_approval' ? <span className="text-warn">✋ held</span> :
    <span className="text-fail">⛔ blocked</span>;
  const argStr = Object.entries(a.args).map(([k, v]) => `${k}: ${typeof v === 'string' ? v.slice(0, 20) : JSON.stringify(v)}`).join(', ');
  return (
    <div className="border-b border-line/60 py-2 text-[13px] last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-ink">{a.tool}<span className="text-faint">{argStr ? ` (${argStr})` : ''}</span></span>
        <span className="flex-none font-mono text-[11px]">{badge}</span>
      </div>
    </div>
  );
}
