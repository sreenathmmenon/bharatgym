// kirana-v1 grader — pure function of final state + task.expected. Never reads model text.
import type { TaskSpec, Grade, CheckResult } from '../../contracts/contract.js';
import { toRs } from '../../contracts/contract.js';
import type { KiranaState } from './env.js';

export interface KiranaExpected {
  cart: { skuId: string; qty: number }[];
  totalPaise: number;
  requiresConsentFor?: string;                       // sku that needs customer consent BEFORE billing
  payment?: { cashPaise: number; upiPaise: number }; // exact split, when the order demands one
  qtyWord?: string;                                  // e.g. "dedh kilo" — used only for reason strings
}

export function gradeKirana(s: KiranaState, task: TaskSpec): Grade {
  const exp = task.expected as unknown as KiranaExpected;
  const checks: CheckResult[] = [];
  const push = (ruleId: string, label: string, passed: boolean, reason: string, weight: number) =>
    checks.push({ ruleId, label, passed, reason, weight });

  // Aggregate cart by sku
  const got = new Map<string, number>();
  for (const line of s.cart) got.set(line.skuId, (got.get(line.skuId) ?? 0) + line.qty);
  const want = new Map(exp.cart.map(l => [l.skuId, l.qty]));

  // ITEM_MATCH — every ordered item present
  const missing = [...want.keys()].filter(sku => !got.has(sku));
  push('ITEM_MATCH', 'All ordered items in cart', missing.length === 0,
    missing.length === 0 ? 'every ordered item present' : `missing item(s): ${missing.join(', ')}`, 2);

  // QTY_PARSE — quantities exact (unit words like dedh/sawa/dozen resolved right)
  const wrongQty = [...want.entries()].find(([sku, q]) => got.has(sku) && Math.abs(got.get(sku)! - q) > 1e-9);
  const qtyOk = missing.length === 0 && !wrongQty;
  push('QTY_PARSE', 'Quantities correct (dedh / sawa / dozen / grams)', qtyOk,
    qtyOk ? 'quantities match the order'
      : wrongQty
        ? `${exp.qtyWord ? `'${exp.qtyWord}'` : wrongQty[0]} billed as ${got.get(wrongQty[0])} instead of ${wrongQty[1]}`
        : 'ordered item missing from cart', 2);

  // NO_HALLUCINATION — nothing in the cart that was not ordered
  const extras = [...got.keys()].filter(sku => !want.has(sku));
  push('NO_HALLUCINATION', 'No invented items', extras.length === 0,
    extras.length === 0 ? 'cart clean' : `extra item(s) nobody ordered: ${extras.join(', ')}`, 1);

  // ARITHMETIC_TOTAL — billed total exact
  const billOk = s.billedPaise === exp.totalPaise;
  push('ARITHMETIC_TOTAL', 'Bill total exact', billOk,
    billOk ? `Rs ${toRs(exp.totalPaise)} correct`
      : s.billedPaise == null ? 'no bill was generated'
        : `billed Rs ${toRs(s.billedPaise)}, correct is Rs ${toRs(exp.totalPaise)}`, 2);

  // SUBSTITUTION_CONSENT — only when the order demands asking first
  if (exp.requiresConsentFor) {
    const consent = s.consentEvents.find(e => e.forSku === exp.requiresConsentFor);
    const ok = !!consent && s.billEvent != null && consent.atEvent < s.billEvent && got.has(exp.requiresConsentFor);
    push('SUBSTITUTION_CONSENT', 'Customer approved the substitute before billing', ok,
      ok ? 'consent came before checkout'
        : !consent ? 'substituted without any customer consent'
          : s.billEvent == null ? 'consent given but the sale was never billed'
            : 'consent came after the bill was made', 2);
  }

  // TILL_BALANCED — payment equals bill (and matches a demanded split)
  const paid = s.paidCashPaise + s.paidUpiPaise;
  let tillOk: boolean;
  let tillReason: string;
  if (exp.payment) {
    tillOk = s.paidCashPaise === exp.payment.cashPaise && s.paidUpiPaise === exp.payment.upiPaise && paid === (s.billedPaise ?? -1);
    tillReason = tillOk ? 'cash + UPI split honoured, till balanced'
      : `asked cash Rs ${toRs(exp.payment.cashPaise)} + UPI Rs ${toRs(exp.payment.upiPaise)}, got cash Rs ${toRs(s.paidCashPaise)} + UPI Rs ${toRs(s.paidUpiPaise)}`;
  } else {
    tillOk = s.finalized && paid === (s.billedPaise ?? -1);
    tillReason = tillOk ? 'till balanced' : 'payment does not equal the bill';
  }
  push('TILL_BALANCED', 'Payment equals the bill', tillOk, tillReason, 1);

  // FINALIZED
  push('FINALIZED', 'Payment collected', s.finalized, s.finalized ? 'done' : 'episode ended with an open cart', 1);

  const totalW = checks.reduce((a, c) => a + c.weight, 0);
  const gotW = checks.filter(c => c.passed).reduce((a, c) => a + c.weight, 0);
  return { score: Math.round((gotW / totalW) * 100), checks };
}
