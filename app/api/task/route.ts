// POST /api/task — audience-submitted task (split forced to AUDIENCE). GET — list (no expected).
import type { TaskSpec, EnvId } from '../../../src/contracts/contract.js';
import { saveAudienceTask, audienceTasks } from '../../../src/harness/cache.js';
import { envById, publicTask } from '../../../src/harness/registry.js';
import { json, bad, readBody, rand4 } from '../../../src/harness/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const b = await readBody(req);
  if (!b) return bad('invalid JSON body');
  const envId = typeof b.envId === 'string' ? b.envId : '';
  if (!envById(envId)) return bad(`unknown envId ${envId}`);
  const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
  if (!prompt || prompt.length > 200) return bad('prompt required, max 200 chars');
  const contributor = typeof b.contributor === 'string' ? b.contributor.trim() : '';
  if (contributor.length > 30) return bad('contributor max 30 chars');

  let expected: Record<string, unknown>;
  if (b.expectedTotalRs === undefined || b.expectedTotalRs === null || b.expectedTotalRs === '') {
    expected = { cart: [], ungraded: true };   // grader skips ARITHMETIC_TOTAL
  } else {
    const rs = Number(b.expectedTotalRs);
    if (!Number.isFinite(rs) || rs < 0 || rs > 1_000_000) return bad('expectedTotalRs must be a number between 0 and 1000000');
    expected = { cart: [], totalPaise: Math.round(rs * 100) };
  }

  const task: TaskSpec = {
    id: `A-${rand4()}${rand4()}`, envId: envId as EnvId, split: 'AUDIENCE',
    title: prompt.length > 40 ? prompt.slice(0, 39) + '…' : prompt, prompt, expected,
    ...(contributor ? { contributor } : {}),
  };
  saveAudienceTask(task);
  return json(publicTask(task), 201);
}

export async function GET() {
  return json({ tasks: audienceTasks().map(publicTask) });
}
