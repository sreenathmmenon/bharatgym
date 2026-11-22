// GET /api/rollouts — every graded rollout as JSONL (one trajectory per line).
// This is the training-data export: steps, final state, checks, reward. task.expected
// never appears here; rollouts carry only what the agent saw and what the grader ruled.
import { allRollouts } from '../../../src/harness/cache.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const body = allRollouts().map(r => JSON.stringify(r)).join('\n') + '\n';
  return new Response(body, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'content-disposition': 'attachment; filename="bharat-gym-rollouts.jsonl"',
    },
  });
}
