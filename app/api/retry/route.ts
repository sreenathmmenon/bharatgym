// POST /api/retry {agentId, envId, seeds?} — Reward-Guided Retry. Returns the gate verdict + prompt diff.
import { retryAgent } from '../../../src/harness/retry.js';
import { envById } from '../../../src/harness/registry.js';
import { json, bad, readBody } from '../../../src/harness/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  const b = await readBody(req);
  if (!b) return bad('invalid JSON body');
  const agentId = typeof b.agentId === 'string' ? b.agentId : '';
  const envId = typeof b.envId === 'string' ? b.envId : 'kirana-v1';
  if (!agentId) return bad('agentId required');
  if (!envById(envId)) return bad(`unknown envId ${envId}`);
  const seeds = Math.min(3, Math.max(1, Math.floor(Number(b.seeds ?? 1)) || 1));
  try {
    return json(await retryAgent(undefined, agentId, envId, { seeds }));
  } catch (e) {
    return bad(String((e as Error).message ?? e).slice(0, 300), 422);
  }
}
