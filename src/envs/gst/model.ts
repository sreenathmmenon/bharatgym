export type Slab = 0 | 5 | 18;
export type TaxType = 'CGST_SGST' | 'IGST';
export type Invoice = { desc: string; valuePaise: number; slab: Slab };
export type GstCase = {
  gstin: string;
  supplierState: string;
  supplyState: string;
  invoices: Invoice[];
  itcPaise: number;
};
export type FiledRow = Invoice & {
  taxType: TaxType;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
};
export type GstState = {
  invoice: GstCase;
  validated: { gstin: string; valid: boolean } | null;
  rows: FiledRow[];
  itcPaise: number;
  status: 'DRAFT' | 'FILED' | 'REJECTED';
  reason: string;
};

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export function checksum(prefix: string): string {
  if (!/^[0-9A-Z]{14}$/.test(prefix)) throw new Error('Expected 14 uppercase GSTIN characters.');
  let sum = 0;
  for (let i = 0; i < prefix.length; i++) {
    const product = alphabet.indexOf(prefix[i]) * (1 + i % 2);
    sum += Math.floor(product / 36) + product % 36;
  }
  return alphabet[(36 - sum % 36) % 36];
}
export function validGstin(id: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(id)
    && checksum(id.slice(0, 14)) === id[14];
}
export function rowTax(row: FiledRow): number {
  return row.cgstPaise + row.sgstPaise + row.igstPaise;
}
