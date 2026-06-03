import { getRecursiv } from './recursiv';
import { TOOLS, gatewayCall, type Decision } from './gateway';

// The "external" support agent: a model decides which tools to call for a customer
// request; every call is routed through the Recursiv gateway (enforced + logged).
// In production this loop runs on the customer's stack and points its tool calls here.

const MODEL = 'anthropic/claude-sonnet-4.6';

function firstJson(text: string): any | null {
  if (!text) return null;
  const fenced = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  for (const c of [fenced, text.trim()]) { try { return JSON.parse(c); } catch {} }
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) { try { return JSON.parse(arr[0]); } catch {} }
  return null;
}

async function planActions(projectId: string, customerMessage: string): Promise<{ tool: string; args: Record<string, unknown> }[]> {
  const r = getRecursiv();
  const toolList = TOOLS.map((t) => `- ${t.name}${t.params !== '{ }' ? ' ' + t.params : ''}: ${t.description}`).join('\n');
  const sys = 'You are a tool-use planner for a customer-support agent. You do NOT reply to the customer — you only output the tool calls. Return ONLY JSON.';
  const res = await r.agents.create({ name: 'acme-brain', username: `acme_${Math.floor(Math.random() * 1e9).toString(36)}`, model: MODEL, system_prompt: sys, tool_mode: 'chat_only', project_id: projectId });
  const id = res.data.id;
  try {
    const msg = `A customer wrote: "${customerMessage}"\n\nThe support agent can call these tools:\n${toolList}\n\nOutput ONLY a compact JSON array of the tool calls needed to fully resolve this, in order. No prose, no markdown. Format: [{"tool":"name","args":{...}}]`;
    const out = (await r.agents.chatStreamText(id, { message: msg, new_conversation: true })).content || '';
    let parsed: any = firstJson(out);
    if (!Array.isArray(parsed)) {
      const objs = out.match(/\{[^{}]*"tool"[^{}]*\}/g) || [];
      parsed = objs.map((o) => { try { return JSON.parse(o); } catch { return null; } }).filter(Boolean);
    }
    if (Array.isArray(parsed)) {
      return parsed
        .filter((x) => x && typeof x.tool === 'string')
        .slice(0, 6)
        .map((x) => ({ tool: String(x.tool), args: (x.args && typeof x.args === 'object') ? x.args : {} }));
    }
    return [];
  } finally {
    try { await r.agents.delete(id); } catch {}
  }
}

export interface ScenarioStep { tool: string; args: Record<string, unknown>; decision: Decision; reason: string; result: string }

/** Run a customer request through the external agent → Recursiv gateway. Returns the steps. */
export async function runScenario(agentId: string, projectId: string, customerMessage: string, now: string): Promise<ScenarioStep[]> {
  const plan = await planActions(projectId, customerMessage);
  const steps: ScenarioStep[] = [];
  let i = 0;
  for (const call of plan) {
    // stable, increasing timestamps without Date.now() in shared code paths
    const ts = new Date(new Date(now).getTime() + i * 1000).toISOString();
    const out = await gatewayCall(agentId, call.tool, call.args, ts);
    steps.push({ tool: call.tool, args: call.args, ...out });
    i++;
  }
  return steps;
}

export const DEMO_SCENARIO =
  'I was double-charged $500 for my annual plan this month. Please look up my account, refund me the full $500, and email me a confirmation.';
