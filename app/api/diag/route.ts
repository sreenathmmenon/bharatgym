// GET /api/diag — provider connectivity check. Calls each configured provider's
// model-list (or a tiny request) server-side and reports status + sample model ids.
// Never returns keys. Read-only; exists to debug lane availability fast.
import { json } from '../../../src/harness/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

async function probe(name: string, url: string, headers: Record<string, string>): Promise<Record<string, unknown>> {
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    const text = await r.text();
    let models: string[] = [];
    try {
      const d = JSON.parse(text);
      const arr = Array.isArray(d?.data) ? d.data : Array.isArray(d?.models) ? d.models : [];
      models = arr.map((m: { id?: string; name?: string }) => m.id ?? m.name ?? '').filter(Boolean).slice(0, 40);
    } catch { /* non-JSON body */ }
    return { name, status: r.status, models, bodyPreview: models.length ? undefined : text.slice(0, 160) };
  } catch (e) {
    return { name, status: 0, error: String(e).slice(0, 160) };
  }
}

export async function GET() {
  const out: Record<string, unknown>[] = [];
  if (process.env.FIREWORKS_API_KEY)
    out.push(await probe('fireworks', 'https://api.fireworks.ai/inference/v1/models', { authorization: `Bearer ${process.env.FIREWORKS_API_KEY}` }));
  if (process.env.SARVAM_API_KEY) {
    out.push(await probe('sarvam-v1-models', 'https://api.sarvam.ai/v1/models', { 'api-subscription-key': process.env.SARVAM_API_KEY }));
    out.push(await probe('sarvam-v1-models-bearer', 'https://api.sarvam.ai/v1/models', { authorization: `Bearer ${process.env.SARVAM_API_KEY}` }));
  }
  if (process.env.OPENAI_API_KEY)
    out.push(await probe('openai', 'https://api.openai.com/v1/models', { authorization: `Bearer ${process.env.OPENAI_API_KEY}` }));
  return json({ providers: out });
}
