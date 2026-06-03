import { randomUUID } from 'crypto';
import { putJson, getJson, listKeys } from './store';
import type { Agent, EvalRun, TaskResult } from './types';
import type { RunOutcome } from './evals';

const agentKey = (owner: string, id: string) => `agents/${owner}/${id}.json`;
const runKey = (agentId: string, runId: string) => `runs/${agentId}/${runId}.json`;

/** A run with its task results stored inline. */
export interface StoredRun extends EvalRun {
  results: TaskResult[];
  controls?: import('./evals').ControlResult[];
}

export async function listAgents(ownerId: string): Promise<Agent[]> {
  const keys = await listKeys(`agents/${ownerId}/`);
  const agents = (await Promise.all(keys.map((k) => getJson<Agent>(k.key)))).filter(Boolean) as Agent[];
  return agents.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function getAgent(id: string, ownerId: string): Promise<Agent | null> {
  return getJson<Agent>(agentKey(ownerId, id));
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
  const agent: Agent = {
    id: randomUUID(),
    orgId: input.ownerId,
    name: input.name,
    purpose: input.purpose,
    model: input.model,
    systemPrompt: input.systemPrompt,
    endpointUrl: input.endpointUrl || null,
    riskTier: input.riskTier || 'limited',
    createdAt: new Date().toISOString(),
  };
  await putJson(agentKey(input.ownerId, agent.id), agent);
  return agent;
}

/** Most recent run for an agent (with results inline), or null. */
export async function latestRun(agentId: string): Promise<StoredRun | null> {
  const keys = await listKeys(`runs/${agentId}/`);
  if (!keys.length) return null;
  keys.sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''));
  return getJson<StoredRun>(keys[0].key);
}

/** Latest run for each agent, keyed by agentId. */
export async function latestRuns(agentIds: string[]): Promise<Record<string, StoredRun>> {
  const out: Record<string, StoredRun> = {};
  await Promise.all(
    agentIds.map(async (id) => {
      const r = await latestRun(id);
      if (r) out[id] = r;
    }),
  );
  return out;
}

/** Persist a completed verification run + its task results. Returns the run id. */
export async function saveRun(agentId: string, outcome: RunOutcome): Promise<string> {
  const runId = randomUUID();
  const now = new Date().toISOString();
  const run: StoredRun = {
    id: runId,
    agentId,
    status: 'complete',
    startedAt: now,
    finishedAt: now,
    trustScore: outcome.trustScore,
    reliability: outcome.reliability,
    quality: outcome.quality,
    costToDone: outcome.costToDone,
    nTasks: outcome.nTasks,
    nRuns: outcome.nRuns,
    controls: outcome.controls,
    results: outcome.results.map((r, i) => ({
      id: `${runId}-${i}`,
      runId,
      category: r.category,
      prompt: r.prompt,
      pass: r.pass,
      quality: r.quality,
      costUsd: 0,
      ms: 0,
      output: r.output,
      graderType: r.graderType,
    })),
  };
  await putJson(runKey(agentId, runId), run);
  return runId;
}
