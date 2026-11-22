// Lane assembly for a race: live frontier + floor entries, or scripted demo lanes when no keys are set.
// Scripted lanes are server-side reference ORACLES (they plan from task.expected in-process); they are
// labelled kind:'scripted' and nothing about them is sent to any model or endpoint.
import type { TaskSpec, ToolCall, AgentEntry } from '../contracts/contract.js';
import { RacingAgent, frontierLanes, floorAgent } from './adapters.js';
import { floorEntries } from './cache.js';
import { KIRANA_POLICIES, ScriptedPolicy } from '../envs/kirana/policies.js';

export const MAX_LANES = 8;
export const hasLiveKeys = () => frontierLanes().length > 0;
export const SCRIPTED_IDS = KIRANA_POLICIES.map(p => p.id);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const scriptedDelay = () => {
  const base = Number(process.env.SCRIPTED_DELAY_MS ?? 350);
  return base > 0 ? base * (0.6 + Math.random() * 0.8) : 0;
};

/** Wrap a scripted policy as a RacingAgent. Step index = number of tool results seen so far. */
export function scriptedAgent(policy: ScriptedPolicy, task: TaskSpec, idOverride?: string): RacingAgent {
  const plan = policy.plan(task); // planned once, server-side
  return {
    id: idOverride ?? policy.id, name: policy.name, kind: 'scripted',
    async next(_system, transcript) {
      const d = scriptedDelay();
      if (d) await sleep(d);
      const i = transcript.filter(m => m.role === 'tool').length;
      return i < plan.calls.length ? { call: plan.calls[i] } : { finalText: plan.claim };
    },
  };
}

export const scriptedLanes = (task: TaskSpec): RacingAgent[] =>
  task.envId === 'kirana-v1' ? KIRANA_POLICIES.map(p => scriptedAgent(p, task)) : [];

const isToolCall = (c: unknown): c is ToolCall =>
  !!c && typeof c === 'object' && typeof (c as ToolCall).name === 'string'
  && !!(c as ToolCall).args && typeof (c as ToolCall).args === 'object' && !Array.isArray((c as ToolCall).args);

/** Floor agent with output validation (a malformed endpoint reply becomes a final claim, not a crash). */
export function safeFloorAgent(entry: AgentEntry): RacingAgent | null {
  if (!('url' in entry.config) && !hasLiveKeys()) return null; // prompt entries need a model key
  const inner = floorAgent(entry);
  return {
    ...inner,
    async next(system, transcript, tools) {
      const turn = await inner.next(system, transcript, tools);
      if (turn.call && !isToolCall(turn.call)) return { finalText: '(endpoint returned a malformed tool call)' };
      return turn;
    },
  };
}

/**
 * Lanes for one race. Live: frontier lanes + registered floor entries. No keys: scripted lanes + URL floor entries.
 * Scripted ids may also be requested explicitly in live mode. agentIds filters (and orders nothing).
 */
export function buildLanes(task: TaskSpec, agentIds?: string[]): RacingAgent[] {
  const live = hasLiveKeys();
  const floors = floorEntries().map(safeFloorAgent).filter((a): a is RacingAgent => !!a);
  let pool: RacingAgent[] = live ? [...frontierLanes(), ...floors] : [...scriptedLanes(task), ...floors];
  if (agentIds?.length) {
    if (live) pool = [...pool, ...scriptedLanes(task).filter(s => agentIds.includes(s.id))];
    const want = new Set(agentIds);
    pool = pool.filter(a => want.has(a.id));
  }
  const seen = new Set<string>();
  return pool.filter(a => (seen.has(a.id) ? false : (seen.add(a.id), true))).slice(0, MAX_LANES);
}
