// Core domain model for Recursiv Verify.

export interface Org {
  id: string;
  name: string;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  orgId: string;
  createdAt: string;
}

/** An agent under test — what the customer wants to verify + monitor. */
export interface Agent {
  id: string;
  orgId: string;
  name: string;
  purpose: string; // plain-language description of what it should do
  model: string; // model id it runs on (for agents we execute)
  systemPrompt: string;
  endpointUrl?: string | null; // optional: call the customer's own deployed agent
  riskTier: 'high' | 'limited' | 'minimal'; // EU AI Act risk classification
  createdAt: string;
}

export type RunStatus = 'queued' | 'running' | 'complete' | 'failed';

/** One evaluation run of an agent's suite. */
export interface EvalRun {
  id: string;
  agentId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string | null;
  // headline metrics computed from task results
  trustScore: number; // 0-100 composite
  reliability: number; // 0-1 (pass^k)
  quality: number; // 0-100
  costToDone: number; // $ per completed task
  nTasks: number;
  nRuns: number; // total graded trials
}

export interface TaskResult {
  id: string;
  runId: string;
  category: string;
  prompt: string;
  pass: boolean;
  quality: number;
  costUsd: number;
  ms: number;
  output: string;
  graderType: 'code' | 'judge';
}
