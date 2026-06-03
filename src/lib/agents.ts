import { randomUUID } from 'crypto';
import { query } from './db';
import type { Agent, EvalRun, TaskResult } from './types';
import type { RunOutcome } from './evals';

function rowToAgent(r: any): Agent {
  return {
    id: r.id,
    orgId: r.owner_id,
    name: r.name,
    purpose: r.purpose,
    model: r.model,
    systemPrompt: r.system_prompt,
    endpointUrl: r.endpoint_url,
    riskTier: r.risk_tier,
    createdAt: r.created_at,
  };
}

function rowToRun(r: any): EvalRun {
  return {
    id: r.id,
    agentId: r.agent_id,
    status: r.status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    trustScore: Math.round(Number(r.trust_score) || 0),
    reliability: Number(r.reliability) || 0,
    quality: Math.round(Number(r.quality) || 0),
    costToDone: Number(r.cost_to_done) || 0,
    nTasks: Number(r.n_tasks) || 0,
    nRuns: Number(r.n_runs) || 0,
  };
}

export async function listAgents(ownerId: string): Promise<Agent[]> {
  const rows = await query(`SELECT * FROM agents WHERE owner_id = $1 ORDER BY created_at DESC`, [ownerId]);
  return rows.map(rowToAgent);
}

export async function getAgent(id: string, ownerId: string): Promise<Agent | null> {
  const rows = await query(`SELECT * FROM agents WHERE id = $1 AND owner_id = $2 LIMIT 1`, [id, ownerId]);
  return rows[0] ? rowToAgent(rows[0]) : null;
}

export async function createAgent(input: {
  ownerId: string;
  name: string;
  purpose: string;
  model: string;
  systemPrompt: string;
  endpointUrl?: string | null;
  riskTier?: Agent['riskTier'];
}): Promise<Agent> {
  const id = randomUUID();
  await query(
    `INSERT INTO agents (id, owner_id, name, purpose, model, system_prompt, endpoint_url, risk_tier)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      input.ownerId,
      input.name,
      input.purpose,
      input.model,
      input.systemPrompt,
      input.endpointUrl || null,
      input.riskTier || 'limited',
    ],
  );
  const a = await getAgent(id, input.ownerId);
  return a!;
}

/** Most recent run for an agent (or null). */
export async function latestRun(agentId: string): Promise<EvalRun | null> {
  const rows = await query(
    `SELECT * FROM eval_runs WHERE agent_id = $1 ORDER BY started_at DESC LIMIT 1`,
    [agentId],
  );
  return rows[0] ? rowToRun(rows[0]) : null;
}

/** Latest run for each of a set of agents, keyed by agentId. */
export async function latestRuns(agentIds: string[]): Promise<Record<string, EvalRun>> {
  if (!agentIds.length) return {};
  const rows = await query(
    `SELECT DISTINCT ON (agent_id) * FROM eval_runs
     WHERE agent_id = ANY($1) ORDER BY agent_id, started_at DESC`,
    [agentIds],
  );
  const out: Record<string, EvalRun> = {};
  for (const r of rows) out[r.agent_id] = rowToRun(r);
  return out;
}

export async function getRun(runId: string): Promise<EvalRun | null> {
  const rows = await query(`SELECT * FROM eval_runs WHERE id = $1 LIMIT 1`, [runId]);
  return rows[0] ? rowToRun(rows[0]) : null;
}

export async function runResults(runId: string): Promise<TaskResult[]> {
  const rows = await query(`SELECT * FROM task_results WHERE run_id = $1`, [runId]);
  return rows.map((r: any) => ({
    id: r.id,
    runId: r.run_id,
    category: r.category,
    prompt: r.prompt,
    pass: !!r.pass,
    quality: Math.round(Number(r.quality) || 0),
    costUsd: Number(r.cost_usd) || 0,
    ms: Number(r.ms) || 0,
    output: r.output,
    graderType: r.grader_type,
  }));
}

/** Persist a completed verification run + its task results. Returns the run id. */
export async function saveRun(agentId: string, outcome: RunOutcome): Promise<string> {
  const runId = randomUUID();
  await query(
    `INSERT INTO eval_runs (id, agent_id, status, finished_at, trust_score, reliability, quality, cost_to_done, n_tasks, n_runs)
     VALUES ($1,$2,'complete',NOW(),$3,$4,$5,$6,$7,$8)`,
    [runId, agentId, outcome.trustScore, outcome.reliability, outcome.quality, outcome.costToDone, outcome.nTasks, outcome.nRuns],
  );
  for (const res of outcome.results) {
    await query(
      `INSERT INTO task_results (id, run_id, category, prompt, pass, quality, cost_usd, ms, output, grader_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [randomUUID(), runId, res.category, res.prompt, res.pass, res.quality, 0, 0, res.output, res.graderType],
    );
  }
  return runId;
}
