import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { TopBar } from '@/components/Brand';
import { CountUp } from '@/components/ui';
import { listAgents, latestRuns } from '@/lib/agents';
import { DOMAINS, CHECKS, checkStatuses, complianceScore, type CheckStatus } from '@/lib/aiuc1';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const user = await getSessionUser();
  if (!user) redirect('/');

  let agents: Awaited<ReturnType<typeof listAgents>> = [];
  let dbError = false;
  try {
    agents = await listAgents(user.id);
  } catch {
    dbError = true;
  }
  const runs: Awaited<ReturnType<typeof latestRuns>> = agents.length
    ? await latestRuns(agents.map((a) => a.id)).catch(() => ({}))
    : {};

  // per-agent statuses + compliance
  const perAgent = agents.map((a) => {
    const run = runs[a.id] ? { reliability: runs[a.id].reliability, nRuns: runs[a.id].nRuns } : null;
    const statuses = checkStatuses(run);
    const score = complianceScore(statuses);
    const fails = Object.values(statuses).filter((s) => s === 'fail').length;
    return { agent: a, run: runs[a.id] || null, statuses, score, fails };
  });

  const scored = perAgent.filter((p) => p.run);
  const orgPct = scored.length ? Math.round(scored.reduce((s, p) => s + p.score.pct, 0) / scored.length) : 0;

  // domain rollup across all agents
  const domainRollup = DOMAINS.map((d) => {
    const codes = CHECKS.filter((c) => c.domain === d.key).map((c) => c.code);
    let pass = 0, total = 0;
    for (const p of perAgent.length ? perAgent : [{ statuses: checkStatuses(null) as Record<string, CheckStatus> }]) {
      for (const code of codes) {
        const s = p.statuses[code];
        if (s === 'pass' || s === 'fail' || s === 'soon') { total++; if (s === 'pass') pass++; }
      }
    }
    return { ...d, pass, total };
  });

  return (
    <div className="min-h-screen">
      <TopBar email={user.email} />
      <main className="mx-auto max-w-5xl px-5 py-10">
        {agents.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* headline */}
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-ink sm:text-3xl">
                  Your agents are <span className="text-accent"><CountUp to={orgPct} suffix="%" /></span> ready for an AIUC-1 audit.
                </h1>
                <p className="mt-2 font-mono text-xs text-muted">
                  Continuously verified by Recursiv · updated just now
                </p>
              </div>
              <a href="/api/report" className="rounded-lg border border-line-bright bg-panel px-4 py-2.5 text-sm text-ink transition-colors hover:border-accent-dim">
                Download audit report
              </a>
            </div>

            {/* domain cards */}
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {domainRollup.map((d) => {
                const ok = d.total > 0 && d.pass === d.total;
                return (
                  <div key={d.key} className="rounded-xl border border-line bg-panel p-4">
                    <div className="font-mono text-[11px] uppercase tracking-wide text-faint">{d.name}</div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className={ok ? 'text-pass' : 'text-warn'}>{ok ? '✓' : '◑'}</span>
                      <span className="tabular text-sm text-ink">{d.pass} of {d.total}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* agents */}
            <div className="mt-10 flex items-center justify-between">
              <h2 className="font-mono text-sm text-muted">Agents</h2>
              <Link href="/connect" className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90">
                + Connect agent
              </Link>
            </div>
            <div className="mt-3 overflow-hidden rounded-xl border border-line">
              {perAgent.map((p, i) => (
                <Link
                  key={p.agent.id}
                  href={`/agents/${p.agent.id}`}
                  className={`flex items-center justify-between px-5 py-4 transition-colors hover:bg-panel ${i > 0 ? 'border-t border-line' : ''}`}
                >
                  <div>
                    <div className="text-sm text-ink">{p.agent.name}</div>
                    <div className="mt-0.5 text-xs text-faint">{p.agent.purpose}</div>
                  </div>
                  <div className="flex items-center gap-5">
                    {!p.run ? (
                      <span className="text-xs text-muted">ready to check</span>
                    ) : p.score.mandatoryGaps > 0 ? (
                      <span className="text-xs text-warn">⚠ {p.score.mandatoryGaps} mandatory gap{p.score.mandatoryGaps > 1 ? 's' : ''}</span>
                    ) : p.score.pct >= 90 ? (
                      <span className="text-xs text-pass">● audit-ready</span>
                    ) : (
                      <span className="text-xs text-info">on track</span>
                    )}
                    <span className="tabular w-8 text-right font-mono text-sm text-ink">{p.run ? p.score.pct : '—'}</span>
                    <span className="text-faint">→</span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto mt-16 max-w-xl text-center">
      <h1 className="text-2xl font-semibold text-ink">Connect your first agent</h1>
      <p className="mt-3 text-muted">
        Recursiv checks your agents against the AIUC-1 standard and keeps the results up to date,
        so you’re always ready for an audit.
      </p>
      <Link href="/connect" className="mt-7 inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90">
        Connect an agent →
      </Link>
    </div>
  );
}
