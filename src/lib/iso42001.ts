// ISO/IEC 42001 control model for Recursiv Verify.
//
// The pitch in one data structure: ISO 42001 splits into governance controls
// (process/policy — what GRC tools like Vanta already automate at the org level)
// and AI-system controls (runtime evidence about a specific agent — what a tool
// OUTSIDE the runtime structurally cannot auto-collect). Recursiv fills the latter.

export type ControlOwner = 'governance' | 'agent';
export type ControlStatus = 'met' | 'partial' | 'unmet' | 'na';

export interface ControlEvidence {
  /** which run metric / artifact satisfies this, if any */
  source?: 'reliability' | 'quality' | 'monitoring' | 'action_log' | 'human_oversight' | 'impact_test';
  note: string;
}

export interface Control {
  id: string; // ISO 42001 Annex A reference
  clause: string;
  title: string;
  owner: ControlOwner; // governance (GRC covers) vs agent (Recursiv fills)
  description: string;
  /** how Recursiv produces evidence for this (only meaningful for owner='agent') */
  recursivEvidence?: string;
}

/** Curated control set, emphasizing the agent/AI-system controls Recursiv fills. */
export const CONTROLS: Control[] = [
  // ---- Governance / process (GRC / Vanta territory) ----
  { id: 'A.2.2', clause: 'AI policy', title: 'AI policy in place', owner: 'governance', description: 'Documented organizational policy governing responsible AI use.' },
  { id: 'A.3.2', clause: 'AI roles & responsibilities', title: 'Roles & accountability defined', owner: 'governance', description: 'Clear ownership and accountability for AI systems.' },
  { id: 'A.9.2', clause: 'Responsible use', title: 'Intended-use & responsible-use policy', owner: 'governance', description: 'Documented intended use and acceptable-use constraints.' },
  { id: 'A.10.2', clause: 'Third-party & supplier', title: 'Third-party AI governance', owner: 'governance', description: 'Governance of third-party AI components and suppliers.' },
  { id: 'A.8.2', clause: 'Documentation', title: 'System documentation maintained', owner: 'governance', description: 'Technical documentation for the AI system is maintained.' },

  // ---- AI-system / agent controls (Recursiv fills with runtime evidence) ----
  {
    id: 'A.6.2.4', clause: 'AI system verification & validation', title: 'The agent is tested and meets a defined performance bar',
    owner: 'agent', description: 'Evidence the AI system was validated against requirements before and during use.',
    recursivEvidence: 'Continuous evals: reliability (pass^k) + quality on a tailored, held-out task suite, with confidence intervals.',
  },
  {
    id: 'A.5.2', clause: 'AI system impact assessment', title: 'Edge cases & failure modes assessed',
    owner: 'agent', description: 'Assessment of potential impacts, including failure and edge-case behavior.',
    recursivEvidence: 'Eval suite probes edge cases and adversarial inputs; failures are recorded with transcripts.',
  },
  {
    id: 'A.6.2.6', clause: 'AI system operation & monitoring', title: 'Performance monitored over time (drift)',
    owner: 'agent', description: 'Ongoing monitoring of the deployed system for performance and drift.',
    recursivEvidence: 'Scheduled re-runs track reliability/cost/quality over time and alert on regressions.',
  },
  {
    id: 'A.6.2.8', clause: 'Event logging / records of operation', title: 'Every agent action is logged and attributable',
    owner: 'agent', description: 'Automatic, durable records of the AI system’s operation for traceability.',
    recursivEvidence: 'Per-agent action log: every tool call, argument, outcome, and the permission it used — stamped to a stable agent identity.',
  },
  {
    id: 'A.6.2.7', clause: 'Human oversight', title: 'Human oversight & approval gating',
    owner: 'agent', description: 'Mechanisms for human oversight of high-impact or irreversible actions.',
    recursivEvidence: 'Permission scoping + approval gates: out-of-scope or irreversible actions can be blocked or routed for human approval.',
  },
];

export const AGENT_CONTROLS = CONTROLS.filter((c) => c.owner === 'agent');
export const GOVERNANCE_CONTROLS = CONTROLS.filter((c) => c.owner === 'governance');

/** Compute the status of each agent control from a verification run's metrics. */
export function controlStatuses(run: { reliability: number; quality: number; nRuns: number } | null): Record<string, ControlStatus> {
  const out: Record<string, ControlStatus> = {};
  for (const c of GOVERNANCE_CONTROLS) out[c.id] = 'na'; // owned by the customer's GRC program
  if (!run || !run.nRuns) {
    for (const c of AGENT_CONTROLS) out[c.id] = 'unmet';
    return out;
  }
  const reliable = run.reliability >= 0.9 ? 'met' : run.reliability >= 0.7 ? 'partial' : 'unmet';
  out['A.6.2.4'] = reliable; // V&V via eval reliability
  out['A.5.2'] = run.nRuns >= 5 ? 'met' : 'partial'; // impact/edge-case coverage
  out['A.6.2.6'] = 'partial'; // monitoring: present once scheduled (MVP: partial until re-runs accrue)
  out['A.6.2.8'] = 'met'; // action logging is native to the runtime
  out['A.6.2.7'] = 'partial'; // oversight: gates available, depends on config
  return out;
}
