// GET /api/leaderboard — aggregate over cached rollouts.
import { leaderboard } from '../../../src/harness/cache.js';
import { json } from '../../../src/harness/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return json({ rows: leaderboard() });
}
