import { createHash } from 'crypto';
import { putJson, getJson, listKeys } from './store';

// ---- Recursiv gateway: external agents route their tool calls through here. ----
// Every call is authorized against policy, gated if high-impact, and written to a
// tamper-evident (hash-chained) action log. This is the level-3 enforcement layer:
// the controls run in the path, not in the agent.

export type Decision = 'allowed' | 'held_for_approval' | 'blocked';

export interface ActionRecord {
  seq: number;
  ts: string;
  agentId: string;
  tool: string;
  args: Record<string, unknown>;
  decision: Decision;
  reason: string;
  result: string;
  prevHash: string;
  hash: string;
}

/** The tools the demo support-agent can call, exposed to the agent. */
export const TOOLS = [
  { name: 'lookup_account', description: 'Look up the current customer’s account and recent charges.', params: '{ }' },
  { name: 'issue_refund', description: 'Issue a refund to the current customer.', params: '{ "amount": number, "reason": string }' },
  { name: 'send_email', description: 'Send an email to an address.', params: '{ "to": string, "subject": string, "body": string }' },
  { name: 'delete_account', description: 'Permanently delete a customer account.', params: '{ "accountId": string }' },
];

const REFUND_GATE = 100; // refunds over this need a human

/** Policy decision for a tool call — the enforcement an external agent has none of by default. */
function decide(tool: string, args: Record<string, unknown>): { decision: Decision; reason: string } {
  if (tool === 'delete_account') {
    return { decision: 'blocked', reason: 'This agent isn’t allowed to delete accounts.' };
  }
  if (tool === 'issue_refund') {
    const amount = Number(args.amount) || 0;
    if (amount > REFUND_GATE) {
      return { decision: 'held_for_approval', reason: `Over your $${REFUND_GATE} limit, so a person has to approve it first.` };
    }
    return { decision: 'allowed', reason: `Under your $${REFUND_GATE} limit, so it’s allowed.` };
  }
  if (tool === 'send_email') {
    return { decision: 'allowed', reason: 'Allowed, and the email was recorded.' };
  }
  if (tool === 'lookup_account') return { decision: 'allowed', reason: 'Just reading account info, so it’s allowed.' };
  return { decision: 'blocked', reason: 'Unknown tool — denied by default.' };
}

/** Mock tool execution (the "real" downstream the gateway forwards allowed calls to). */
function execute(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case 'lookup_account':
      return 'Account ACME-4821 · Pro plan $49/mo · last charge $49.00 on 2026-05-15 · 1 duplicate charge detected.';
    case 'issue_refund':
      return `Refund of $${Number(args.amount) || 0} processed to the card on file.`;
    case 'send_email':
      return `Email sent to ${String(args.to || 'customer')}.`;
    default:
      return 'ok';
  }
}

const actionKey = (agentId: string, seq: number) => `actions/${agentId}/${String(seq).padStart(6, '0')}.json`;

export async function readActions(agentId: string): Promise<ActionRecord[]> {
  const keys = await listKeys(`actions/${agentId}/`);
  keys.sort((a, b) => a.key.localeCompare(b.key));
  const recs = (await Promise.all(keys.map((k) => getJson<ActionRecord>(k.key)))).filter(Boolean) as ActionRecord[];
  return recs;
}

export function hashEntry(e: Omit<ActionRecord, 'hash'>): string {
  return createHash('sha256').update(JSON.stringify(e)).digest('hex');
}

/** The gateway call: authorize → log (hash-chained) → execute if allowed. */
export async function gatewayCall(
  agentId: string,
  tool: string,
  args: Record<string, unknown>,
  now: string,
): Promise<{ decision: Decision; reason: string; result: string }> {
  const prior = await readActions(agentId);
  const seq = prior.length + 1;
  const prevHash = prior.length ? prior[prior.length - 1].hash : 'genesis';

  const { decision, reason } = decide(tool, args);
  const result = decision === 'allowed' ? execute(tool, args) : decision === 'held_for_approval' ? '(pending human approval — not executed)' : '(blocked — not executed)';

  const base: Omit<ActionRecord, 'hash'> = { seq, ts: now, agentId, tool, args, decision, reason, result, prevHash };
  const record: ActionRecord = { ...base, hash: hashEntry(base) };
  await putJson(actionKey(agentId, seq), record);
  return { decision, reason, result };
}

/** Verify the hash chain is intact (tamper-evidence). */
export function verifyChain(recs: ActionRecord[]): boolean {
  let prev = 'genesis';
  for (const r of recs) {
    const { hash, ...rest } = r;
    if (r.prevHash !== prev || hashEntry(rest) !== hash) return false;
    prev = hash;
  }
  return true;
}
