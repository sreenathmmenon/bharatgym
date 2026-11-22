// kirana-v1 — Hinglish kirana counter. The env does NO language parsing:
// the agent reads the prompt and calls tools; the grader compares final state to expected.
import type { BharatEnv, TaskSpec, Observation, ToolCall } from '../../contracts/contract.js';
import { paise, toRs } from '../../contracts/contract.js';
import { gradeKirana } from './grader.js';

export interface Sku {
  id: string;
  names: string[];
  unit: 'kg' | 'packet' | 'pack' | 'piece' | 'bottle' | 'bar';
  pricePaise: number;
  stock: number;
  barcode?: string;   // real EAN from PackSense India (Open Food Facts, ODbL) where known
}

export const INVENTORY: Sku[] = [
  { id: 'pyz',  names: ['pyaaz', 'onion'],                         unit: 'kg',     pricePaise: paise(38),  stock: 50 },
  { id: 'tmt',  names: ['tamatar', 'tomato'],                      unit: 'kg',     pricePaise: paise(52),  stock: 40 },
  { id: 'alo',  names: ['aloo', 'potato'],                         unit: 'kg',     pricePaise: paise(30),  stock: 60 },
  { id: 'chn',  names: ['chini', 'sugar'],                         unit: 'kg',     pricePaise: paise(46),  stock: 30 },
  { id: 'atta', names: ['aashirvaad atta 5kg', 'atta pack', 'atta'], unit: 'pack', pricePaise: paise(265), stock: 10 },
  { id: 'rice', names: ['sona masoori', 'chawal', 'rice'],         unit: 'kg',     pricePaise: paise(68),  stock: 80 },
  { id: 'toor', names: ['toor dal', 'dal'],                        unit: 'kg',     pricePaise: paise(155), stock: 25 },
  { id: 'amtz', names: ['amul taaza 500ml', 'amul taaza', 'amul doodh'], unit: 'packet', pricePaise: paise(29), stock: 0 },
  { id: 'ambu', names: ['amul butter 100g', 'amul butter'],        unit: 'pack',   pricePaise: paise(62),  stock: 12 },
  { id: 'mgi',  names: ['maggi'],                                  unit: 'packet', pricePaise: paise(15),  stock: 100 },
  { id: 'plg',  names: ['parle-g', 'parle g'],                     unit: 'packet', pricePaise: paise(10),  stock: 200 },
  // Real packaged-goods identities from PackSense India (25,209 records derived from
  // Open Food Facts, ODbL). Catalog carries no retail prices; prices below are ours.
  { id: 'plg70',  names: ['parle-g 70g', 'parle g 70 gram', 'parle-g chota packet'], unit: 'packet', pricePaise: paise(8),  stock: 24, barcode: '8901719104640' },
  { id: 'plg100', names: ['parle-g 100g', 'parle g 100 gram', 'parle-g sau gram'],   unit: 'packet', pricePaise: paise(12), stock: 18, barcode: '8901719128462' },
  { id: 'salt', names: ['tata salt', 'namak'],                     unit: 'pack',   pricePaise: paise(30),  stock: 40 },
  { id: 'oil',  names: ['fortune oil 1l', 'fortune sunflower oil', 'fortune oil'], unit: 'bottle', pricePaise: paise(142), stock: 15 },
  { id: 'anda', names: ['anda', 'egg'],                            unit: 'piece',  pricePaise: paise(7),   stock: 300 },
  { id: 'milk', names: ['nandini doodh 500ml', 'nandini doodh', 'nandini milk', 'doodh'], unit: 'packet', pricePaise: paise(25), stock: 60 },
  { id: 'chai', names: ['red label chai 250g', 'red label', 'chai'], unit: 'pack', pricePaise: paise(85),  stock: 20 },
  { id: 'hldi', names: ['haldi powder 100g', 'haldi'],             unit: 'pack',   pricePaise: paise(38),  stock: 30 },
  { id: 'mrch', names: ['mirchi powder 100g', 'mirchi'],           unit: 'pack',   pricePaise: paise(45),  stock: 30 },
  { id: 'clg',  names: ['colgate 100g', 'colgate'],                unit: 'pack',   pricePaise: paise(58),  stock: 25 },
  { id: 'soap', names: ['lifebuoy soap', 'lifebuoy'],              unit: 'bar',    pricePaise: paise(32),  stock: 50 },
];

export interface CartLine { skuId: string; qty: number; unit: string; }
export interface ConsentEvent { forSku: string; atEvent: number; }
export interface KiranaState {
  cart: CartLine[];
  consentEvents: ConsentEvent[];
  offeredSubs: string[];
  eventSeq: number;
  billedPaise: number | null;
  billEvent: number | null;
  paidCashPaise: number;
  paidUpiPaise: number;
  customerTurnIdx: number;
  finalized: boolean;
}

export interface CustomerTurn { reply: string; grantsConsentFor?: string; }

export class KiranaEnv implements BharatEnv {
  id = 'kirana-v1' as const;
  private s!: KiranaState;
  private task!: TaskSpec;
  private inv!: Map<string, Sku>;

  tools = [
    { name: 'search_inventory', description: 'Search items by name (Hindi or English). Returns id, unit, price, stock.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
    { name: 'add_to_cart', description: 'Add a quantity of a sku to the cart. unit must match the sku unit; non-kg quantities must be whole numbers.',
      parameters: { type: 'object', properties: { skuId: { type: 'string' }, qty: { type: 'number' }, unit: { type: 'string' } }, required: ['skuId', 'qty', 'unit'] } },
    { name: 'offer_substitute', description: 'Propose a substitute sku for an out-of-stock item. The customer has to agree via ask_customer.',
      parameters: { type: 'object', properties: { forSkuId: { type: 'string' }, substituteSkuId: { type: 'string' } }, required: ['forSkuId', 'substituteSkuId'] } },
    { name: 'ask_customer', description: 'Ask the customer a question. Only the customer can grant consent.',
      parameters: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] } },
    { name: 'generate_bill', description: 'Compute and present the bill for the current cart.',
      parameters: { type: 'object', properties: {}, required: [] } },
    { name: 'collect_payment', description: 'Collect payment. cashRs + upiRs must equal the bill.',
      parameters: { type: 'object', properties: { cashRs: { type: 'number' }, upiRs: { type: 'number' } }, required: ['cashRs', 'upiRs'] } },
  ];

  reset(task: TaskSpec): Observation {
    this.task = task;
    this.inv = new Map(INVENTORY.map(s => [s.id, { ...s, names: [...s.names] }])); // deep copy per episode
    const overrides = (task.expected.stockOverride ?? {}) as Record<string, number>;
    for (const [id, stock] of Object.entries(overrides)) {
      const sku = this.inv.get(id);
      if (sku) sku.stock = stock;
    }
    this.s = {
      cart: [], consentEvents: [], offeredSubs: [], eventSeq: 0,
      billedPaise: null, billEvent: null,
      paidCashPaise: 0, paidUpiPaise: 0,
      customerTurnIdx: 0, finalized: false,
    };
    return { text: `CUSTOMER: "${task.prompt}"\nYou are the counter agent. Serve exactly this order, then bill and collect payment.` };
  }

  step(call: ToolCall): Observation {
    const s = this.s;
    s.eventSeq++;
    switch (call.name) {
      case 'search_inventory': {
        const q = String(call.args.query ?? '').toLowerCase().trim();
        const hits = [...this.inv.values()]
          .filter(it => it.names.some(n => n.includes(q) || q.includes(n)))
          .slice(0, 5);
        if (!hits.length) return { text: 'No items found.' };
        return { text: hits.map(h => `${h.id}: ${h.names[0]} - Rs ${toRs(h.pricePaise)}/${h.unit} - stock ${h.stock}${h.barcode ? ` - barcode ${h.barcode}` : ''}`).join('\n') };
      }
      case 'add_to_cart': {
        const sku = this.inv.get(String(call.args.skuId));
        if (!sku) return { text: `ERROR: unknown sku ${String(call.args.skuId)}` };
        const qty = Number(call.args.qty);
        const unit = String(call.args.unit);
        if (!Number.isFinite(qty) || qty <= 0) return { text: 'ERROR: qty must be a positive number.' };
        if (unit !== sku.unit) return { text: `ERROR: ${sku.id} is sold per ${sku.unit}, not ${unit}.` };
        if (sku.unit !== 'kg' && !Number.isInteger(qty)) return { text: `ERROR: ${sku.unit} quantity must be a whole number.` };
        if (sku.stock <= 0) return { text: `OUT OF STOCK: ${sku.names[0]}. Consider offer_substitute and ask_customer.` };
        s.cart.push({ skuId: sku.id, qty, unit });
        return { text: `Added ${qty} ${unit} of ${sku.names[0]}. Cart lines: ${s.cart.length}` };
      }
      case 'offer_substitute': {
        s.offeredSubs.push(String(call.args.substituteSkuId));
        return { text: `You proposed ${String(call.args.substituteSkuId)} in place of ${String(call.args.forSkuId)}. The customer has NOT yet agreed.` };
      }
      case 'ask_customer': {
        const script = (this.task.expected.customerScript ?? []) as CustomerTurn[];
        const turn = script[s.customerTurnIdx];
        if (!turn) return { text: 'CUSTOMER: (says nothing)' };
        s.customerTurnIdx++;
        if (turn.grantsConsentFor && s.offeredSubs.includes(turn.grantsConsentFor)) s.consentEvents.push({ forSku: turn.grantsConsentFor, atEvent: s.eventSeq });
        return { text: `CUSTOMER: "${turn.reply}"` };
      }
      case 'generate_bill': {
        let total = 0;
        for (const line of s.cart) {
          const sku = this.inv.get(line.skuId)!;
          total += Math.round(sku.pricePaise * line.qty);
        }
        s.billedPaise = total;
        s.billEvent = s.eventSeq;
        return { text: `BILL: Rs ${toRs(total)} for ${s.cart.length} line(s).` };
      }
      case 'collect_payment': {
        if (s.billedPaise == null) return { text: 'ERROR: generate_bill first.' };
        s.paidCashPaise = Math.round(Number(call.args.cashRs) * 100);
        s.paidUpiPaise = Math.round(Number(call.args.upiRs) * 100);
        s.finalized = true;
        return { text: `Payment recorded: cash Rs ${toRs(s.paidCashPaise)} + UPI Rs ${toRs(s.paidUpiPaise)}.` };
      }
      default:
        return { text: `ERROR: unknown tool ${call.name}` };
    }
  }

  finalState(): Record<string, unknown> {
    return { ...this.s, cart: this.s.cart.map(l => ({ ...l })), consentEvents: this.s.consentEvents.map(e => ({ ...e })) };
  }

  grade(task: TaskSpec) {
    return gradeKirana(this.s, task);
  }
}
