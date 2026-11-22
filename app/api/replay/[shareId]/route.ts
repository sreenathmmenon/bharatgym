// GET /r/:shareId — full cached Rollout (graded final state; never contains task.expected).
import { byShareId } from '../../../../src/harness/cache.js';
import { json, bad } from '../../../../src/harness/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await ctx.params;
  const r = byShareId(shareId);
  if (!r) return bad('not found', 404);
  return json({ ...r, isCached: true });
}
