import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { createAgent } from '@/lib/agents';

function riskFromCaps(caps: string[]): 'high' | 'limited' | 'minimal' {
  if (caps.includes('money') || caps.includes('code')) return 'high';
  if (caps.includes('email') || caps.includes('tools')) return 'limited';
  return 'minimal';
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  try {
    const b = await req.json();
    const mode = b.mode === 'own' ? 'own' : 'recursiv';
    const agent = await createAgent({
      ownerId: user.id,
      name: String(b.name || '').slice(0, 80),
      purpose: String(b.purpose || '').slice(0, 200),
      model: mode === 'own' ? 'external' : String(b.model || 'openai/gpt-5.5'),
      systemPrompt: mode === 'own' ? '' : String(b.systemPrompt || ''),
      endpointUrl: mode === 'own' ? String(b.endpointUrl || '') : null,
      riskTier: riskFromCaps(Array.isArray(b.capabilities) ? b.capabilities : []),
    });
    return NextResponse.json({ id: agent.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to connect agent' }, { status: 500 });
  }
}
