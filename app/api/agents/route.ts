// POST /api/agents — register a floor entry. GET — list entries (system prompts never returned).
import type { AgentEntry } from '../../../src/contracts/contract.js';
import { saveFloorEntry, floorEntries } from '../../../src/harness/cache.js';
import { json, bad, readBody, slug, rand4 } from '../../../src/harness/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MODELS = ['claude', 'gpt', 'gemini', 'sarvam'];

// SSRF guard: https only, no localhost / private / link-local / metadata hosts, no raw IPv6.
function safeUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.startsWith('[')) return null;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return null;
  }
  if (!h.includes('.')) return null;
  return u.toString();
}

export async function POST(req: Request) {
  const b = await readBody(req);
  if (!b) return bad('invalid JSON body');
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name || name.length > 40) return bad('name required, max 40 chars');
  const c = b.config as Record<string, unknown> | undefined;
  if (!c || typeof c !== 'object') return bad('config required');

  let config: AgentEntry['config'];
  if ('url' in c) {
    const url = typeof c.url === 'string' ? safeUrl(c.url) : null;
    if (!url) return bad('config.url must be a public https URL');
    config = { url };
  } else {
    if (typeof c.model !== 'string' || !MODELS.includes(c.model)) return bad(`config.model must be one of ${MODELS.join(', ')}`);
    const system = typeof c.system === 'string' ? c.system : '';
    if (system.length > 2000) return bad('config.system max 2000 chars');
    config = { model: c.model, system };
  }

  const entry: AgentEntry = { id: `${slug(name)}-${rand4()}`, name, kind: 'floor', config };
  saveFloorEntry(entry);
  return json({ id: entry.id, name: entry.name, kind: entry.kind }, 201);
}

export async function GET() {
  const entries = floorEntries().map(e => ({
    id: e.id, name: e.name, kind: e.kind,
    config: 'url' in e.config ? { url: e.config.url } : { model: e.config.model },
  }));
  return json({ entries });
}
