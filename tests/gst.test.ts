import { describe, expect, it } from 'vitest';
import { GST_CASES } from '../src/envs/gst/cases';
import { GstEnv, checksum } from '../src/envs/gst/env';
import type { TaskSpec } from '../src/contracts/contract';

function run(task: TaskSpec, alwaysLocal = false) {
  const env = new GstEnv();
  const { text } = env.reset(task);
  const gstin = /GSTIN (\w{15})/.exec(text)![1];
  const validation = env.step({ name: 'validate_gstin', args: { gstin } });
  if (validation.text.startsWith('REJECTED')) return env;
  for (const [, desc, value, slab] of text.matchAll(/^(.+) — Rs (\d+\.\d+) before tax, (\d+)% GST\.$/gm)) {
    env.step({ name: 'add_invoice_row', args: { desc, valueRs: Number(value), slab: Number(slab),
      taxType: alwaysLocal || text.includes('Place of supply: Bengaluru') ? 'CGST_SGST' : 'IGST' } });
  }
  env.step({ name: 'offset_itc', args: { itcRs: Number(/Offset Rs ([\d.]+)/.exec(text)![1]) } });
  env.step({ name: 'submit_gstr1', args: {} });
  return env;
}
describe('GST portal', () => {
  it('reproduces the known GSTIN check digit', () => {
    expect(checksum('27AAPFU0939F1Z')).toBe('V');
  });
  it.each(GST_CASES)('passes the reference policy on $id', task => {
    const env = run(task);
    expect(env.grade(task).score).toBe(100);
    expect(env.finalState().status).toBe(task.id === 'GH1' ? 'REJECTED' : 'FILED');
  });
  it('isolates the interstate error', () => {
    const task = GST_CASES[1];
    const grade = run(task, true).grade(task);
    expect(grade.score).toBe(80);
    expect(grade.checks.filter(c => !c.passed).map(c => c.ruleId)).toEqual(['TAX_SPLIT']);
  });
  it('rejects an empty return even if the supplier is valid', () => {
    const env = new GstEnv();
    env.reset(GST_CASES[0]);
    env.step({ name: 'validate_gstin', args: { gstin: GST_CASES[0].expected.gstin } });
    env.step({ name: 'submit_gstr1', args: {} });
    expect(env.finalState()).toMatchObject({ status: 'REJECTED', reason: expect.stringContaining('no invoice rows') });
  });
  it('preserves odd paise, rejects excess credit, and freezes the rejected return', () => {
    const env = new GstEnv();
    env.reset(GST_CASES[3]);
    env.step({ name: 'validate_gstin', args: { gstin: GST_CASES[3].expected.gstin } });
    env.step({ name: 'add_invoice_row', args: { desc: 'Reduced-rate line', valueRs: 100.20, slab: 5, taxType: 'CGST_SGST' } });
    expect(env.finalState().rows[0]).toMatchObject({ cgstPaise: 250, sgstPaise: 251 });
    env.step({ name: 'offset_itc', args: { itcRs: 5.02 } });
    env.step({ name: 'submit_gstr1', args: {} });
    const final = env.finalState();
    expect(final).toMatchObject({ status: 'REJECTED', reason: expect.stringContaining('exceeds') });
    env.step({ name: 'offset_itc', args: { itcRs: 0 } });
    expect(env.finalState()).toEqual(final);
  });
});
