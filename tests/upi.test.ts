import { describe, expect, it } from 'vitest';
import { UPI_CASES } from '../src/envs/upi/cases';
import { UpiEnv } from '../src/envs/upi/env';
import { gradeUpi } from '../src/envs/upi/grader';
import type { CustomerReply, RuleEvidence, Transaction } from '../src/envs/upi/model';
import type { TaskSpec } from '../src/contracts/contract';

function open(task: TaskSpec) {
  const env = new UpiEnv();
  const txnId = /transaction (SIM-\d+)/.exec(env.reset(task).text)![1];
  const call = (name: string, args: Record<string, unknown> = {}) => env.step({ name, args }).text;
  return { env, txnId, call };
}
function investigate(task: TaskSpec) {
  const ticket = open(task);
  const txn: Transaction = JSON.parse(ticket.call('fetch_txn', { txnId: ticket.txnId }));
  const customer: CustomerReply = JSON.parse(ticket.call('ask_customer'));
  const rules: RuleEvidence = JSON.parse(ticket.call('check_fraud_rules'));
  return { ...ticket, txn, customer, rules };
}

describe('UPI dispute desk', () => {
  it('provides four training and two held-out tickets', () => {
    expect(UPI_CASES.map(t => t.split)).toEqual(['TRAIN', 'TRAIN', 'TRAIN', 'TRAIN', 'HELD_OUT', 'HELD_OUT']);
  });
  it.each(UPI_CASES)('a policy using only tool observations resolves $id', task => {
    const { env, call, txn, customer, rules } = investigate(task);
    const balance = txn.amountPaise - txn.reversedPaise;
    if (balance && (!customer.authorized || rules.duplicateDebit))
      call('file_chargeback', { amountPaise: balance });
    else call('release_hold');
    call('close_ticket');
    const expectedClaims: Record<string, number> = { U1: 82500, U2: 23550, U3: 0, U4: 0, UH1: 0, UH2: 32974 };
    const amountPaise = expectedClaims[task.id];
    expect(env.finalState().resolution).toEqual({ action: amountPaise ? 'file_chargeback' : 'release_hold', amountPaise });
    expect(env.grade(task).score).toBe(100);
    expect(gradeUpi(env.finalState())).toEqual(env.grade(task));
  });
  it('penalizes filing on the legitimate replacement-phone payment even when the ticket is closed', () => {
    const task = UPI_CASES[4];
    const { env, call, txn } = investigate(task);
    call('file_chargeback', { amountPaise: txn.amountPaise });
    call('close_ticket');
    const grade = env.grade(task);
    expect(grade.checks.filter(c => !c.passed).map(c => c.ruleId)).toEqual(['RESOLUTION', 'CLAIM_AMOUNT']);
    expect(grade.score).toBe(40);
  });
  it('requires the right transaction and both evidence sources before resolution', () => {
    const { env, call, txnId } = open(UPI_CASES[0]);
    call('fetch_txn', { txnId: 'wrong' });
    call('ask_customer');
    call('close_ticket');
    expect(gradeUpi(env.finalState()).score).toBe(0);
    call('fetch_txn', { txnId });
    call('check_fraud_rules');
    call('release_hold');
    expect(env.finalState().resolution).toBeNull();
  });
  it('rejects invalid paise and overclaims; underclaims lose amount credit', () => {
    const { env, call } = investigate(UPI_CASES[5]);
    for (const amountPaise of [0, -1, '32974', 329.74, Infinity, 32975]) {
      call('file_chargeback', { amountPaise });
      expect(env.finalState().resolution).toBeNull();
    }
    call('file_chargeback', { amountPaise: 32973 });
    call('close_ticket');
    expect(gradeUpi(env.finalState()).checks.filter(c => !c.passed).map(c => c.ruleId)).toEqual(['CLAIM_AMOUNT']);
  });
  it('locks the first resolution and isolates snapshots and subsequent tickets', () => {
    const { env, call } = investigate(UPI_CASES[0]);
    call('file_chargeback', { amountPaise: 82500 });
    call('release_hold');
    call('close_ticket');
    const finished = env.finalState();
    call('file_chargeback', { amountPaise: 450 });
    expect(env.finalState()).toEqual(finished);
    finished.txn!.amountPaise = 1;
    expect(env.finalState().txn!.amountPaise).toBe(82500);
    env.reset(UPI_CASES[1]);
    expect(env.finalState()).toMatchObject({ txn: null, customer: null, rules: null, resolution: null, closed: false });
  });
});
