import { getAgentById, latestRun } from './agents';
import { readActions, hashEntry, type ActionRecord } from './gateway';
import { CHECKS, checkStatuses, complianceScore } from './aiuc1';

// The deterministic, machine-readable AIUC-1 evidence bundle. This is the artifact an
// auditor (or a GRC platform like Vanta) ingests: API-grade, timestamped, attributable,
// and independently verifiable via the hash chain — not screenshots.

export interface ChainCheck {
  algorithm: string;
  verified: boolean;
  brokenAt: number | null;
  count: number;
}

export interface EvidenceBundle {
  standard: 'AIUC-1';
  issuer: 'Recursiv Verify';
  generatedAt: string;
  agent: { id: string; name: string; model: string; purpose: string; riskTier: string };
  readiness: { pct: number; passing: number; total: number; mandatoryGaps: number };
  lastChecked: string | null;
  controls: { code: string; label: string; mandatory: boolean; status: string }[];
  runtime: {
    monitored: boolean;
    totals: { allowed: number; held: number; blocked: number };
    chain: ChainCheck;
    actions: ActionRecord[];
  };
  verification: { instructions: string; endpoint: string };
}

/** Re-verify the hash chain and report exactly where it breaks (for auditors). */
export function verifyChainDetailed(recs: ActionRecord[]): ChainCheck {
  const algorithm =
    'sha256 over JSON.stringify({seq,ts,agentId,tool,args,decision,reason,result,prevHash}); each entry links to the previous via prevHash (first = "genesis").';
  let prev = 'genesis';
  for (let i = 0; i < recs.length; i++) {
    const { hash, ...rest } = recs[i];
    if (recs[i].prevHash !== prev || hashEntry(rest) !== hash) {
      return { algorithm, verified: false, brokenAt: recs[i].seq ?? i + 1, count: recs.length };
    }
    prev = hash;
  }
  return { algorithm, verified: true, brokenAt: null, count: recs.length };
}

export async function buildEvidenceBundle(agentId: string, generatedAt: string): Promise<EvidenceBundle | null> {
  const agent = await getAgentById(agentId);
  if (!agent) return null;
  const run = await latestRun(agentId);
  const actions = await readActions(agentId);
  const monitored = actions.length > 0;

  const statuses = checkStatuses(run ? { reliability: run.reliability, nRuns: run.nRuns } : null, run?.controls, monitored);
  const score = complianceScore(statuses);
  const chain = verifyChainDetailed(actions);

  return {
    standard: 'AIUC-1',
    issuer: 'Recursiv Verify',
    generatedAt,
    agent: { id: agent.id, name: agent.name, model: agent.model, purpose: agent.purpose, riskTier: agent.riskTier },
    readiness: { pct: score.pct, passing: score.passing, total: score.total, mandatoryGaps: score.mandatoryGaps },
    lastChecked: run?.finishedAt ?? null,
    controls: CHECKS.map((c) => ({ code: c.code, label: c.label, mandatory: c.mandatory, status: statuses[c.code] })),
    runtime: {
      monitored,
      totals: {
        allowed: actions.filter((a) => a.decision === 'allowed').length,
        held: actions.filter((a) => a.decision === 'held_for_approval').length,
        blocked: actions.filter((a) => a.decision === 'blocked').length,
      },
      chain,
      actions,
    },
    verification: {
      instructions:
        'POST this bundle\'s runtime.actions array (or { "agentId": "<id>" }) to the endpoint below. ' +
        'It recomputes the hash chain with the stated algorithm and returns whether the evidence is intact. No account required.',
      endpoint: '/api/verify',
    },
  };
}
