import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getAgent } from '@/lib/agents';
import { runScenario, DEMO_SCENARIO } from '@/lib/agentLoop';
import { PROJECT_ID } from '@/lib/constants';

// Run a customer request through the external agent → Recursiv gateway, producing a
// real, enforced, hash-chained action log.
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const agent = await getAgent(params.id, user.id);
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  try {
    const steps = await runScenario(agent.id, PROJECT_ID, DEMO_SCENARIO, new Date().toISOString());
    return NextResponse.json({ steps });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Scenario failed' }, { status: 500 });
  }
}
