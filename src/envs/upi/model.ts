export type Transaction = {
  txnId: string;
  merchant: string;
  amountPaise: number;
  reversedPaise: number;
};

export type CustomerReply = { authorized: boolean; reply: string };
export type RuleEvidence = { duplicateDebit: boolean; newDevice: boolean };
export type UpiCase = { txn: Transaction; customer: CustomerReply; rules: RuleEvidence };

export type Resolution =
  | { action: 'file_chargeback'; amountPaise: number }
  | { action: 'release_hold'; amountPaise: 0 };

// Only evidence actually collected by the agent is included in a rollout.
export type UpiState = {
  ticketTxnId: string;
  txn: Transaction | null;
  customer: CustomerReply | null;
  rules: RuleEvidence | null;
  resolution: Resolution | null;
  closed: boolean;
};
