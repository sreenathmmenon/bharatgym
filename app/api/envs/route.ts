// GET /api/envs — env registry. Tasks are returned WITHOUT expected (and HELD_OUT prompts sealed until reveal).
import { ENVS, allTasks, publicTask } from '../../../src/harness/registry.js';
import { json } from '../../../src/harness/http.js';
import type { Split } from '../../../src/contracts/contract.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const envs = ENVS.map(e => {
    const tasks = allTasks(e.id);
    const counts: Record<Split, number> = { TRAIN: 0, HELD_OUT: 0, AUDIENCE: 0 };
    for (const t of tasks) counts[t.split]++;
    return { id: e.id, name: e.name, graderVersion: e.graderVersion, counts, tasks: tasks.map(publicTask) };
  });
  return json({ envs });
}
