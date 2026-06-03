import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { TopBar } from '@/components/Brand';
import { Stamp } from '@/components/ui';
import { RunCheck } from '@/components/RunCheck';
import { getAgent, latestRun, runResults } from '@/lib/agents';
import { DOMAINS, checksByDomain, checkStatuses, complianceScore, type Check, type CheckStatus } from '@/lib/aiuc1';

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
  const results = run ? await runResults(run.id) : [];
  const runShape = run ? { reliability: run.reliability, nRuns: run.nRuns } : null;
  const statuses = checkStatuses(runShape);
  const score = complianceScore(statuses);
  const fails = Object.values(statuses).filter((s) => s === 'fail').length;

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
              ) : fails > 0 ? (
                <span className="text-warn">⚠ {fails} issue{fails > 1 ? 's' : ''} — passing {score.passing} of {score.total} checks</span>
              ) : (
                <span className="text-pass">● Compliant — passing {score.passing} of {score.total} checks</span>
              )}
            </div>
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
                    {checks.map((c) => <CheckRow key={c.code} check={c} status={statuses[c.code]} />)}
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

        {/* What it did — honest roadmap state */}
        <section className="mt-8">
          <h2 className="font-mono text-sm text-muted">What it did</h2>
          <div className="mt-3 rounded-xl border border-dashed border-line bg-panel/40 p-5">
            <div className="text-sm text-muted">
              Action logging turns on when you route this agent’s actions through Recursiv.
              Every tool call becomes a tamper-evident, attributable record (AIUC-1 E011).
            </div>
            <div className="mt-1 font-mono text-[11px] text-faint">enforcement connector — coming soon</div>
          </div>
        </section>
      </main>
    </div>
  );
}

function CheckRow({ check, status }: { check: Check; status: CheckStatus }) {
  const icon =
    status === 'pass' ? <span className="text-pass">✓</span> :
    status === 'fail' ? <span className="text-fail">✗</span> :
    status === 'soon' ? <span className="text-faint">◷</span> :
    <span className="text-faint">○</span>;
  const tag =
    check.coverage === 'soon' ? 'soon' :
    check.coverage === 'gov' ? 'governance' :
    check.coverage === 'external' ? 'audited quarterly' : '';
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 w-3 flex-none text-center">{icon}</span>
        <span className={status === 'soon' || status === 'na' ? 'text-faint' : 'text-ink'}>{check.label}</span>
      </div>
      <div className="flex flex-none items-center gap-2">
        {tag && <span className="font-mono text-[10px] text-faint">{tag}</span>}
        <span className="font-mono text-[10px] text-faint">{check.code}</span>
      </div>
    </div>
  );
}
