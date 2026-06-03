// AIUC-1 control model for Recursiv Verify.
//
// AIUC-1 = "SOC 2 for AI agents." 6 domains (A–F), 45 mandatory requirements + capability scoping.
// Recursiv Verify is NOT the certifier (AIUC tests, Schellman audits, the company gets the cert).
// Verify is the control + evidence + readiness layer: it implements the runtime technical controls
// and continuously produces the evidence the auditor collects between quarterly tests.
//
// See /Users/jackottman/.claude/plans/aiuc-1-control-mapping.md for the full requirement mapping.

export type Domain = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
/** live = Recursiv primitive today · soon = Tier 2 build/partner · external = official 3rd-party test · gov = governance (company/GRC) */
export type Coverage = 'live' | 'soon' | 'external' | 'gov';
export type CheckStatus = 'pass' | 'fail' | 'soon' | 'na';

export const DOMAINS: { key: Domain; name: string }[] = [
  { key: 'A', name: 'Data & Privacy' },
  { key: 'B', name: 'Security' },
  { key: 'C', name: 'Safety' },
  { key: 'D', name: 'Reliability' },
  { key: 'E', name: 'Accountability' },
  { key: 'F', name: 'Society' },
];

export interface Check {
  /** AIUC-1 requirement code (e.g. B006) */
  code: string;
  domain: Domain;
  /** plain-English, how a person would say it */
  label: string;
  coverage: Coverage;
  /** how Recursiv produces this (live/soon only) */
  how?: string;
}

// The checks Verify surfaces in the UI. We show what Recursiv can actually produce (live + soon
// readiness), plus the governance/external items so the auditor sees the full picture honestly.
export const CHECKS: Check[] = [
  // D — Reliability: Recursiv's strongest, most unique fit
  { code: 'D003', domain: 'D', label: 'It only makes safe tool calls', coverage: 'live', how: 'Every tool call is mediated and checked against what the agent is allowed to do.' },
  { code: 'D004', domain: 'D', label: 'Its tool calls are validated continuously', coverage: 'live', how: 'Daily checks confirm tool calls stay within bounds; feeds the quarterly audit.' },
  { code: 'D001', domain: 'D', label: 'It does its job correctly (tested daily)', coverage: 'live', how: 'Daily eval suite measures whether it completes real tasks correctly.' },
  { code: 'D002', domain: 'D', label: 'Independent testing for made-up answers', coverage: 'external', how: 'Our daily tests are your readiness evidence; AIUC runs the official quarterly test.' },

  // B — Security
  { code: 'B006', domain: 'B', label: 'It only takes actions it’s allowed to', coverage: 'live', how: 'Per-action authorization enforced on the live call.' },
  { code: 'B007', domain: 'B', label: 'It can only reach what it’s scoped to', coverage: 'live', how: 'Access privileges scoped per agent and enforced.' },
  { code: 'B004', domain: 'B', label: 'Rate and spend limits are enforced', coverage: 'live', how: 'Caps on call rate and spend; runaway protection.' },
  { code: 'B002', domain: 'B', label: 'It resists attempts to trick it', coverage: 'soon', how: 'Prompt-injection / jailbreak detection (Tier 2).' },
  { code: 'B005', domain: 'B', label: 'Unsafe inputs are filtered', coverage: 'soon' },

  // C — Safety
  { code: 'C004', domain: 'C', label: 'Risky actions need a human’s OK', coverage: 'live', how: 'High-risk or irreversible actions route to a human approval gate.' },
  { code: 'C005', domain: 'C', label: 'It’s monitored in real time', coverage: 'live', how: 'Live monitoring of actions and outputs.' },
  { code: 'C002', domain: 'C', label: 'Tested before it goes live', coverage: 'live', how: 'Eval suite runs pre-deployment and on every change.' },
  { code: 'C003', domain: 'C', label: 'It refuses harmful or off-topic requests', coverage: 'soon', how: 'Output guardrails (Tier 2).' },

  // A — Data & Privacy
  { code: 'A004', domain: 'A', label: 'No customer’s data leaks to another', coverage: 'live', how: 'Per-organization isolation enforced.' },
  { code: 'A005', domain: 'A', label: 'It keeps private data private', coverage: 'live', how: 'Data-egress control and redaction at the boundary.' },
  { code: 'A001', domain: 'A', label: 'There’s a data policy', coverage: 'gov' },

  // E — Accountability
  { code: 'E011', domain: 'E', label: 'Every action it takes is logged', coverage: 'live', how: 'Tamper-evident log of every tool call, attributable to the agent.' },
  { code: 'E005', domain: 'E', label: 'Changes are approved and recorded', coverage: 'live', how: 'Change approvals captured with supporting evidence.' },
  { code: 'E007', domain: 'E', label: 'Third-party access is monitored', coverage: 'live' },
  { code: 'E001', domain: 'E', label: 'There’s an incident-response plan', coverage: 'gov' },
  { code: 'E006', domain: 'E', label: 'Model vendors are vetted', coverage: 'gov' },

  // F — Society
  { code: 'F001', domain: 'F', label: 'Guardrails against misuse', coverage: 'soon' },
];

export function checksByDomain(domain: Domain): Check[] {
  return CHECKS.filter((c) => c.domain === domain);
}

/**
 * Status of each check for an agent, given its latest run.
 * live checks that depend on the eval (the "does its job / tested" ones) read from the run;
 * other live checks reflect platform primitives being in place; soon = not built; gov/external = n/a here.
 */
export function checkStatuses(run: { reliability: number; nRuns: number } | null): Record<string, CheckStatus> {
  const out: Record<string, CheckStatus> = {};
  const evalDependent = new Set(['D001', 'D004', 'C002']);
  for (const c of CHECKS) {
    if (c.coverage === 'soon') out[c.code] = 'soon';
    else if (c.coverage === 'gov' || c.coverage === 'external') out[c.code] = 'na';
    else if (evalDependent.has(c.code)) {
      out[c.code] = run && run.nRuns > 0 ? (run.reliability >= 0.8 ? 'pass' : 'fail') : 'na';
    } else {
      out[c.code] = 'pass'; // live platform control in place
    }
  }
  return out;
}

/** Compliance headline: share of in-scope (live + eval) checks passing. */
export function complianceScore(statuses: Record<string, CheckStatus>): { pct: number; passing: number; total: number } {
  const scored = Object.values(statuses).filter((s) => s === 'pass' || s === 'fail');
  const passing = scored.filter((s) => s === 'pass').length;
  const total = scored.length || 1;
  return { pct: Math.round((passing / total) * 100), passing, total: scored.length };
}
