// Derives a 4-lane demo race from the single checked-in fixture so every
// screen works today with zero backend. The integrator swaps this for SSE.
import type { Rollout, CheckResult } from '../../contracts/contract.js';
import base from '../../../fixtures/sample-rollout.json';

const fixture = base as unknown as Rollout;

function passedVariant(agentId: string, slowdown: number): Rollout {
  const checks: CheckResult[] = fixture.checks.map(c => ({
    ...c, passed: true,
    reason: c.ruleId === 'QTY_PARSE' ? "'dedh kilo' read as 1.5 kg"
      : c.ruleId === 'ARITHMETIC_TOTAL' ? 'Rs 163.00 exact' : c.reason,
  }));
  return {
    ...fixture, agentId,
    runId: fixture.runId + '-' + agentId,
    shareId: agentId + 'fx',
    score: 100,
    finalClaimText: 'Bill Rs 163.00. Dedh kilo tamatar aur ek chai, ho gaya.',
    steps: fixture.steps.map(s => ({
      ...s,
      latencyMs: Math.round(s.latencyMs * slowdown),
      call: s.call.name === 'add_to_cart' && (s.call.args as { skuId?: string }).skuId === 'tmt'
        ? { ...s.call, args: { ...s.call.args, qty: 1.5 } }
        : s.call,
      obs: s.obs.replace('2 kg', '1.5 kg').replace('189.00', '163.00'),
    })),
    checks,
  };
}

export const DEMO_TASK = {
  id: 'H1', envId: 'kirana-v1' as const, split: 'HELD_OUT' as const,
  title: 'dedh kilo trap',
  prompt: 'dedh kilo tamatar aur ek Red Label chai dena',
  contributor: undefined as string | undefined,
};

export const DEMO_LANES: Rollout[] = [
  passedVariant('scripted-ref', 1.15),
  { ...fixture, agentId: 'scripted-confuser', runId: fixture.runId + '-gpt', shareId: 'gptfx' },
  passedVariant('scripted-ref2', 1.6),
  {
    ...fixture, agentId: 'scripted-confuser2', runId: fixture.runId + '-gemini', shareId: 'gemfx',
    steps: fixture.steps.map(s => ({ ...s, latencyMs: Math.round(s.latencyMs * 0.8) })),
  },
];

export const LANE_LABELS: Record<string, string> = {
  'scripted-ref': 'Perfect Clerk (scripted demo)', 'scripted-confuser': 'Careless Clerk (scripted demo)',
  'scripted-ref2': 'Careful Clerk (scripted demo)', 'scripted-confuser2': 'Hasty Clerk (scripted demo)',
  claude: 'claude-sonnet-4-5 \u00b7 Anthropic', gpt: 'gpt-5.4 \u00b7 OpenAI', gemini: 'gemini-2.5-pro \u00b7 Google',
  sarvam: 'sarvam-105b \u00b7 Sarvam', fireworks: 'kimi-k3 \u00b7 Fireworks',
};

export interface LeaderRow { agentId: string; kind: 'frontier' | 'floor'; avg: number; runs: number; }
export const DEMO_LEADERBOARD: LeaderRow[] = [
  { agentId: 'scripted-ref', kind: 'frontier', avg: 97.2, runs: 11 },
  { agentId: 'scripted-ref2', kind: 'frontier', avg: 93.8, runs: 11 },
  { agentId: 'scripted-confuser2', kind: 'frontier', avg: 88.1, runs: 11 },
  { agentId: 'scripted-confuser', kind: 'frontier', avg: 84.5, runs: 11 },
  { agentId: 'Builder #47 - SupportBot', kind: 'floor', avg: 61.0, runs: 3 },
];
