import type { BharatEnv, Observation, TaskSpec, ToolCall, ToolDef } from '../../contracts/contract';
import { gradeUpi } from './grader';
import type { UpiCase, UpiState } from './model';

function tool(name: string, description: string, properties: Record<string, unknown> = {}): ToolDef {
  return { name, description, parameters: { type: 'object', properties,
    required: Object.keys(properties), additionalProperties: false } };
}

export class UpiEnv implements BharatEnv {
  id = 'upi-dispute-v1' as const;
  tools = [
    tool('fetch_txn', 'Look up the ticket transaction in the simulated ledger.', { txnId: { type: 'string' } }),
    tool('ask_customer', 'Ask the customer whether they authorized the identified purchase.'),
    tool('check_fraud_rules', 'Read duplicate-debit and new-device flags for this transaction.'),
    tool('file_chargeback', 'File a single claim for the disputed amount in integer paise.',
      { amountPaise: { type: 'integer', minimum: 1 } }),
    tool('release_hold', 'Release the dispute hold without filing a claim.'),
    tool('close_ticket', 'Close the ticket after recording a resolution.'),
  ];
  private evidence!: UpiCase;
  private state!: UpiState;

  reset(task: TaskSpec): Observation {
    if (task.envId !== this.id) throw new Error('Expected a UPI dispute task.');
    this.evidence = structuredClone(task.expected) as UpiCase;
    this.state = { ticketTxnId: this.evidence.txn.txnId, txn: null, customer: null,
      rules: null, resolution: null, closed: false };
    return { text: task.prompt };
  }
  finalState() { return structuredClone(this.state); }
  grade(_task: TaskSpec) { return gradeUpi(this.state); }

  step({ name, args }: ToolCall): Observation {
    const s = this.state;
    if (s.closed) return { text: 'Ticket already closed.' };
    if (name === 'close_ticket') {
      if (!s.resolution) return { text: 'Record a resolution before closing this ticket.' };
      s.closed = true;
      return { text: 'Ticket closed.' };
    }
    if (s.resolution) return { text: 'Resolution already recorded. Close the ticket.' };
    if (name === 'fetch_txn') {
      if (args.txnId !== s.ticketTxnId) return { text: 'Transaction does not match this ticket.' };
      s.txn = this.evidence.txn;
      return { text: JSON.stringify(s.txn) };
    }
    if (!s.txn) return { text: 'Fetch the transaction printed on this ticket first.' };
    switch (name) {
      case 'ask_customer':
        s.customer = this.evidence.customer;
        return { text: JSON.stringify(s.customer) };
      case 'check_fraud_rules':
        s.rules = this.evidence.rules;
        return { text: JSON.stringify(s.rules) };
      case 'release_hold':
      case 'file_chargeback': {
        if (!s.customer || !s.rules) return { text: 'Collect the customer response and fraud-rule evidence first.' };
        if (name === 'release_hold') {
          s.resolution = { action: name, amountPaise: 0 };
          return { text: 'Dispute hold released.' };
        }
        const amount = args.amountPaise;
        if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0 ||
          amount > s.txn.amountPaise - s.txn.reversedPaise)
          return { text: 'Claim must be positive whole paise within the unreversed debit.' };
        s.resolution = { action: name, amountPaise: amount };
        return { text: 'Chargeback filed for ' + amount + ' paise.' };
      }
      default: return { text: 'Unknown UPI dispute tool.' };
    }
  }
}
