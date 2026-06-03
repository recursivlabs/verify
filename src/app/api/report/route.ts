import { getSessionUser } from '@/lib/session';
import { listAgents, latestRun } from '@/lib/agents';
import { DOMAINS, checksByDomain, checkStatuses, complianceScore } from '@/lib/aiuc1';

export const dynamic = 'force-dynamic';

function esc(s: string) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
}

// A printable evidence package — the artifact a company hands its AIUC-1 auditor.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response('Not signed in', { status: 401 });

  const agents = await listAgents(user.id);
  const today = new Date().toISOString().slice(0, 10);

  const sections: string[] = [];
  for (const a of agents) {
    const run = await latestRun(a.id);
    const results = run?.results ?? [];
    const statuses = checkStatuses(run ? { reliability: run.reliability, nRuns: run.nRuns } : null, run?.controls);
    const score = complianceScore(statuses);
    const passed = results.filter((r) => r.pass).length;

    const domains = DOMAINS.map((d) => {
      const rows = checksByDomain(d.key).map((c) => {
        const s = statuses[c.code];
        const mark = s === 'pass' ? '✓ met' : s === 'fail' ? '✗ not met' : s === 'soon' ? '— roadmap' : '— governance/audited';
        return `<tr><td class="code">${c.code}</td><td>${esc(c.label)}</td><td class="${s}">${mark}</td></tr>`;
      }).join('');
      return `<h3>${d.key}. ${d.name}</h3><table>${rows}</table>`;
    }).join('');

    sections.push(`
      <section>
        <h2>${esc(a.name)}</h2>
        <p class="meta">${esc(a.purpose)} · model ${esc(a.model)} · risk tier ${esc(a.riskTier)}</p>
        <p class="score">AIUC-1 readiness ${run ? score.pct : '—'} — passing ${score.passing} of ${score.total} in-scope checks${run && score.mandatoryGaps > 0 ? ` · ${score.mandatoryGaps} mandatory gap(s)` : ''}
          ${run ? `· behavioral tests passed ${passed}/${results.length}` : '· not yet checked'}</p>
        ${domains}
      </section>`);
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>AIUC-1 evidence — ${esc(user.email)}</title>
  <style>
    body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:820px;margin:40px auto;padding:0 20px}
    h1{font-size:22px;margin-bottom:4px} h2{font-size:18px;margin-top:34px;border-bottom:2px solid #111;padding-bottom:4px}
    h3{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#555;margin:18px 0 6px}
    table{width:100%;border-collapse:collapse;margin-bottom:8px} td{padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top}
    td.code{font-family:ui-monospace,monospace;color:#888;width:54px} .pass{color:#127a3a} .fail{color:#b00020} .soon,.na{color:#999}
    .meta{color:#666} .score{font-weight:600;margin:6px 0} .head{color:#666;font-size:12px}
    @media print{body{margin:0}}
  </style></head><body>
    <h1>AIUC-1 Conformance Evidence</h1>
    <p class="head">Continuously verified by Recursiv · generated ${today} · ${esc(user.email)}</p>
    <p class="head">This package is readiness evidence for an AIUC-1 audit. AIUC performs the official technical testing and issues the certificate; Schellman provides independent audit. Recursiv produces the continuous runtime evidence below.</p>
    ${sections.join('') || '<p>No agents connected yet.</p>'}
  </body></html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
