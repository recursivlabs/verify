import { NextResponse } from 'next/server';
import { gatewayCall } from '@/lib/gateway';

// Public gateway endpoint. An external agent (running anywhere) points its tool calls
// here; Recursiv authorizes, gates, and logs each one, then returns the decision/result.
// POST { agentId, tool, args }   (in production: a scoped gateway token instead of agentId)
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const agentId = String(body.agentId || '');
    const tool = String(body.tool || '');
    if (!agentId || !tool) return NextResponse.json({ error: 'agentId and tool are required' }, { status: 400 });
    const args = body.args && typeof body.args === 'object' ? body.args : {};
    const out = await gatewayCall(agentId, tool, args, new Date().toISOString());
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Gateway error' }, { status: 500 });
  }
}
