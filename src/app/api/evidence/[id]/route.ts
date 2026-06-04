import { getSessionUser } from '@/lib/session';
import { getAgent } from '@/lib/agents';
import { buildEvidenceBundle } from '@/lib/evidence';

export const dynamic = 'force-dynamic';

// Download the deterministic AIUC-1 evidence bundle for an agent (owner only).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return new Response('Not signed in', { status: 401 });
  const agent = await getAgent(params.id, user.id);
  if (!agent) return new Response('Not found', { status: 404 });

  const bundle = await buildEvidenceBundle(params.id, new Date().toISOString());
  if (!bundle) return new Response('Not found', { status: 404 });

  const ref = agent.id.replace(/-/g, '').slice(0, 10);
  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="aiuc1-evidence-${ref}.json"`,
    },
  });
}
