// The race engine: N agents x 1 task, parallel, step-capped, SSE events, graded by env, cached.
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { AsyncLocalStorage } from 'node:async_hooks';
import { BharatEnv, TaskSpec, Rollout, StepLog, SseEvent } from '../contracts/contract.js';
import { RacingAgent, Msg } from './adapters.js';
import { saveRollouts } from './cache.js';

export const MAX_STEPS = 12;
export const EPISODE_DEADLINE_MS = 90_000;
export const GRADER_VERSION = 'v1';

export const bus = new EventEmitter();
bus.setMaxListeners(50);
// Race scoping: events stay contract-shaped; the race id rides as a 2nd emit arg, taken from
// AsyncLocalStorage so concurrent races (stage + floor + retry) never bleed into each other's SSE.
// Listener signature: (e: SseEvent, raceId: string | undefined).
export const raceScope = new AsyncLocalStorage<string>();
export const withRace = <T>(raceId: string, fn: () => Promise<T>): Promise<T> => raceScope.run(raceId, fn);
const emit = (e: SseEvent) => bus.emit('sse', e, raceScope.getStore());

const SYSTEM = (task: TaskSpec, toolsNote: string) =>
  `You are an agent working at an Indian service counter. Complete the customer's request EXACTLY using the tools. ${toolsNote}
When the task is fully done, reply with ONE short sentence telling the customer it is done (no tool call).`;

export async function runLane(makeEnv: () => BharatEnv, task: TaskSpec, agent: RacingAgent, raceId = 'solo'): Promise<Rollout> {
  const env = makeEnv();
  const first = env.reset(task);
  const transcript: Msg[] = [{ role: 'user', content: first.text }];
  const steps: StepLog[] = [];
  let claim = '';
  let nudges = 0;
  const t0 = Date.now();

  for (let i = 0; i < MAX_STEPS; i++) {
    if (Date.now() - t0 > EPISODE_DEADLINE_MS) break;
    emit({ t: 'step_started', agentId: agent.id, i, raceId } as any);
    const s0 = Date.now();
    let turn;
    try { turn = await agent.next(SYSTEM(task, ''), transcript, env.tools); }
    catch (e) {
      // one retry on transient provider error
      try { turn = await agent.next(SYSTEM(task, ''), transcript, env.tools); }
      catch (e2) { claim = `[DNF] agent error: ${String(e2).slice(0, 80)}`; break; }
    }
    const latencyMs = Date.now() - s0;
    if (turn.call) {
      const obs = env.step(turn.call);
      const step: StepLog = { i, call: turn.call, obs: obs.text, latencyMs };
      steps.push(step);
      transcript.push({ role: 'assistant', content: '', toolCall: turn.call });
      transcript.push({ role: 'tool', content: obs.text });
      emit({ t: 'tool_result', agentId: agent.id, step, raceId } as any);
    } else {
      const text = (turn.finalText ?? '').trim();
      const lastObs = steps.length ? steps[steps.length - 1].obs : '';
      const premature = steps.length === 0 || lastObs.includes('ERROR') || lastObs.includes('OUT OF STOCK');
      if (premature && nudges < 2) {
        nudges++;
        transcript.push({ role: 'user', content: 'The task is NOT finished. Continue using tool calls until it is done.' });
        continue;
      }
      claim = text || '(done, said nothing)';
      break;
    }
  }
  if (!claim) claim = '(ran out of steps without declaring done)';
  emit({ t: 'model_claimed_done', agentId: agent.id, claim, raceId } as any);

  const grade = env.grade(task);
  const rollout: Rollout = {
    runId: randomUUID(), envId: task.envId, taskId: task.id, agentId: agent.id,
    steps, finalClaimText: claim, finalState: env.finalState(),
    score: grade.score, checks: grade.checks, graderVersion: GRADER_VERSION,
    totalLatencyMs: Date.now() - t0, shareId: randomUUID().slice(0, 8),
  };
  emit({ t: 'grader_verdict', agentId: agent.id, rollout, raceId } as any);
  return rollout;
}

export async function race(makeEnv: () => BharatEnv, task: TaskSpec, agents: RacingAgent[], raceId = Math.random().toString(36).slice(2, 8)): Promise<Rollout[]> {
  const settled = await Promise.allSettled(agents.map(a => runLane(makeEnv, task, a, raceId)));
  const ok = settled.filter((s): s is PromiseFulfilledResult<Rollout> => s.status === 'fulfilled').map(s => s.value);
  saveRollouts(ok);
  emit({ t: 'race_done', rollouts: ok.map(r => ({ agentId: r.agentId, score: r.score, shareId: r.shareId })), raceId } as any);
  return ok;
}
