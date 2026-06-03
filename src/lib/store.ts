import { getRecursiv } from './recursiv';
import { PROJECT_ID, BUCKET } from './constants';

// Object-storage persistence for Verify (avoids the per-org Neon DB cap).
// Objects are JSON blobs keyed like a path: agents/{owner}/{id}.json, runs/{agentId}/{runId}.json

let ensured = false;
async function ensureBucket() {
  if (ensured) return;
  await getRecursiv().storage.ensureBucket({ project_id: PROJECT_ID, name: BUCKET });
  ensured = true;
}

export async function putJson(key: string, value: unknown): Promise<void> {
  await ensureBucket();
  const { data } = await getRecursiv().storage.getUploadUrl({
    project_id: PROJECT_ID, bucket_name: BUCKET, key, content_type: 'application/json',
  });
  const res = await fetch(data.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`storage put ${res.status} for ${key}`);
}

export async function getJson<T>(key: string): Promise<T | null> {
  await ensureBucket();
  try {
    const { data } = await getRecursiv().storage.getDownloadUrl({ project_id: PROJECT_ID, bucket_name: BUCKET, key });
    const res = await fetch(data.url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function deleteKey(key: string): Promise<void> {
  await ensureBucket();
  try { await getRecursiv().storage.deleteObject({ project_id: PROJECT_ID, bucket_name: BUCKET, key }); } catch {}
}

export async function listKeys(prefix: string): Promise<{ key: string; lastModified: string }[]> {
  await ensureBucket();
  const { data } = await getRecursiv().storage.listItems({ project_id: PROJECT_ID, bucket_name: BUCKET, prefix, limit: 1000 });
  return (data || [])
    .filter((i) => i.key.endsWith('.json'))
    .map((i) => ({ key: i.key, lastModified: i.last_modified }));
}
