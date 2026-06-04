import { NextResponse } from 'next/server';
import { buildEvidenceBundle, verifyChainDetailed } from '@/lib/evidence';
import { readActions } from '@/lib/gateway';

export const dynamic = 'force-dynamic';

// Recursiv Verify MCP server (minimal JSON-RPC 2.0 over HTTP POST).
// Lets an MCP client — Claude, or a GRC platform like Vanta's MCP server — pull an agent's
// runtime AIUC-1 evidence and independently verify its hash chain. This is the channel:
// the runtime evidence GRC tools can't collect, exposed where they can ingest it.
// Demo-grade: reads by agentId, no auth (mirrors the public gateway). Production gates this.

const TOOLS = [
  {
    name: 'get_agent_evidence',
    description: 'Get the deterministic AIUC-1 conformance evidence bundle for an agent (readiness score, control coverage, and the tamper-evident runtime action log).',
    inputSchema: {
      type: 'object',
      properties: { agentId: { type: 'string', description: 'The agent id' } },
      required: ['agentId'],
    },
  },
  {
    name: 'verify_agent_chain',
    description: 'Independently re-verify the tamper-evident hash chain of an agent\'s runtime action log. Returns whether the evidence is intact and where it breaks if not.',
    inputSchema: {
      type: 'object',
      properties: { agentId: { type: 'string', description: 'The agent id' } },
      required: ['agentId'],
    },
  },
];

function rpc(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result });
}
function rpcError(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } });
}
function toolText(obj: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
}

export async function POST(req: Request) {
  let msg: { jsonrpc?: string; id?: unknown; method?: string; params?: any };
  try {
    msg = await req.json();
  } catch {
    return rpcError(null, -32700, 'Parse error');
  }
  const { id, method, params } = msg;

  // Notifications (e.g. notifications/initialized) expect no response body.
  if (method && method.startsWith('notifications/')) return new Response(null, { status: 202 });

  if (method === 'initialize') {
    return rpc(id, {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'recursiv-verify', version: '0.1.0' },
      capabilities: { tools: {} },
    });
  }

  if (method === 'tools/list') {
    return rpc(id, { tools: TOOLS });
  }

  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments || {};
    const agentId = String(args.agentId || '');
    if (!agentId) return rpc(id, { ...toolText({ error: 'agentId is required' }), isError: true });

    if (name === 'get_agent_evidence') {
      const bundle = await buildEvidenceBundle(agentId, new Date().toISOString());
      if (!bundle) return rpc(id, { ...toolText({ error: 'agent not found' }), isError: true });
      return rpc(id, toolText(bundle));
    }
    if (name === 'verify_agent_chain') {
      const actions = await readActions(agentId);
      return rpc(id, toolText({ agentId, ...verifyChainDetailed(actions) }));
    }
    return rpc(id, { ...toolText({ error: `unknown tool: ${name}` }), isError: true });
  }

  return rpcError(id ?? null, -32601, `Method not found: ${method}`);
}

// A plain GET returns a human/machine description so the endpoint is discoverable.
export async function GET() {
  return NextResponse.json({
    server: 'recursiv-verify',
    transport: 'JSON-RPC 2.0 over HTTP POST',
    methods: ['initialize', 'tools/list', 'tools/call'],
    tools: TOOLS.map((t) => t.name),
  });
}
