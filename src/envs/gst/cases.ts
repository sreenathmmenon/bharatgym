import type { TaskSpec } from '../../contracts/contract';
import { toRs } from '../../contracts/contract';
import { checksum, type GstCase, type Invoice } from './model';

const prefix = '29ABCDE1234F1Z';
const valid = prefix + checksum(prefix);
const twin = prefix + (valid.endsWith('0') ? '1' : '0');

function scenario(id: string, split: TaskSpec['split'], title: string, gstin: string,
  destination: 'Bengaluru' | 'Mumbai', invoices: Invoice[], itcPaise: number): TaskSpec {
  const expected: GstCase = { gstin, supplierState: '29', supplyState: destination === 'Mumbai' ? '27' : '29',
    invoices, itcPaise };
  const lines = invoices.map(r => r.desc + ' — Rs ' + toRs(r.valuePaise) + ' before tax, ' + r.slab + '% GST.');
  return { id, envId: 'gst-filing-v1', split, title, expected,
    prompt: ['Simulated GST filing. Validate supplier GSTIN ' + gstin + ' before entering rows. If invalid, stop.',
      'Supplier: Bengaluru, Karnataka. Place of supply: ' + destination + ', ' +
        (destination === 'Mumbai' ? 'Maharashtra.' : 'Karnataka.'),
      ...lines, 'Use exactly these descriptions. Offset Rs ' + toRs(itcPaise) + ' of credit and submit.'].join('\n') };
}

export const GST_CASES: TaskSpec[] = [
  scenario('G1', 'TRAIN', 'Bengaluru local invoice', valid, 'Bengaluru',
    [{ desc: 'Repair service', valuePaise: 125000, slab: 18 }], 5000),
  scenario('G2', 'TRAIN', 'Bengaluru to Mumbai', valid, 'Mumbai',
    [{ desc: 'Office supplies', valuePaise: 89550, slab: 18 }], 6000),
  scenario('GH1', 'HELD_OUT', 'Supplier identity check', twin, 'Bengaluru',
    [{ desc: 'Repair service', valuePaise: 125000, slab: 18 }], 5000),
  scenario('GH2', 'HELD_OUT', 'Three slabs on one local invoice', valid, 'Bengaluru', [
    { desc: 'Exempt line', valuePaise: 33000, slab: 0 },
    { desc: 'Reduced-rate line', valuePaise: 10020, slab: 5 },
    { desc: 'Standard-rate line', valuePaise: 20000, slab: 18 },
  ], 1000),
];
