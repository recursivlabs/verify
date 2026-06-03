import { getRecursiv } from './recursiv';
import { PROJECT_ID, DB_NAME } from './constants';

let dbReady = false;

/** Ensure the Verify database + tables exist. Safe to call repeatedly. */
export async function ensureDatabase(): Promise<void> {
  if (dbReady) return;
  const r = getRecursiv();
  await r.databases.ensure({ project_id: PROJECT_ID, name: DB_NAME });

  await r.databases.query({
    project_id: PROJECT_ID,
    database_name: DB_NAME,
    sql: `
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        purpose TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL,
        system_prompt TEXT NOT NULL DEFAULT '',
        endpoint_url TEXT,
        risk_tier TEXT NOT NULL DEFAULT 'limited',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
  });

  await r.databases.query({
    project_id: PROJECT_ID,
    database_name: DB_NAME,
    sql: `
      CREATE TABLE IF NOT EXISTS eval_runs (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        started_at TIMESTAMPTZ DEFAULT NOW(),
        finished_at TIMESTAMPTZ,
        trust_score REAL DEFAULT 0,
        reliability REAL DEFAULT 0,
        quality REAL DEFAULT 0,
        cost_to_done REAL DEFAULT 0,
        n_tasks INTEGER DEFAULT 0,
        n_runs INTEGER DEFAULT 0
      )
    `,
  });

  await r.databases.query({
    project_id: PROJECT_ID,
    database_name: DB_NAME,
    sql: `
      CREATE TABLE IF NOT EXISTS task_results (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        prompt TEXT NOT NULL DEFAULT '',
        pass BOOLEAN DEFAULT FALSE,
        quality REAL DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        ms INTEGER DEFAULT 0,
        output TEXT DEFAULT '',
        grader_type TEXT DEFAULT 'judge'
      )
    `,
  });

  dbReady = true;
}

/** Execute SQL against the Verify database, returning rows. */
export async function query(sql: string, params?: unknown[]): Promise<any[]> {
  await ensureDatabase();
  const r = getRecursiv();
  const { data } = await r.databases.query({ project_id: PROJECT_ID, database_name: DB_NAME, sql, params });
  if (Array.isArray(data)) return data;
  if ((data as any)?.rows && Array.isArray((data as any).rows)) return (data as any).rows;
  return [];
}
