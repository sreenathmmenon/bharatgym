// Env registry — one place that knows every env, its tasks, and how to build a graded env for a task.
// Agent-facing rule: task.expected NEVER leaves the server. publicTask() is the only shape routes return.
import type { BharatEnv, EnvId, Split, TaskSpec, Grade } from '../contracts/contract.js';
import { KiranaEnv } from '../envs/kirana/env.js';
import { KIRANA_TASKS } from '../envs/kirana/cases.js';
import { GstEnv } from '../envs/gst/env.js';
import { GST_CASES } from '../envs/gst/cases.js';
import { UpiEnv } from '../envs/upi/env.js';
import { UPI_CASES } from '../envs/upi/cases.js';
import { audienceTasks } from './cache.js';
import { GRADER_VERSION } from './runner.js';

export interface EnvRegistration {
  id: EnvId;
  name: string;
  graderVersion: string;
  make: () => BharatEnv;
  tasks: TaskSpec[];          // built-in TRAIN + HELD_OUT
}

// gst-filing-v1 / upi-dispute-v1: register here once their env + cases land in src/envs/<name>/.
export const ENVS: EnvRegistration[] = [
  { id: 'kirana-v1', name: 'Kirana Counter', graderVersion: GRADER_VERSION, make: () => new KiranaEnv(), tasks: KIRANA_TASKS },
  { id: 'gst-filing-v1', name: 'GST Filing Desk', graderVersion: GRADER_VERSION, make: () => new GstEnv(), tasks: GST_CASES },
  { id: 'upi-dispute-v1', name: 'UPI Dispute Desk', graderVersion: GRADER_VERSION, make: () => new UpiEnv(), tasks: UPI_CASES },
];

export const envById = (id: string) => ENVS.find(e => e.id === id);

/** Built-in tasks for an env plus AUDIENCE submissions for it. */
export const allTasks = (envId?: string): TaskSpec[] => {
  const builtIn = ENVS.filter(e => !envId || e.id === envId).flatMap(e => e.tasks);
  const aud = audienceTasks().filter(t => !envId || t.envId === envId);
  return [...builtIn, ...aud];
};
export const findTask = (taskId: string, envId?: string) => allTasks(envId).find(t => t.id === taskId);

// HELD_OUT prompts stay sealed in public listings until the stage reveal (REVEAL_HELD_OUT=1).
const heldOutRevealed = () => process.env.REVEAL_HELD_OUT === '1';

export interface PublicTask {
  id: string; envId: EnvId; split: Split; title: string; prompt: string | null;
  contributor?: string; ungraded?: boolean; sealed?: boolean;
}
export function publicTask(t: TaskSpec): PublicTask {
  const sealed = t.split === 'HELD_OUT' && !heldOutRevealed();
  const out: PublicTask = { id: t.id, envId: t.envId, split: t.split, title: t.title, prompt: sealed ? null : t.prompt };
  if (t.contributor) out.contributor = t.contributor;
  if (t.split === 'AUDIENCE' && t.expected.ungraded === true) out.ungraded = true;
  if (sealed) out.sealed = true;
  return out;
}

// AUDIENCE tasks carry no expected cart (cart: []), so cart-comparing checks would be meaningless.
// We keep only what the submission can actually ground: ARITHMETIC_TOTAL (if a total was given),
// TILL_BALANCED, FINALIZED. Ungraded submissions drop ARITHMETIC_TOTAL too.
const AUDIENCE_DROP = new Set(['ITEM_MATCH', 'QTY_PARSE', 'NO_HALLUCINATION']);
function regradeAudience(g: Grade, task: TaskSpec): Grade {
  const ungraded = task.expected.ungraded === true;
  const checks = g.checks.filter(c => !AUDIENCE_DROP.has(c.ruleId) && !(ungraded && c.ruleId === 'ARITHMETIC_TOTAL'));
  const totalW = checks.reduce((a, c) => a + c.weight, 0);
  const gotW = checks.filter(c => c.passed).reduce((a, c) => a + c.weight, 0);
  return { score: totalW ? Math.round((gotW / totalW) * 100) : 0, checks };
}

/** Env factory for a task: the registered env, with AUDIENCE grading adjusted. */
export function envFactoryFor(task: TaskSpec): () => BharatEnv {
  const reg = envById(task.envId);
  if (!reg) throw new Error(`no env registered for ${task.envId}`);
  if (task.split !== 'AUDIENCE') return reg.make;
  return () => {
    const env = reg.make();
    const grade = env.grade.bind(env);
    env.grade = (t: TaskSpec) => regradeAudience(grade(t), t);
    return env;
  };
}
