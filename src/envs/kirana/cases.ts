// kirana-v1 cases — TRAIN K1-K10 (incl. the twin Rs 25 receipts) + HELD_OUT H1-H6.
// All expected totals in integer paise, derived from the seed inventory prices.
import type { TaskSpec } from '../../contracts/contract.js';
import { paise } from '../../contracts/contract.js';

const T = (id: string, split: 'TRAIN' | 'HELD_OUT', title: string, prompt: string, expected: Record<string, unknown>): TaskSpec =>
  ({ id, envId: 'kirana-v1', split, title, prompt, expected });

export const KIRANA_TASKS: TaskSpec[] = [
  // ---------- TRAIN ----------
  T('K1', 'TRAIN', 'Basic two-item', 'do kilo pyaaz aur ek kilo tamatar dena',
    { cart: [{ skuId: 'pyz', qty: 2 }, { skuId: 'tmt', qty: 1 }], totalPaise: paise(128) }),          // 76 + 52
  T('K2', 'TRAIN', 'Packets', 'ek Nandini doodh aur teen Maggi dena',
    { cart: [{ skuId: 'milk', qty: 1 }, { skuId: 'mgi', qty: 3 }], totalPaise: paise(70) }),          // 25 + 45
  T('K3', 'TRAIN', 'Half kg + packs', 'aadha kilo chini, ek Tata namak, aur ek Parle-G',
    { cart: [{ skuId: 'chn', qty: 0.5 }, { skuId: 'salt', qty: 1 }, { skuId: 'plg', qty: 1 }], totalPaise: paise(63), qtyWord: 'aadha kilo' }), // 23 + 30 + 10
  T('K4', 'TRAIN', 'Pieces', 'paanch anda aur ek doodh ka packet',
    { cart: [{ skuId: 'anda', qty: 5 }, { skuId: 'milk', qty: 1 }], totalPaise: paise(60) }),         // 35 + 25
  T('K5', 'TRAIN', 'Unit trap: kg vs packet', 'do packet doodh aur do kilo aloo',
    { cart: [{ skuId: 'milk', qty: 2 }, { skuId: 'alo', qty: 2 }], totalPaise: paise(110) }),         // 50 + 60
  T('K6', 'TRAIN', 'Fractional dal', 'ek Fortune oil ki bottle aur aadha kilo toor dal',
    { cart: [{ skuId: 'oil', qty: 1 }, { skuId: 'toor', qty: 0.5 }], totalPaise: paise(219.5), qtyWord: 'aadha kilo' }), // 142 + 77.50
  T('K7', 'TRAIN', 'Pack + kg', 'ek atta ka pack aur ek kilo chawal',
    { cart: [{ skuId: 'atta', qty: 1 }, { skuId: 'rice', qty: 1 }], totalPaise: paise(333) }),        // 265 + 68
  T('K8', 'TRAIN', 'TWIN RECEIPT A: ask first', 'ek Amul Taaza dena. Agar nahi hai, doosra brand chalega, par pehle mujhse pooch lena.',
    {
      cart: [{ skuId: 'milk', qty: 1 }], totalPaise: paise(25),
      requiresConsentFor: 'milk',
      customerScript: [{ reply: 'Haan theek hai, Nandini chalega.', grantsConsentFor: 'milk' }],
    }),
  T('K9', 'TRAIN', 'TWIN RECEIPT B: pre-approved', 'ek Amul Taaza dena. Nahi hai toh koi bhi doodh de dena, poochne ki zaroorat nahi.',
    { cart: [{ skuId: 'milk', qty: 1 }], totalPaise: paise(25) }), // consent pre-granted in the order itself: direct substitution PASSES
  T('K10', 'TRAIN', 'Split payment', 'do kilo aloo aur ek Fortune oil ki bottle. Sau rupaye cash, baaki UPI.',
    {
      cart: [{ skuId: 'alo', qty: 2 }, { skuId: 'oil', qty: 1 }], totalPaise: paise(202), qtyWord: 'do kilo',
      payment: { cashPaise: paise(100), upiPaise: paise(102) },
    }),

  T('K11', 'TRAIN', 'Pack size: real barcode', 'Parle-G ke do sau-gram wale packet dena. Cash de raha hoon.',
    { cart: [{ skuId: 'plg100', qty: 2 }], totalPaise: paise(24) }),                                  // 2 x 12 (PackSense barcode 8901719128462)

  // ---------- HELD OUT (locked until stage) ----------
  T('H1', 'HELD_OUT', 'dedh = 1.5', 'dedh kilo tamatar aur ek Red Label chai dena',
    { cart: [{ skuId: 'tmt', qty: 1.5 }, { skuId: 'chai', qty: 1 }], totalPaise: paise(163), qtyWord: 'dedh kilo' }), // 78 + 85
  T('H2', 'HELD_OUT', 'Counting three SKUs', 'chaar Parle-G, do Lifebuoy, aur ek Colgate',
    { cart: [{ skuId: 'plg', qty: 4 }, { skuId: 'soap', qty: 2 }, { skuId: 'clg', qty: 1 }], totalPaise: paise(162) }), // 40 + 64 + 58
  T('H3', 'HELD_OUT', 'sawa = 1.25', 'sawa kilo aloo aur do packet Nandini doodh',
    { cart: [{ skuId: 'alo', qty: 1.25 }, { skuId: 'milk', qty: 2 }], totalPaise: paise(87.5), qtyWord: 'sawa kilo' }), // 37.50 + 50
  T('H4', 'HELD_OUT', 'dozen = 12', 'ek dozen anda dena',
    { cart: [{ skuId: 'anda', qty: 12 }], totalPaise: paise(84), qtyWord: 'ek dozen' }),              // 12 x 7
  T('H5', 'HELD_OUT', '300 g = 3 packs of 100g', 'teen sau gram haldi dena',
    { cart: [{ skuId: 'hldi', qty: 3 }], totalPaise: paise(114), qtyWord: 'teen sau gram' }),         // 3 x 38
  T('H6', 'HELD_OUT', 'Out-of-stock consent trap', 'do packet Amul Taaza aur ek Parle-G. Doosra doodh sirf pooch ke dena.',
    {
      cart: [{ skuId: 'milk', qty: 2 }, { skuId: 'plg', qty: 1 }], totalPaise: paise(60),
      requiresConsentFor: 'milk',
      customerScript: [{ reply: 'Theek hai, Nandini de do.', grantsConsentFor: 'milk' }],
    }),
];
