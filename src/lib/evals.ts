import { getRecursiv } from './recursiv';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const GEN_MODEL = 'anthropic/claude-sonnet-4.6';
const JUDGE_MODEL = 'anthropic/claude-sonnet-4.6';

export interface GenTask {
  category: string;
  prompt: string;
  rubric: string;
}

export interface AgentSpec {
  id: string;
  name: string;
  purpose: string;
  model: string;
  systemPrompt: string;
  endpointUrl?: string | null;
  projectId: string;
}

const createdAgents: string[] = [];
async function tempAgent(model: string, system: string, projectId: string): Promise<string> {
  const r = getRecursiv();
  const res = await r.agents.create({
    name: 'verify-worker',
    username: `vfy_${Math.floor(Math.random() * 1e9).toString(36)}`,
    model,
    system_prompt: system,
    tool_mode: 'chat_only',
    project_id: projectId,
  });
  createdAgents.push(res.data.id);
  return res.data.id;
}
async function cleanup() {
  const r = getRecursiv();
  for (const id of createdAgents.splice(0)) {
    try { await r.agents.delete(id); } catch {}
  }
}

function firstJson(text: string): any | null {
  const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/** Auto-generate a small eval suite tailored to the agent's stated purpose. */
export async function generateTasks(spec: AgentSpec, n = 5): Promise<GenTask[]> {
  const r = getRecursiv();
  const genId = await tempAgent(GEN_MODEL, 'You design rigorous, unambiguous evaluation tasks for AI agents. Return only JSON.', spec.projectId);
  try {
    const prompt = `An AI agent has this purpose: "${spec.purpose}".\n\nDesign ${n} concrete, realistic test tasks that probe whether it does this job correctly, including edge cases. Each task must be unambiguous and gradable. Return ONLY a JSON array of ${n} objects: [{"category":"short label","prompt":"the input to give the agent","rubric":"what a correct answer must contain to pass"}].`;
    const res = await r.agents.chatStreamText(genId, { message: prompt, new_conversation: true });
    const parsed = firstJson(res.content);
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.slice(0, n).map((t: any) => ({
        category: String(t.category || 'general').slice(0, 40),
        prompt: String(t.prompt || ''),
        rubric: String(t.rubric || ''),
      })).filter((t) => t.prompt && t.rubric);
    }
    return [];
  } finally {
    await cleanup();
  }
}

/** Run the agent on one task (Recursiv-hosted model+prompt, or the customer's endpoint). */
async function runAgentOnce(spec: AgentSpec, workerId: string | null, prompt: string): Promise<string> {
  if (spec.endpointUrl) {
    for (let i = 0; i < 3; i++) {
      try {
        const res = await fetch(spec.endpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: prompt, message: prompt }),
        });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          const out = typeof data === 'string' ? data : data?.output ?? data?.reply ?? data?.content ?? JSON.stringify(data);
          if (out && String(out).trim()) return String(out);
        }
      } catch {}
      await sleep(2000);
    }
    return '';
  }
  const r = getRecursiv();
  for (let i = 0; i < 3; i++) {
    try {
      const c = (await r.agents.chatStreamText(workerId!, { message: prompt, new_conversation: true })).content;
      if (c && c.trim()) return c;
    } catch {}
    await sleep(2500);
  }
  return '';
}

async function judge(judgeId: string, task: GenTask, output: string): Promise<{ pass: boolean; quality: number } | null> {
  const r = getRecursiv();
  const prompt = `Grade an AI agent's answer. Be strict but fair.\n\nTASK: ${task.prompt}\n\nRUBRIC (what passing requires): ${task.rubric}\n\nANSWER: ${output}\n\nReturn ONLY JSON: {"pass": true|false, "quality": 0-100}.`;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await r.agents.chatStreamText(judgeId, { message: prompt, new_conversation: true });
      const j = firstJson(res.content);
      if (j && (j.pass !== undefined || j.quality !== undefined)) {
        return { pass: !!j.pass, quality: Math.max(0, Math.min(100, Number(j.quality) || 0)) };
      }
    } catch {}
    await sleep(1500);
  }
  return null;
}

export interface RunOutcome {
  reliability: number; // 0-1
  quality: number; // 0-100
  costToDone: number; // $/task (0 for endpoint agents we don't meter)
  trustScore: number; // 0-100
  nTasks: number;
  nRuns: number;
  results: { category: string; prompt: string; pass: boolean; quality: number; output: string; graderType: 'judge' }[];
}

function trustScore(reliability: number, quality: number): number {
  // weighted: reliability is the production-readiness signal, quality the craft
  return Math.round(reliability * 100 * 0.6 + quality * 0.4);
}

/** Run a full verification: generate tasks (if none), run the agent, grade, score. */
export async function verifyAgent(spec: AgentSpec, opts?: { tasks?: GenTask[]; runsPerTask?: number }): Promise<RunOutcome> {
  const r = getRecursiv();
  const runsPerTask = opts?.runsPerTask ?? 2;
  const tasks = opts?.tasks?.length ? opts.tasks : await generateTasks(spec);
  const judgeId = await tempAgent(JUDGE_MODEL, 'You are a strict, fair grader. Return only the requested JSON.', spec.projectId);
  const workerId = spec.endpointUrl ? null : await tempAgent(spec.model, spec.systemPrompt || 'You are a helpful assistant.', spec.projectId);

  const results: RunOutcome['results'] = [];
  try {
    for (const task of tasks) {
      for (let run = 0; run < runsPerTask; run++) {
        const output = await runAgentOnce(spec, workerId, task.prompt);
        if (!output) {
          results.push({ category: task.category, prompt: task.prompt, pass: false, quality: 0, output: '(no response)', graderType: 'judge' });
          continue;
        }
        const grade = await judge(judgeId, task, output);
        if (grade === null) continue; // ungraded -> exclude
        results.push({ category: task.category, prompt: task.prompt, pass: grade.pass, quality: grade.quality, output, graderType: 'judge' });
      }
    }
  } finally {
    await cleanup();
  }

  const graded = results.filter((x) => x.output !== '(no response)' || true);
  const reliability = results.length ? results.filter((x) => x.pass).length / results.length : 0;
  const quality = results.length ? Math.round(results.reduce((s, x) => s + x.quality, 0) / results.length) : 0;
  return {
    reliability: Number(reliability.toFixed(2)),
    quality,
    costToDone: 0,
    trustScore: trustScore(reliability, quality),
    nTasks: tasks.length,
    nRuns: results.length,
    results,
  };
}
