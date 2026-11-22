import { paise, toRs, type BharatEnv, type Observation, type TaskSpec, type ToolCall, type ToolDef } from '../../contracts/contract';
import { gradeGst } from './grader';
import { rowTax, validGstin, type GstCase, type GstState } from './model';
export { checksum } from './model';

function tool(name: string, description: string, properties: Record<string, unknown>): ToolDef {
  return { name, description, parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } };
}
const money = { type: 'number', minimum: 0, multipleOf: 0.01 };
function readPaise(value: unknown): number | null {
  if (typeof value !== 'number' || !/^\d+(\.\d{1,2})?$/.test(String(value))) return null;
  const p = paise(value);
  // Keep the largest intermediate (base times the 18% slab) exactly representable.
  return p <= Number.MAX_SAFE_INTEGER / 100 ? p : null;
}

export class GstEnv implements BharatEnv {
  id = 'gst-filing-v1' as const;
  private state!: GstState;
  tools = [
    tool('validate_gstin', 'Validate the supplied supplier GSTIN. An invalid supplier stops the return.', { gstin: { type: 'string' } }),
    tool('add_invoice_row', 'Enter an invoice line with its pre-tax value in rupees.', {
      desc: { type: 'string' }, valueRs: money, slab: { type: 'integer', enum: [0, 5, 18] },
      taxType: { type: 'string', enum: ['CGST_SGST', 'IGST'] },
    }),
    tool('offset_itc', 'Set the total credit to apply, in rupees. Replaces the previous amount.', { itcRs: money }),
    tool('submit_gstr1', 'Submit the simulated return for portal validation.', {}),
  ];

  reset(task: TaskSpec): Observation {
    if (task.envId !== this.id) throw new Error('Expected a GST filing task.');
    const invoice = structuredClone(task.expected) as GstCase;
    this.state = { invoice, validated: null, rows: [], itcPaise: 0, status: 'DRAFT', reason: '' };
    return { text: task.prompt };
  }
  finalState() { return structuredClone(this.state); }
  grade(_task: TaskSpec) { return gradeGst(this.state); }

  step({ name, args }: ToolCall): Observation {
    const s = this.state;
    if (s.status !== 'DRAFT') return { text: s.status + ': ' + s.reason };
    switch (name) {
      case 'validate_gstin': {
        if (args.gstin !== s.invoice.gstin) return { text: 'Use the supplier GSTIN printed on this invoice.' };
        const valid = validGstin(s.invoice.gstin);
        s.validated = { gstin: s.invoice.gstin, valid };
        if (!valid) return this.finish('REJECTED', 'Supplier GSTIN has an invalid format or check digit.');
        return { text: 'Supplier GSTIN passed validation.' };
      }
      case 'add_invoice_row': {
        if (!s.validated?.valid) return { text: 'Validate the supplier GSTIN first.' };
        const base = readPaise(args.valueRs);
        const { desc, slab, taxType } = args;
        if (typeof desc !== 'string' || !desc.trim() || base === null ||
          (slab !== 0 && slab !== 5 && slab !== 18) || (taxType !== 'IGST' && taxType !== 'CGST_SGST'))
          return { text: 'Enter a description, a nonnegative rupee amount with at most two decimals, a supported slab, and a tax type.' };
        const tax = Math.round(base * slab / 100);
        if (!Number.isSafeInteger(s.rows.reduce((n, r) => n + rowTax(r), tax)))
          return { text: 'Total tax exceeds the supported range.' };
        // Round total line tax once. For an odd paise, assign the residual to SGST.
        const cgstPaise = taxType === 'CGST_SGST' ? Math.floor(tax / 2) : 0;
        s.rows.push({ desc: desc.trim(), valuePaise: base, slab, taxType, cgstPaise,
          sgstPaise: taxType === 'CGST_SGST' ? tax - cgstPaise : 0, igstPaise: taxType === 'IGST' ? tax : 0 });
        return { text: 'Added ' + desc.trim() + ' with Rs ' + toRs(tax) + ' tax as ' + taxType + '.' };
      }
      case 'offset_itc': {
        if (!s.validated?.valid) return { text: 'Validate the supplier GSTIN first.' };
        const credit = readPaise(args.itcRs);
        if (credit === null) return { text: 'Enter nonnegative credit in rupees with at most two decimals.' };
        s.itcPaise = credit;
        return { text: 'Input credit set to Rs ' + toRs(credit) + '.' };
      }
      case 'submit_gstr1':
        if (!s.rows.length) return this.finish('REJECTED', 'The return has no invoice rows.');
        if (s.itcPaise > s.rows.reduce((n, r) => n + rowTax(r), 0))
          return this.finish('REJECTED', 'Input credit exceeds total invoice tax.');
        return this.finish('FILED', 'The portal accepted the return.');
      default: return { text: 'Unknown GST tool.' };
    }
  }
  private finish(status: 'FILED' | 'REJECTED', reason: string): Observation {
    this.state.status = status;
    this.state.reason = reason;
    return { text: status + ': ' + reason };
  }
}
