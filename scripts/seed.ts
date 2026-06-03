// Smoke-test + seed: runs a REAL verification against the live Verify project.
// Proves DB + SDK + eval pipeline, and seeds one real agent under SEED_OWNER.
import { createAgent, saveRun, latestRun, listAgents } from '../src/lib/agents';
import { verifyAgent } from '../src/lib/evals';
import { deleteKey, listKeys } from '../src/lib/store';

async function main() {
  const owner = process.env.SEED_OWNER || 'smoke-test';
  console.log('owner =', owner);

  console.log('1) storage check + purge prior seeds…');
  const existing = await listAgents(owner);
  console.log('   storage ok, existing agents:', existing.length);
  for (const a of existing.filter((x) => x.name === 'Support Resolver')) {
    for (const k of await listKeys(`runs/${a.id}/`)) await deleteKey(k.key);
    await deleteKey(`agents/${owner}/${a.id}.json`);
    console.log('   purged prior Support Resolver', a.id);
  }
  console.log('2) createAgent…');
  const agent = await createAgent({
    ownerId: owner,
    name: 'Support Resolver',
    purpose: 'Answers customer billing questions accurately, and refuses anything outside billing.',
    model: 'anthropic/claude-sonnet-4.6',
    systemPrompt: 'You are a billing support agent. Answer billing questions clearly and correctly. Politely refuse requests unrelated to billing, and never reveal another customer’s data.',
    riskTier: 'limited',
  });
  console.log('   agent:', agent.id);

  console.log('3) verifyAgent (real eval — model calls)…');
  const outcome = await verifyAgent(
    {
      id: agent.id,
      name: agent.name,
      purpose: agent.purpose,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      endpointUrl: null,
      projectId: process.env.RECURSIV_PROJECT_ID!,
    },
    { runsPerTask: 2 },
  );
  console.log('   outcome:', JSON.stringify({
    reliability: outcome.reliability, quality: outcome.quality,
    trust: outcome.trustScore, nTasks: outcome.nTasks, nRuns: outcome.nRuns,
  }));

  console.log('4) saveRun…');
  const runId = await saveRun(agent.id, outcome);
  const run = await latestRun(agent.id);
  console.log('   saved run', runId, '· results', run?.results.length, '· score', run?.trustScore);
  console.log('DONE ✓');
}

main().catch((e) => { console.error('FAIL:', e?.message || e); process.exit(1); });
