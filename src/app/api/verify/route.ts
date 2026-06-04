import { NextResponse } from 'next/server';
import { readActions, type ActionRecord } from '@/lib/gateway';
import { verifyChainDetailed } from '@/lib/evidence';

export const dynamic = 'force-dynamic';

// Public, deterministic chain verifier. An auditor (or GRC platform) posts the evidence
// bundle's actions — or just an agentId — and gets back whether the hash chain is intact.
// No account required: this is the "verify it yourself" half of deterministic evidence.
export async function POST(req: Request) {
  let body: { actions?: ActionRecord[]; agentId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  let actions = body.actions;
  if (!Array.isArray(actions) && body.agentId) actions = await readActions(body.agentId);
  if (!Array.isArray(actions)) {
    return NextResponse.json({ error: 'provide an "actions" array or an "agentId"' }, { status: 400 });
  }

  const chain = verifyChainDetailed(actions);
  return NextResponse.json({
    standard: 'AIUC-1',
    issuer: 'Recursiv Verify',
    checkedAt: new Date().toISOString(),
    algorithm: chain.algorithm,
    verified: chain.verified,
    actions: chain.count,
    brokenAt: chain.brokenAt,
  });
}
