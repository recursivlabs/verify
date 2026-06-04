import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { TopBar } from '@/components/Brand';
import { RunCheck } from '@/components/RunCheck';
import { RunScenario } from '@/components/RunScenario';
import { getAgent, latestRun } from '@/lib/agents';
import { DOMAINS, checksByDomain, checkStatuses, complianceScore, ENFORCEMENT, type Check, type CheckStatus } from '@/lib/aiuc1';
import type { ControlResult } from '@/lib/evals';
import { readActions, verifyChain, type ActionRecord } from '@/lib/gateway';

export const dynamic = 'force-dynamic';

const DOMAIN_NAME: Record<string, string> = Object.fromEntries(DOMAINS.map((d) => [d.key, d.name]));

export default async function AgentReport({ params, searchParams }: { params: { id: string }; searchParams: { run?: string } }) {
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
  const passedTests = results.filter((r) => r.pass).length;
  const today = new Date().toISOString().slice(0, 10);
  const ref = agent.id.replace(/-/g, '').slice(0, 10);

  const verdict = score.mandatoryGaps > 0
    ? { label: 'Not yet audit-ready', color: 'text-warn', dot: 'bg-warn' }
    : score.pct >= 90
    ? { label: 'Audit-ready', color: 'text-pass', dot: 'bg-pass' }
    : { label: 'On track', color: 'text-info', dot: 'bg-info' };

  // per-domain coverage glyph
  const domainCoverage = DOMAINS.map((d) => {
    const codes = checksByDomain(d.key).map((c) => c.code);
    const scored = codes.map((c) => statuses[c]).filter((s) => s === 'pass' || s === 'fail' || s === 'soon');
    const pass = scored.filter((s) => s === 'pass').length;
    const ratio = scored.length ? pass / scored.length : 1;
    return { key: d.key, name: d.name, ratio };
  });

  const held = actions.filter((a) => a.decision === 'held_for_approval');
  const blocked = actions.filter((a) => a.decision === 'blocked');
  const allowed = actions.filter((a) => a.decision === 'allowed');

  return (
    <div className="min-h-screen">
      <TopBar email={user.email} />
      <main className="mx-auto max-w-3xl px-5 py-8">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="font-mono text-xs text-muted hover:text-ink">← Agents</Link>
          <div className="flex items-center gap-3">
            {run && <a href="/api/report" className="rounded-lg border border-line bg-panel px-3.5 py-2 text-sm text-muted transition-colors hover:text-ink">Download evidence</a>}
            <RunCheck agentId={agent.id} hasRun={!!run} autostart={searchParams.run === '1' && !run} />
          </div>
        </div>

        {/* evidence header */}
        <div className="mt-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{agent.name}</h1>
            <p className="mt-1 text-sm text-muted">{agent.purpose}</p>
            <p className="mt-0.5 font-mono text-[11px] text-faint">{agent.model}</p>
          </div>
          <div className="flex flex-none items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2">
            <svg width="16" height="16" viewBox="0 0 32 32" fill="none"><path d="M16 4l10 4.5v6.2c0 6.3-4.1 10.9-10 12.8C10.1 25.6 6 21 6 14.7V8.5L16 4z" stroke="#39e0c8" strokeWidth="1.6" fill="rgba(57,224,200,0.06)" /><path d="M11.5 16.2l3.2 3.3 6-7" stroke="#39e0c8" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <div className="font-mono text-[10px] leading-tight text-faint">
              <div className="text-accent">VERIFIED BY RECURSIV</div>
              <div>AIUC-1 · {today} · {ref}</div>
            </div>
          </div>
        </div>

        {!run ? (
          <div className="mt-8 rounded-xl border border-dashed border-line bg-panel/40 p-8 text-center text-muted">
            Not checked yet. Run the first check to produce this agent’s evidence.
          </div>
        ) : (
          <>
            {/* verdict + domain coverage */}
            <div className="mt-6 rounded-2xl border border-line bg-panel p-6">
              <div className="flex items-end justify-between">
                <div>
                  <div className={`flex items-center gap-2 text-lg font-medium ${verdict.color}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${verdict.dot}`} />{verdict.label}
                  </div>
                  <div className="mt-1.5 text-sm text-muted">
                    {score.passing} of {score.total} AIUC-1 controls evidenced
                    {attention.length > 0 && <>, <span className="text-warn">{attention.length} need{attention.length === 1 ? 's' : ''} attention</span></>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-4xl text-ink tabular">{score.pct}%</div>
                  <div className="text-[11px] text-faint">ready for an AIUC-1 audit</div>
                </div>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-bg">
                <div className="bar-grow h-full rounded-full bg-accent" style={{ width: `${score.pct}%` }} />
              </div>
              {/* six-domain coverage */}
              <div className="mt-5 grid grid-cols-6 gap-2">
                {domainCoverage.map((d) => {
                  const c = d.ratio >= 1 ? 'text-pass border-pass/40' : d.ratio >= 0.5 ? 'text-warn border-warn/40' : 'text-fail border-fail/40';
                  return (
                    <div key={d.key} className="text-center">
                      <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full border-2 font-mono text-sm ${c}`}>{d.key}</div>
                      <div className="mt-1 text-[9px] uppercase tracking-wide text-faint">{d.name.split(' ')[0]}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ENFORCEMENT — the differentiator */}
            <section className="mt-8">
              <h2 className="text-base font-medium text-ink">You control what this agent does</h2>
              <p className="mt-1 text-sm text-muted">Your policies run on every action it takes, in the path. No other layer can produce this.</p>
              {gatewayConnected ? (
                <div className="mt-3 overflow-hidden rounded-2xl border border-accent-dim bg-panel shadow-glow">
                  <div className="divide-y divide-line">
                    {actions.map((a) => <ActionRow key={a.seq} a={a} />)}
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-line bg-bg/40 px-5 py-3">
                    <span className="flex items-center gap-3 font-mono text-[11px] text-muted">
                      {held.length > 0 && <span className="text-warn">{held.length} held</span>}
                      {blocked.length > 0 && <span className="text-fail">{blocked.length} blocked</span>}
                      {allowed.length > 0 && <span className="text-pass">{allowed.length} allowed</span>}
                      <span className={chainOk ? 'text-pass' : 'text-fail'}>🔒 {chainOk ? 'tamper-evident, hash chain verified' : 'chain broken'}</span>
                    </span>
                    <RunScenario agentId={agent.id} label="↻ Run another request" />
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-line bg-panel p-5">
                  <p className="text-sm text-ink">This agent’s actions are not routed through Recursiv yet, so nothing is enforcing your rules.</p>
                  <p className="mt-1 text-xs text-muted">Route its tool calls through Recursiv and every action gets checked against your policy, gated if risky, and written to a tamper-evident log.</p>
                  <div className="mt-3"><RunScenario agentId={agent.id} label="▶ Route through Recursiv and run a request" /></div>
                </div>
              )}
            </section>

            {/* BEHAVIOR verification */}
            <section className="mt-8">
              <div className="flex items-baseline justify-between">
                <h2 className="text-base font-medium text-ink">How it behaves</h2>
                <span className="text-sm text-muted">passed {passedTests} of {results.length}</span>
              </div>
              <p className="mt-1 text-sm text-muted">Tested against AIUC-1 adversarial and safety controls.</p>
              <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {(run?.controls || []).map((c) => (
                  <div key={c.code} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-[13px]">
                    <span className={`flex items-center gap-2 ${c.passed ? 'text-ink' : 'text-fail'}`}>{c.passed ? <span className="text-pass">✓</span> : <span className="text-fail">✗</span>}{c.label}</span>
                    <span className="font-mono text-[10px] text-faint">{c.code}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* NEEDS ATTENTION */}
            {(attention.length > 0 || soon.length > 0) && (
              <section className="mt-8">
                <h2 className="text-base font-medium text-ink">Needs attention</h2>
                <div className="mt-3 space-y-2.5">
                  {attention.map((c) => <AttentionRow key={c.code} check={c} control={controlByCode.get(c.code)} agentId={agent.id} gatewayConnected={gatewayConnected} />)}
                  {soon.map((c) => (
                    <div key={c.code} className="flex items-center justify-between rounded-xl border border-line bg-panel/50 p-3.5 text-sm">
                      <span className="text-faint">◷ {c.label}</span>
                      <span className="font-mono text-[10px] text-faint">{DOMAIN_NAME[c.domain]} · {c.code} · rolling out</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* FULL CONTROL COVERAGE */}
            <details className="mt-8 group">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-mono text-sm text-muted hover:text-ink">
                <span>Full AIUC-1 control coverage</span>
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

            <p className="mt-8 rounded-lg border border-line bg-panel/40 px-3 py-2 text-[11px] text-faint">
              Demo: this agent and its tools are stand-ins. The enforcement layer is real and externally callable.
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
      {check.fix && !isEnforcementGap && (
        <div className="ml-6 mt-2 flex items-start gap-1.5 text-[13px] text-muted"><span className="text-accent">→</span><span>{check.fix}</span></div>
      )}
      {isEnforcementGap && (
        <div className="ml-6 mt-3"><RunScenario agentId={agentId} label="▶ Route through Recursiv to enforce this" /></div>
      )}
    </div>
  );
}

function ActionRow({ a }: { a: ActionRecord }) {
  const tag =
    a.decision === 'allowed' ? { t: 'ALLOWED', c: 'text-pass', i: '✓' } :
    a.decision === 'held_for_approval' ? { t: 'HELD', c: 'text-warn', i: '✋' } :
    { t: 'BLOCKED', c: 'text-fail', i: '⛔' };
  const argStr = Object.entries(a.args).map(([k, v]) => `${k} ${typeof v === 'string' ? v.slice(0, 22) : JSON.stringify(v)}`).join(', ');
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <span className={`mt-0.5 flex-none font-mono text-[11px] ${tag.c}`}>{tag.i} {tag.t}</span>
      <div className="min-w-0">
        <div className="truncate font-mono text-sm text-ink">{a.tool}<span className="text-faint">{argStr ? ` · ${argStr}` : ''}</span></div>
        <div className="mt-0.5 text-[12px] text-muted">{a.reason}</div>
      </div>
    </div>
  );
}

function CoverageRow({ check, status }: { check: Check; status: CheckStatus }) {
  const m =
    status === 'pass' ? { i: '✓', c: 'text-pass', t: 'evidenced' } :
    status === 'fail' ? { i: '✗', c: 'text-fail', t: 'gap' } :
    status === 'soon' ? { i: '◷', c: 'text-faint', t: 'rolling out' } :
    { i: '○', c: 'text-faint', t: check.coverage === 'gov' ? 'your GRC program' : 'quarterly audit' };
  return (
    <div className="flex items-center justify-between gap-2 text-[13px]">
      <span className="flex items-center gap-2"><span className={m.c}>{m.i}</span><span className={status === 'pass' || status === 'fail' ? 'text-ink' : 'text-faint'}>{check.label}</span></span>
      <span className="flex items-center gap-2 font-mono text-[10px] text-faint">{m.t}<span>{check.code}</span></span>
    </div>
  );
}
