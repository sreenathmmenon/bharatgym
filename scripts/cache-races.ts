// Pre-demo caching tool: run races for the given task ids and print shareIds.
//   npx tsx scripts/cache-races.ts H1 H3 K8 [--agents=claude,gpt] [--env=kirana-v1]
// Mode is automatic: live lanes if any provider key is set, otherwise scripted demo lanes.
// Scripted lanes run without the theatrical delay unless SCRIPTED_DELAY_MS is set.
process.env.SCRIPTED_DELAY_MS ??= '0';

const { race, withRace } = await import('../src/harness/runner.js');
const { findTask, envFactoryFor } = await import('../src/harness/registry.js');
const { buildLanes, hasLiveKeys } = await import('../src/harness/lanes.js');

const args = process.argv.slice(2);
const flag = (n: string) => args.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
const taskIds = args.filter(a => !a.startsWith('--'));
const agentIds = flag('agents')?.split(',').filter(Boolean);
const envId = flag('env');

if (!taskIds.length) {
  console.error('usage: tsx scripts/cache-races.ts <taskId...> [--agents=a,b] [--env=kirana-v1]');
  process.exit(1);
}
console.log(`mode: ${hasLiveKeys() ? 'LIVE' : 'SCRIPTED (no API keys)'}  db: ${process.env.DB_DIR ?? './data'}`);

let failed = 0;
for (const id of taskIds) {
  const task = findTask(id, envId);
  if (!task) { console.error(`${id}: unknown task`); failed++; continue; }
  const lanes = buildLanes(task, agentIds);
  if (!lanes.length) { console.error(`${id}: no runnable agents`); failed++; continue; }
  const rollouts = await withRace(`cache-${id}-${Date.now()}`, () => race(envFactoryFor(task), task, lanes));
  console.log(`\n${task.id} [${task.split}] ${task.title}`);
  for (const r of rollouts) console.log(`  ${r.agentId.padEnd(18)} ${String(r.score).padStart(3)}/100  /r/${r.shareId}`);
  if (rollouts.length < lanes.length) console.log(`  (${lanes.length - rollouts.length} lane(s) crashed and were not cached)`);
}
process.exit(failed ? 1 : 0);
