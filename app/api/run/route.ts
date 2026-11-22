// POST /api/run {taskId, envId?, agentIds?} -> SSE stream of THIS race's events only.
// GET  /api/run?taskId=..&agentIds=a,b   (same, for EventSource which can only GET).
// No API keys set -> scripted demo lanes (ref-perfect / unit-confuser / consent-skipper).
import { findTask } from '../../../src/harness/registry.js';
import { buildLanes } from '../../../src/harness/lanes.js';
import { raceStreamResponse } from '../../../src/harness/sse.js';
import { bad, readBody } from '../../../src/harness/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function start(taskId: unknown, envId: unknown, agentIds: unknown): Response {
  if (typeof taskId !== 'string' || !taskId) return bad('taskId required');
  const task = findTask(taskId, typeof envId === 'string' && envId ? envId : undefined);
  if (!task) return bad(`unknown task ${taskId}`, 404);
  const ids = Array.isArray(agentIds) ? agentIds.filter((x): x is string => typeof x === 'string') : undefined;
  const lanes = buildLanes(task, ids);
  if (!lanes.length) return bad('no runnable agents for this request');
  return raceStreamResponse(task, lanes);
}

export async function POST(req: Request) {
  const b = await readBody(req);
  if (!b) return bad('invalid JSON body');
  return start(b.taskId, b.envId, b.agentIds);
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const ids = q.get('agentIds');
  return start(q.get('taskId'), q.get('envId'), ids ? ids.split(',').map(s => s.trim()).filter(Boolean) : undefined);
}
