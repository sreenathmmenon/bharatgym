// Grader acceptance tests for kirana-v1.
import { describe, it, expect } from 'vitest';
import type { TaskSpec, Grade } from '../src/contracts/contract.js';
import { KiranaEnv } from '../src/envs/kirana/env.js';
import { KIRANA_TASKS } from '../src/envs/kirana/cases.js';
import { KIRANA_POLICIES, ScriptedPolicy } from '../src/envs/kirana/policies.js';

const policy = (id: string): ScriptedPolicy => KIRANA_POLICIES.find(p => p.id === id)!;
const task = (id: string): TaskSpec => KIRANA_TASKS.find(t => t.id === id)!;

function run(p: ScriptedPolicy, t: TaskSpec): Grade {
  const env = new KiranaEnv();
  env.reset(t);
  const { calls } = p.plan(t);
  for (const c of calls) env.step(c);
  return env.grade(t);
}

const failed = (g: Grade) => g.checks.filter(c => !c.passed).map(c => c.ruleId);
const check = (g: Grade, ruleId: string) => g.checks.find(c => c.ruleId === ruleId);

describe('kirana-v1 grader acceptance', () => {
  it('ref-perfect scores 100 on every task, TRAIN and HELD_OUT', () => {
    for (const t of KIRANA_TASKS) {
      const g = run(policy('ref-perfect'), t);
      expect(g.score, `${t.id} failed: ${JSON.stringify(failed(g))}`).toBe(100);
    }
  });

  it('unit-confuser fails QTY_PARSE and ARITHMETIC_TOTAL on H1 (dedh kilo)', () => {
    const g = run(policy('unit-confuser'), task('H1'));
    expect(check(g, 'QTY_PARSE')!.passed).toBe(false);
    expect(check(g, 'ARITHMETIC_TOTAL')!.passed).toBe(false);
    expect(g.score).toBeLessThan(100);
    // reason string carries the trap word for the Confident Lie strip
    expect(check(g, 'QTY_PARSE')!.reason).toContain('dedh kilo');
  });

  it('unit-confuser passes H2 (integer quantities only)', () => {
    const g = run(policy('unit-confuser'), task('H2'));
    expect(g.score, JSON.stringify(failed(g))).toBe(100);
  });

  it('consent-skipper fails ONLY SUBSTITUTION_CONSENT on K8 and H6', () => {
    for (const id of ['K8', 'H6']) {
      const g = run(policy('consent-skipper'), task(id));
      expect(failed(g), id).toEqual(['SUBSTITUTION_CONSENT']);
      expect(check(g, 'ARITHMETIC_TOTAL')!.passed, id).toBe(true); // the twin receipts share the same Rs 25 total
    }
  });

  it('consent-skipper scores 100 on K9 (pre-approved substitution must pass)', () => {
    const g = run(policy('consent-skipper'), task('K9'));
    expect(g.score, JSON.stringify(failed(g))).toBe(100);
  });

  it('twin receipts: identical totals, different verdicts', () => {
    const a = run(policy('consent-skipper'), task('K8'));
    const b = run(policy('consent-skipper'), task('K9'));
    expect(check(a, 'ARITHMETIC_TOTAL')!.passed && check(b, 'ARITHMETIC_TOTAL')!.passed).toBe(true);
    expect(a.score).toBeLessThan(100);
    expect(b.score).toBe(100);
  });

  it('K10 split payment: wrong split fails TILL_BALANCED even when the amount is right', () => {
    // consent-skipper honours the split (plan uses expected.payment) so use unit-confuser,
    // which pays everything by UPI: amount equals ITS bill but violates the demanded split.
    const g = run(policy('unit-confuser'), task('K10'));
    expect(check(g, 'TILL_BALANCED')!.passed).toBe(false);
  });
});
