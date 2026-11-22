import type { TaskSpec } from '../../contracts/contract';
import type { UpiCase } from './model';

function ticket(id: string, split: TaskSpec['split'], title: string, complaint: string, evidence: UpiCase): TaskSpec {
  return { id, envId: 'upi-dispute-v1', split, title, expected: evidence,
    prompt: [
      'Simulated UPI dispute desk. Investigate transaction ' + evidence.txn.txnId + '.',
      'Opening complaint: ' + complaint,
      'Read the ledger, ask the customer, and run the fraud rules before resolving the ticket.',
      'Desk policy: file for the entire unreversed debit if the customer denies authorization or the ledger confirms a duplicate.',
      'Otherwise release the dispute hold. If the debit was already fully reversed, release the hold.',
      'A new-device alert alone is insufficient. Choose one action, then close the ticket. Use integer paise.',
    ].join('\n') };
}

// Fictional case records. On duplicate cases the ticket identifies the extra debit.
export const UPI_CASES: TaskSpec[] = [
  ticket('U1', 'TRAIN', 'Late-night debit', 'I saw a debit after the shop closed.', {
    txn: { txnId: 'SIM-3101', merchant: 'Market Lane', amountPaise: 82500, reversedPaise: 0 },
    customer: { authorized: false, reply: 'I did not make or authorize this payment.' },
    rules: { duplicateDebit: false, newDevice: true },
  }),
  ticket('U2', 'TRAIN', 'Two receipts', 'The merchant got two successful payment messages.', {
    txn: { txnId: 'SIM-3102', merchant: 'Corner Cafe', amountPaise: 23550, reversedPaise: 0 },
    customer: { authorized: true, reply: 'I approved the purchase once. This ticket is for the second debit.' },
    rules: { duplicateDebit: true, newDevice: false },
  }),
  ticket('U3', 'TRAIN', 'Merchant name query', 'The name on my statement looks unfamiliar.', {
    txn: { txnId: 'SIM-3103', merchant: 'Kaveri Retail', amountPaise: 45900, reversedPaise: 0 },
    customer: { authorized: true, reply: 'That is the shop on my receipt. I approved this payment.' },
    rules: { duplicateDebit: false, newDevice: false },
  }),
  ticket('U4', 'TRAIN', 'Reversal follow-up', 'Please check my reported payment again.', {
    txn: { txnId: 'SIM-3104', merchant: 'City Stores', amountPaise: 66000, reversedPaise: 66000 },
    customer: { authorized: false, reply: 'I did not authorize the debit. Has the reversal arrived?' },
    rules: { duplicateDebit: false, newDevice: true },
  }),
  ticket('UH1', 'HELD_OUT', 'Device alert', 'A device alert appeared with my evening payment.', {
    txn: { txnId: 'SIM-4801', merchant: 'Market Lane', amountPaise: 82500, reversedPaise: 0 },
    customer: { authorized: true, reply: 'I paid the merchant myself using my replacement phone.' },
    rules: { duplicateDebit: false, newDevice: true },
  }),
  ticket('UH2', 'HELD_OUT', 'Adjusted debit', 'Only part of the disputed debit came back.', {
    txn: { txnId: 'SIM-4802', merchant: 'Station Cafe', amountPaise: 47999, reversedPaise: 15025 },
    customer: { authorized: true, reply: 'I authorized one purchase. The second debit is the one I reported.' },
    rules: { duplicateDebit: true, newDevice: false },
  }),
];
