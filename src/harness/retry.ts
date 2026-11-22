// Reward-Guided Retry (RGR): grader failures on TRAIN -> one instruction rewrite -> gated on HELD_OUT.
// The rewriter sees ONLY TRAIN check results (ruleId + reason). HELD_OUT is used solely for the gate.
// Gate: promote iff avg(after) > avg(before) on HELD_OUT AND no HELD_OUT task scores lower after.
import { randomUUID } from 'node:crypto';
import type { BharatEnv, TaskSpec, Rollout, AgentEntry } from '../contracts/contract.js';
import { RacingAgent, floorAgent, frontierLanes } from './adapters.js';
import { runLane, withRace } from './runner.js';
import { saveRollouts, floorEntries, saveFloorEntry } from './cache.js';
import { envById, envFactoryFor } from './registry.js';
import { hasLiveKeys, scriptedAgent } from './lanes.js';
import { KIRANA_POLICIES } from '../envs/kirana/policies.js';
import { slug, rand4 } from './http.js';

export interface FailedRule { taskId: string; ruleId: string; reason: string; }
export interface RetryResult {
  agentId: string; envId: string;
  failedRules: FailedRule[];
  beforeHoldAvg: number; afterHoldAvg: number;
  perTask: { taskId: string; before: number; after: number }[];
  promoted: boolean; promotedAgentId?: string;
  diff: { oldSystem: string; newSystem: string };
  simulated?: boolean; seeds: number; errors: number;
}
export type EnvFactoryByTask = (task: TaskSpec) => () => BharatEnv;

const MAX_PARALLEL = 4;
const MAX_SYSTEM = 2000;
const REWRITE_TIMEOUT_MS = 30_000;

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let k = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (k < items.length) { const i = k++; out[i] = await fn(items[i]); }
  }));
  return out;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Run one agent (built per task) over tasks x seeds; returns per-task mean scores + rollouts. */
async function evaluate(makeEnv: EnvFactoryByTask, tasks: TaskSpec[], agentFor: (t: TaskSpec) => RacingAgent, seeds: number) {
  const jobs = tasks.flatMap(t => Array.from({ length: seeds }, () => t));
  let errors = 0;
  const results = await pool(jobs, MAX_PARALLEL, async t => {
    try { return await runLane(makeEnv(t), t, agentFor(t)); }
    catch { errors++; return null; }
  });
  const rollouts = results.filter((r): r is Rollout => !!r);
  const perTask = new Map<string, number>();
  for (const t of tasks) {
    const scores = jobs.map((j, i) => (j.id === t.id ? (results[i]?.score ?? 0) : null)).filter((s): s is number => s !== null);
    perTask.set(t.id, avg(scores));
  }
  return { perTask, rollouts, errors };
}

function collectFailures(rollouts: Rollout[]): FailedRule[] {
  const seen = new Set<string>();
  const out: FailedRule[] = [];
  for (const r of rollouts) for (const c of r.checks) {
    if (c.passed) continue;
    const key = `${r.taskId}|${c.ruleId}|${c.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ taskId: r.taskId, ruleId: c.ruleId, reason: c.reason });
  }
  return out;
}

// ---------- the ONE rewrite call (claude preferred, else the agent's own family) ----------
const OPENAI_COMPAT: Record<string, { url: string; key: string; model: string }> = {
  gpt: { url: 'https://api.openai.com/v1', key: 'OPENAI_API_KEY', model: process.env.OPENAI_MODEL ?? 'gpt-5.2' },
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai', key: 'GEMINI_API_KEY', model: process.env.GEMINI_MODEL ?? 'gemini-2.5-pro' },
  sarvam: { url: 'https://api.sarvam.ai/v1', key: 'SARVAM_API_KEY', model: process.env.SARVAM_MODEL ?? 'sarvam-m' },
};

const REWRITER_SYSTEM = `You improve the written instructions of an AI agent that serves customers at an Indian kirana (grocery) counter using tools (search_inventory, add_to_cart, offer_substitute, ask_customer, generate_bill, collect_payment).
A code grader checked the agent's final till state and reported specific named failures.
Rewrite the agent's instructions so it fixes THOSE SPECIFIC failures, keeping anything that already works. Be concrete and general (rules, not memorised answers).
Return ONLY the new instructions text. No preamble, no markdown fences, under 1500 characters.`;

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), REWRITE_TIMEOUT_MS);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    if (!r.ok) throw new Error(`rewrite ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function rewriteInstructions(model: string, oldSystem: string, failures: FailedRule[]): Promise<string> {
  const user = `CURRENT INSTRUCTIONS:\n${oldSystem || '(none — the agent ran with no extra instructions)'}\n\nGRADER FAILURES ON PRACTICE TASKS:\n${
    failures.map(f => `- [${f.ruleId}] ${f.reason}`).join('\n')}\n\nWrite the improved instructions now.`;
  let text = '';
  if (process.env.ANTHROPIC_API_KEY) {
    const data = await postJson('https://api.anthropic.com/v1/messages',
      { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      { model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-5', max_tokens: 1024, system: REWRITER_SYSTEM, messages: [{ role: 'user', content: user }] });
    text = (data.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
  } else {
    const fam = OPENAI_COMPAT[model] ?? Object.entries(OPENAI_COMPAT).find(([, v]) => process.env[v.key])?.[1];
    if (!fam || !process.env[fam.key]) throw new Error('no provider key available for the rewrite call');
    const data = await postJson(`${fam.url}/chat/completions`, { authorization: `Bearer ${process.env[fam.key]}` },
      { model: fam.model, temperature: 0.2, messages: [{ role: 'system', content: REWRITER_SYSTEM }, { role: 'user', content: user }] });
    text = data.choices?.[0]?.message?.content ?? '';
  }
  text = text.trim().replace(/^```[a-z]*\n?|```$/g, '').trim();
  if (!text) throw new Error('rewrite returned empty instructions');
  return text.slice(0, MAX_SYSTEM);
}

// ---------- simulated rewrite (no keys): describe the fix, swap behaviour to ref-perfect ----------
const FIX_HINTS: Record<string, string> = {
  ITEM_MATCH: 'Add every item the customer named; search_inventory for each before adding.',
  QTY_PARSE: 'Convert quantity words exactly: aadha=0.5, sawa=1.25, dedh=1.5, dhai=2.5, dozen=12, "teen sau gram" of a 100g pack = 3 packs. Never round kg quantities.',
  NO_HALLUCINATION: 'Never add items the customer did not order.',
  ARITHMETIC_TOTAL: 'Bill only after the cart is final; the bill must match the cart exactly.',
  SUBSTITUTION_CONSENT: 'If an item is out of stock and the customer asked to be consulted, call offer_substitute then ask_customer and wait for a yes BEFORE adding the substitute or billing.',
  TILL_BALANCED: 'collect_payment must sum to the bill and honour any cash/UPI split the customer asked for.',
  FINALIZED: 'Always finish with generate_bill then collect_payment.',
};
const simulatedRewrite = (failures: FailedRule[]) => {
  const rules = [...new Set(failures.map(f => f.ruleId))];
  return ['You are a careful kirana counter agent.', ...rules.map(r => `- ${FIX_HINTS[r] ?? `Fix ${r}.`}`)].join('\n').slice(0, MAX_SYSTEM);
};

interface Resolved { name: string; model?: string; system: string; scriptedPolicyId?: string; }

function resolveAgent(agentId: string): Resolved {
  const scripted = KIRANA_POLICIES.find(p => p.id === agentId);
  if (scripted) return { name: scripted.name, system: `(scripted policy: ${scripted.name})`, scriptedPolicyId: scripted.id };
  if (!hasLiveKeys()) throw new Error(`no API keys set: only scripted agents (${KIRANA_POLICIES.map(p => p.id).join(', ')}) can be retried`);
  const floor = floorEntries().find(e => e.id === agentId);
  if (floor) {
    if ('url' in floor.config) throw new Error('endpoint (url) agents cannot be rewritten — their instructions live on the builder\'s server');
    return { name: floor.name, model: floor.config.model, system: floor.config.system ?? '' };
  }
  const frontier = frontierLanes().find(l => l.id === agentId);
  if (frontier) return { name: frontier.name, model: frontier.id, system: '' };
  throw new Error(`unknown agent ${agentId}`);
}

export async function retryAgent(
  envFactoryByTaskEnv: EnvFactoryByTask | undefined, failingAgentId: string, envId: string, opts: { seeds?: number } = {},
): Promise<RetryResult> {
  const makeEnv = envFactoryByTaskEnv ?? envFactoryFor;
  const reg = envById(envId);
  if (!reg) throw new Error(`unknown env ${envId}`);
  const seeds = opts.seeds ?? 1;
  const train = reg.tasks.filter(t => t.split === 'TRAIN');
  const hold = reg.tasks.filter(t => t.split === 'HELD_OUT');
  const a = resolveAgent(failingAgentId);
  const candId = `${failingAgentId}~rgr`;
  const simulated = !!a.scriptedPolicyId;
  if (simulated && envId !== 'kirana-v1') throw new Error('simulated retry only exists for kirana-v1');

  // Events go to a private race scope: no /api/run stream ever sees retry traffic.
  return withRace(`retry-${randomUUID()}`, async () => {
    let oldAgentFor: (t: TaskSpec) => RacingAgent;
    let newAgentFor: (t: TaskSpec) => RacingAgent;
    let newSystem: string;
    const allRollouts: Rollout[] = [];
    let errors = 0;

    if (simulated) {
      const policy = KIRANA_POLICIES.find(p => p.id === a.scriptedPolicyId)!;
      const perfect = KIRANA_POLICIES.find(p => p.id === 'ref-perfect')!;
      oldAgentFor = t => scriptedAgent(policy, t);
      newAgentFor = t => scriptedAgent(perfect, t, candId);
      newSystem = '';
    } else {
      const entry = (id: string, system: string): AgentEntry => ({ id, name: a.name, kind: 'floor', config: { model: a.model!, system } });
      oldAgentFor = () => floorAgent(entry(failingAgentId, a.system));
      newAgentFor = () => floorAgent(entry(candId, newSystem));
      newSystem = '';
    }

    // 1) TRAIN: collect named failures
    const tr = await evaluate(makeEnv, train, oldAgentFor, 1);
    allRollouts.push(...tr.rollouts); errors += tr.errors;
    const failedRules = collectFailures(tr.rollouts);

    // 2) ONE rewrite call (or simulated)
    if (!failedRules.length) {
      saveRollouts(allRollouts);
      const holdOnly = await evaluate(makeEnv, hold, oldAgentFor, seeds);
      saveRollouts(holdOnly.rollouts);
      const before = round1(avg([...holdOnly.perTask.values()]));
      return { agentId: failingAgentId, envId, failedRules, beforeHoldAvg: before, afterHoldAvg: before,
        perTask: hold.map(t => ({ taskId: t.id, before: holdOnly.perTask.get(t.id)!, after: holdOnly.perTask.get(t.id)! })),
        promoted: false, diff: { oldSystem: a.system, newSystem: a.system }, seeds, errors: errors + holdOnly.errors,
        ...(simulated ? { simulated: true } : {}) };
    }
    newSystem = simulated ? simulatedRewrite(failedRules) : await rewriteInstructions(a.model!, a.system, failedRules);

    // 3) HELD_OUT before vs after
    const [before, after] = await Promise.all([
      evaluate(makeEnv, hold, oldAgentFor, seeds),
      evaluate(makeEnv, hold, newAgentFor, seeds),
    ]);
    allRollouts.push(...before.rollouts, ...after.rollouts);
    errors += before.errors + after.errors;
    saveRollouts(allRollouts);

    // 4) Gate
    const perTask = hold.map(t => ({ taskId: t.id, before: round1(before.perTask.get(t.id)!), after: round1(after.perTask.get(t.id)!) }));
    const beforeHoldAvg = round1(avg(perTask.map(p => p.before)));
    const afterHoldAvg = round1(avg(perTask.map(p => p.after)));
    const noRegression = perTask.every(p => p.after >= p.before);
    const promoted = afterHoldAvg > beforeHoldAvg && noRegression;

    let promotedAgentId: string | undefined;
    if (promoted && !simulated) {
      promotedAgentId = `${slug(a.name)}-rgr-${rand4()}`;
      saveFloorEntry({ id: promotedAgentId, name: `${a.name} (RGR)`.slice(0, 40), kind: 'floor', config: { model: a.model!, system: newSystem } });
    }

    return {
      agentId: failingAgentId, envId, failedRules, beforeHoldAvg, afterHoldAvg, perTask, promoted,
      ...(promotedAgentId ? { promotedAgentId } : {}),
      diff: { oldSystem: a.system, newSystem }, seeds, errors,
      ...(simulated ? { simulated: true } : {}),
    };
  });
}
