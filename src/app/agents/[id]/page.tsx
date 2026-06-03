import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { TopBar } from '@/components/Brand';
import { Stamp } from '@/components/ui';
import { RunCheck } from '@/components/RunCheck';
import { RunScenario } from '@/components/RunScenario';
import { getAgent, latestRun } from '@/lib/agents';
import { DOMAINS, checksByDomain, checkStatuses, complianceScore, type Check, type CheckStatus } from '@/lib/aiuc1';
import type { ControlResult } from '@/lib/evals';
import { readActions, verifyChain, type ActionRecord } from '@/lib/gateway';

export const dynamic = 'force-dynamic';

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

  const passedTests = results.filter((r) => r.pass).length;
  const today = new Date().toISOString().slice(0, 10);
  const attestId = agent.id.slice(0, 8);

  return (
    <div className="min-h-screen">
      <TopBar email={user.email} />
      <main className="mx-auto max-w-4xl px-5 py-8">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="font-mono text-xs text-muted hover:text-ink">← Agents</Link>
          <div className="flex items-center gap-3">
            <a href="/api/report" className="rounded-lg border border-line bg-panel px-3.5 py-2 text-sm text-muted transition-colors hover:text-ink">Download report</a>
            <RunCheck agentId={agent.id} hasRun={!!run} autostart={searchParams.run === '1' && !run} />
          </div>
        </div>

        {/* header */}
        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink">{agent.name}</h1>
            <p className="mt-1 text-muted">{agent.purpose} · <span className="font-mono text-xs text-faint">{agent.model}</span></p>
            <div className="mt-4">
              {!run ? (
                <span className="text-sm text-muted">Not checked yet — run the first check.</span>
              ) : score.mandatoryGaps > 0 ? (
                <span className="text-warn">⚠ Not yet audit-ready — {score.mandatoryGaps} mandatory gap{score.mandatoryGaps > 1 ? 's' : ''} · passing {score.passing} of {score.total} checks</span>
              ) : score.pct >= 90 ? (
                <span className="text-pass">● Audit-ready — passing {score.passing} of {score.total} checks</span>
              ) : (
                <span className="text-info">On track — passing {score.passing} of {score.total} checks</span>
              )}
            </div>
            {gatewayConnected ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-accent-dim bg-panel px-3 py-1.5 text-xs text-accent shadow-glow">
                🛡 Routed through Recursiv — {actions.length} action{actions.length > 1 ? 's' : ''} enforced &amp; logged
              </div>
            ) : (
              <div className="mt-4 max-w-lg rounded-xl border border-line bg-panel p-4">
                <div className="text-sm text-ink">This agent’s actions aren’t routed through Recursiv yet.</div>
                <div className="mt-1 text-xs text-muted">
                  Its action controls — logging, per-action authorization, human gates — are unmet because nothing’s enforcing them. Route the agent’s tool calls through the Recursiv gateway and they’re enforced + evidenced on every action.
                </div>
                <div className="mt-3"><RunScenario agentId={agent.id} label="▶ Route through Recursiv & run a customer request" /></div>
              </div>
            )}
          </div>
          {run && <Stamp score={score.pct} date={today} attestId={attestId} />}
        </div>

        {/* What we check */}
        <section className="mt-10">
          <h2 className="font-mono text-sm text-muted">What we check</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {DOMAINS.map((d) => {
              const checks = checksByDomain(d.key);
              if (!checks.length) return null;
              return (
                <div key={d.key} className="rounded-xl border border-line bg-panel p-4">
                  <div className="mb-2.5 font-mono text-[11px] uppercase tracking-wide text-faint">{d.name}</div>
                  <div className="space-y-2">
                    {checks.map((c) => <CheckRow key={c.code} check={c} status={statuses[c.code]} control={controlByCode.get(c.code)} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* How it performed */}
        {run && (
          <section className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-sm text-muted">How it performed</h2>
              <span className="font-mono text-[11px] text-faint">tested daily · readiness for the quarterly audit</span>
            </div>
            <div className="mt-3 rounded-xl border border-line bg-panel p-5">
              <div className="text-ink">Passed <span className="tabular text-pass">{passedTests}</span> of <span className="tabular">{results.length}</span> recent tests</div>
              <div className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {results.slice(0, 8).map((r) => (
                  <div key={r.id} className="flex items-center justify-between border-b border-line/60 py-1 text-sm">
                    <span className="text-muted">{r.category}</span>
                    <span className={r.pass ? 'text-pass' : 'text-fail'}>{r.pass ? '✓' : '✗'} <span className="tabular text-faint">{r.quality}</span></span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* What it did — real, enforced, tamper-evident action log */}
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-sm text-muted">What it did</h2>
            {gatewayConnected && (
              <span className={`font-mono text-[11px] ${chainOk ? 'text-pass' : 'text-fail'}`}>
                {chainOk ? '✓ tamper-evident · hash chain verified' : '⚠ hash chain broken'}
              </span>
            )}
          </div>
          {gatewayConnected ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-line bg-panel">
              {actions.map((a) => <ActionRow key={a.seq} a={a} />)}
              <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
                <span className="font-mono text-[11px] text-faint">{actions.length} actions · every call authorized + hash-chained (AIUC-1 E011 · B006 · C004)</span>
                <RunScenario agentId={agent.id} label="↻ Run another request" />
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-line bg-panel/40 p-5 text-sm text-muted">
              No actions recorded yet. Route this agent through the Recursiv gateway (above) and every tool call becomes a tamper-evident, attributable record (AIUC-1 E011).
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function ActionRow({ a }: { a: ActionRecord }) {
  const badge =
    a.decision === 'allowed' ? <span className="rounded bg-pass/10 px-1.5 py-0.5 text-[10px] text-pass">allowed</span> :
    a.decision === 'held_for_approval' ? <span className="rounded bg-warn/10 px-1.5 py-0.5 text-[10px] text-warn">held · human approval</span> :
    <span className="rounded bg-fail/10 px-1.5 py-0.5 text-[10px] text-fail">blocked</span>;
  const argStr = Object.entries(a.args).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(', ');
  return (
    <div className="border-b border-line px-5 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] text-faint">{String(a.seq).padStart(2, '0')}</span>
          <span className="font-mono text-sm text-ink">{a.tool}</span>
          {argStr && <span className="truncate font-mono text-[11px] text-muted">({argStr})</span>}
        </div>
        {badge}
      </div>
      <div className="mt-1 pl-7 text-[12px] text-muted">{a.reason}</div>
      <div className="mt-0.5 pl-7 font-mono text-[10px] text-faint">hash {a.hash.slice(0, 16)}… · prev {a.prevHash.slice(0, 8)}…</div>
    </div>
  );
}

function CheckRow({ check, status, control }: { check: Check; status: CheckStatus; control?: ControlResult }) {
  const icon =
    status === 'pass' ? <span className="text-pass">✓</span> :
    status === 'fail' ? <span className="text-fail">✗</span> :
    status === 'soon' ? <span className="text-faint">◷</span> :
    <span className="text-faint">○</span>;
  const tag =
    check.coverage === 'soon' ? 'soon' :
    check.coverage === 'gov' ? 'governance' :
    check.coverage === 'external' ? 'audited quarterly' : '';
  const showFix = (status === 'fail' || status === 'soon' || (status === 'na' && check.coverage === 'gov')) && check.fix;
  const failSample = status === 'fail' ? control?.samples?.find((s) => !s.pass) : undefined;
  return (
    <div className="text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 w-3 flex-none text-center">{icon}</span>
          <span className={status === 'soon' || status === 'na' ? 'text-faint' : 'text-ink'}>{check.label}</span>
          {check.mandatory && <span className="mt-0.5 rounded bg-line px-1 font-mono text-[9px] uppercase text-muted">req</span>}
        </div>
        <div className="flex flex-none items-center gap-2">
          {control && status !== 'na' && <span className="font-mono text-[10px] text-faint">{Math.round(control.passRate * 100)}%</span>}
          {tag && <span className="font-mono text-[10px] text-faint">{tag}</span>}
          <span className="font-mono text-[10px] text-faint">{check.code}</span>
        </div>
      </div>
      {failSample && (
        <div className="ml-5 mt-1 rounded-md border border-fail/30 bg-fail/5 px-2 py-1.5 text-[12px]">
          <div className="text-faint">probe: <span className="text-muted">“{failSample.prompt}”</span></div>
          <div className="mt-0.5 text-fail">agent: {failSample.output.slice(0, 160)}{failSample.output.length > 160 ? '…' : ''}</div>
        </div>
      )}
      {showFix && (
        <div className="ml-5 mt-1 flex items-start gap-1.5 rounded-md border border-line bg-bg/60 px-2 py-1.5 text-[12px] text-muted">
          <span className="text-accent">→</span>
          <span>{check.fix}</span>
        </div>
      )}
    </div>
  );
}
