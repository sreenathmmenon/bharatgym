import type { CheckResult, Grade } from '../../contracts/contract';
import { rowTax, validGstin, type GstState } from './model';

export function gradeGst(state: GstState): Grade {
  const { invoice, rows, validated, status, itcPaise } = state;
  const valid = validGstin(invoice.gstin);
  const checked = validated?.gstin === invoice.gstin && validated.valid === valid;
  const stopped = checked && status === 'REJECTED' && rows.length === 0 && itcPaise === 0;
  const wantedType = invoice.supplierState === invoice.supplyState ? 'CGST_SGST' : 'IGST';
  const checks: CheckResult[] = [];
  function check(ruleId: string, label: string, weight: number, ok: boolean, yes: string, no: string) {
    checks.push({ ruleId, label, weight, passed: ok, reason: ok ? yes : no });
  }
  check('GSTIN_CHECKSUM', 'Supplier GSTIN', 2, checked,
    valid ? 'The supplied GSTIN passed its check digit.' : 'The supplied GSTIN was identified as invalid.',
    'The supplied GSTIN did not receive the correct validation result.');
  // Match each expected line once, regardless of entry order. Duplicate lines cannot earn extra credit.
  const remaining = [...rows];
  const matched = invoice.invoices.map(line => {
    const i = remaining.findIndex(r => r.desc === line.desc && r.valuePaise === line.valuePaise);
    return i < 0 ? undefined : remaining.splice(i, 1)[0];
  });
  const complete = matched.every(Boolean) && remaining.length === 0;
  const emptyReason = 'The invalid GSTIN was caught before any rows or credit were posted.';
  check('ROWS', 'Invoice rows', 1, valid ? complete : stopped, valid ? 'All invoice lines and values match.' : emptyReason,
    valid ? 'An invoice line is missing, duplicated, or has the wrong value.' : 'The invalid invoice must be stopped before entry.');
  check('TAX_SPLIT', 'Place of supply', 2, valid ? rows.length > 0 && rows.every(r => {
    const tax = rowTax(r);
    return r.taxType === wantedType && (wantedType === 'IGST' ? r.igstPaise === tax
      : r.igstPaise === 0 && r.cgstPaise === Math.floor(tax / 2) && r.sgstPaise === tax - r.cgstPaise);
  }) : stopped, valid ? 'Each line uses the tax split for its place of supply.' : emptyReason,
    valid ? 'This invoice requires ' + wantedType + ' for its place of supply.' : 'There should be no tax posting.');
  check('SLAB_MATH', 'Slabs and tax amounts', 2, valid ? complete && invoice.invoices.every((line, i) =>
    matched[i]?.slab === line.slab && rowTax(matched[i]!) === Math.round(line.valuePaise * line.slab / 100)) : stopped,
    valid ? 'Each slab and its rounded tax amount match the invoice.' : emptyReason, 'The submitted tax lines do not match the expected slab amounts.');
  check('ITC_OK', 'Input tax credit', 1, valid ? itcPaise === invoice.itcPaise && itcPaise >= 0 &&
    itcPaise <= rows.reduce((n, r) => n + rowTax(r), 0) : stopped, valid ? 'The requested credit fits within total tax.' : emptyReason,
    'Credit must match the permitted amount for this invoice.');
  check('STATUS', 'Filing status', 2, valid ? status === 'FILED' : stopped,
    valid ? 'The portal accepted the return.' : 'The portal stopped the invalid filing.',
    valid ? 'The portal has not accepted the return.' : 'The invalid supplier must be detected and filing stopped.');
  return { checks, score: checks.reduce((n, c) => n + (c.passed ? c.weight * 10 : 0), 0) };
}
