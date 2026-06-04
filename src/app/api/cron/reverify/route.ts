import { NextResponse } from 'next/server';
import { listAllAgents, saveRun } from '@/lib/agents';
import { verifyAgent } from '@/lib/evals';
import { PROJECT_ID } from '@/lib/constants';

// Scheduled re-verification: re-runs the behavior checks on every agent so the page
// stays continuously verified, not point-in-time. Called by a scheduler (GitHub Action)
// with the shared secret. Fire-and-forget so the proxy does not time out on long runs.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function reVerifyAll() {
  const agents = await listAllAgents();
  for (const a of agents) {
    try {
      const outcome = await verifyAgent(
        { id: a.id, name: a.name, purpose: a.purpose, model: a.model, systemPrompt: a.systemPrompt, endpointUrl: a.endpointUrl, projectId: PROJECT_ID },
        { runsPerTask: 2 },
      );
      await saveRun(a.id, outcome);
    } catch {}
  }
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get('x-cron-secret') || new URL(req.url).searchParams.get('secret');
  if (!secret || provided !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  reVerifyAll(); // not awaited
  return NextResponse.json({ ok: true, started: true });
}
