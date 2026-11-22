// Tiny helpers for App Router route handlers (plain web Request/Response).
import { randomBytes } from 'node:crypto';

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export const bad = (error: string, status = 400) => json({ error }, status);

export async function readBody(req: Request, maxBytes = 16_000): Promise<Record<string, unknown> | null> {
  try {
    const text = await req.text();
    if (text.length > maxBytes) return null;
    const v = text ? JSON.parse(text) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch { return null; }
}

export const slug = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'entry';

const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';
export const rand4 = () => [...randomBytes(4)].map(b => ALNUM[b % 36]).join('');
