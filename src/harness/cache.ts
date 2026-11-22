// Persistence: rollouts, floor entries, audience tasks. SQLite-free JSON store on DB_DIR
// (Railway volume /data in prod, ./data locally). Atomic-enough for one process.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { Rollout, AgentEntry, TaskSpec } from '../contracts/contract.js';

const DIR = process.env.DB_DIR ?? './data';
const f = (name: string) => join(DIR, name);

function load<T>(name: string, fallback: T): T {
  try { return existsSync(f(name)) ? JSON.parse(readFileSync(f(name), 'utf8')) : fallback; } catch { return fallback; }
}
function save(name: string, data: unknown) {
  mkdirSync(DIR, { recursive: true });
  const tmp = f(name + '.tmp');
  writeFileSync(tmp, JSON.stringify(data));
  renameSync(tmp, f(name));
}

export function saveRollouts(rs: Rollout[]) {
  const all = load<Rollout[]>('rollouts.json', []);
  save('rollouts.json', [...all, ...rs]);
}
export const allRollouts = () => load<Rollout[]>('rollouts.json', []);
export const byShareId = (id: string) => allRollouts().find(r => r.shareId === id);

export function saveFloorEntry(e: AgentEntry) {
  const all = load<AgentEntry[]>('floor.json', []);
  save('floor.json', [...all.filter(x => x.id !== e.id), e]);
}
export const floorEntries = () => load<AgentEntry[]>('floor.json', []);

export function saveAudienceTask(t: TaskSpec) {
  const all = load<TaskSpec[]>('audience.json', []);
  save('audience.json', [...all, t]);
}
export const audienceTasks = () => load<TaskSpec[]>('audience.json', []);

export interface LeaderRow { agentId: string; kind: string; runs: number; avg: number; passRate: number; }
export function leaderboard(): LeaderRow[] {
  const floors = new Set(floorEntries().map(e => e.id));
  const by: Record<string, LeaderRow> = {};
  for (const r of allRollouts()) {
    if (r.finalClaimText.startsWith('[DNF]')) continue; // provider outages never pollute ranks
    const b = (by[r.agentId] ??= { agentId: r.agentId, kind: floors.has(r.agentId) ? 'FLOOR' : 'FRONTIER', runs: 0, avg: 0, passRate: 0 });
    b.avg = (b.avg * b.runs + r.score) / (b.runs + 1);
    b.passRate = (b.passRate * b.runs + (r.score === 100 ? 1 : 0)) / (b.runs + 1);
    b.runs++;
  }
  return Object.values(by).sort((a, b) => b.avg - a.avg);
}
