import type { CheckResult, Grade } from '../../contracts/contract';
import type { UpiState } from './model';

export function gradeUpi(s: UpiState): Grade {
  const checks: CheckResult[] = [];
  function check(ruleId: string, label: string, weight: number, passed: boolean, yes: string, no: string) {
    checks.push({ ruleId, label, weight, passed, reason: passed ? yes : no });
  }
  const fetched = s.txn !== null && s.txn.txnId === s.ticketTxnId;
  const evidence = fetched && s.customer !== null && s.rules !== null;
  const balance = s.txn ? s.txn.amountPaise - s.txn.reversedPaise : 0;
  const claimDue = balance > 0 && (s.customer?.authorized === false || s.rules?.duplicateDebit === true);
  const action = claimDue ? 'file_chargeback' : 'release_hold';
  const amount = claimDue ? balance : 0;
  check('TXN_MATCH', 'Ticket transaction', 1, fetched, 'The ledger entry matches this ticket.', 'Fetch the ticket transaction.');
  check('CUSTOMER_EVIDENCE', 'Customer authorization', 1, s.customer !== null,
    'The customer answered the authorization question.', 'The customer response is missing.');
  check('RULE_EVIDENCE', 'Fraud-rule evidence', 1, s.rules !== null,
    'The rule results were collected.', 'The rule results are missing.');
  check('RESOLUTION', 'Dispute decision', 4, evidence && s.resolution?.action === action,
    'The decision follows the ledger and customer evidence.', evidence ? 'The desk policy requires ' + action + '.' : 'Evidence is incomplete.');
  check('CLAIM_AMOUNT', 'Chargeback amount', 2, evidence && s.resolution?.amountPaise === amount,
    'The recorded claim matches the disputed balance.', evidence ? 'The correct claim is ' + amount + ' paise.' : 'Evidence is incomplete.');
  check('CLOSED', 'Ticket closed', 1, s.closed && s.resolution !== null,
    'The resolved ticket was closed.', 'The ticket still needs a resolution and closure.');
  return { checks, score: checks.reduce((n, c) => n + (c.passed ? c.weight * 10 : 0), 0) };
}
