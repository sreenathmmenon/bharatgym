'use client';
// Single-run replay: re-plays a recorded rollout step by step. Zero model calls.
import { useEffect } from 'react';
import Lane from './Lane.js';
import { useRace } from '../lib/useRace.js';
import { LANE_LABELS } from '../lib/fixtureLanes.js';
import type { Rollout } from '../../contracts/contract.js';

export default function ReplayView({ rollout }: { rollout: Rollout }) {
  const { race, replayFixture } = useRace();
  useEffect(() => { replayFixture([rollout]); }, [replayFixture, rollout]);
  const lane = race.lanes[rollout.agentId] ?? { agentId: rollout.agentId, steps: [] };
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '10px 22px 50px' }}>
      <div className="taskbar" style={{ padding: '12px 0' }}>
        <span className="badge">REPLAY</span>
        <span className="credit">[{rollout.taskId}] {rollout.envId} &middot; grader {rollout.graderVersion}</span>
        <span className="badge" style={{ marginLeft: 'auto' }}>RECORDED — ZERO MODEL CALLS</span>
      </div>
      <Lane lane={lane} label={LANE_LABELS[rollout.agentId] ?? rollout.agentId} />
      <p style={{ color: 'var(--dim)', fontSize: 12.5, marginTop: 14 }}>
        This is a recording: every step, latency and verdict exactly as graded.
        Raw data: <a href={`/api/replay/${rollout.shareId}`} style={{ color: 'var(--acc)' }}>rollout JSON</a>
      </p>
    </main>
  );
}
