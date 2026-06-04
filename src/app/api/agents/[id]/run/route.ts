import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getAgent, saveRun } from '@/lib/agents';
import { verifyAgent } from '@/lib/evals';
import { PROJECT_ID } from '@/lib/constants';

// Real evals take a bit; give the request room.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const agent = await getAgent(params.id, user.id);
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  try {
    const outcome = await verifyAgent(
      {
        id: agent.id,
        name: agent.name,
        purpose: agent.purpose,
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        endpointUrl: agent.endpointUrl,
        apiKey: agent.apiKey,
        apiFormat: agent.apiFormat,
        apiModel: agent.apiModel,
        projectId: PROJECT_ID,
        guardrail: agent.guardrail,
      },
      { runsPerTask: 2 },
    );
    const runId = await saveRun(agent.id, outcome);
    return NextResponse.json({ runId, trustScore: outcome.trustScore, reliability: outcome.reliability });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Verification failed' }, { status: 500 });
  }
}
