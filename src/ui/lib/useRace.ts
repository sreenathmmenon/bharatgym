'use client';
// Race state hook. Two modes:
//   replayFixture(rollouts) — timers replay steps so the UI works with no backend (today).
//   connectSSE(url)        — EventSource wiring for the integrator's /api/run (later).
import { useCallback, useRef, useState } from 'react';
import type { Rollout, StepLog, SseEvent } from '../../contracts/contract.js';

export interface LaneState {
  agentId: string;
  steps: StepLog[];
  claim?: string;
  rollout?: Rollout;        // set once graded
  finishOrder?: number;     // 1-based
}

export interface RaceState { lanes: Record<string, LaneState>; done: boolean; }

const empty = (): RaceState => ({ lanes: {}, done: false });

export function useRace() {
  const [race, setRace] = useState<RaceState>(empty());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const finishCount = useRef(0);

  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    finishCount.current = 0;
    setRace(empty());
  }, []);

  const pushStep = (agentId: string, step: StepLog) =>
    setRace(r => {
      const lane = r.lanes[agentId] ?? { agentId, steps: [] };
      return { ...r, lanes: { ...r.lanes, [agentId]: { ...lane, steps: [...lane.steps, step] } } };
    });

  const setClaim = (agentId: string, claim: string) =>
    setRace(r => {
      const lane = r.lanes[agentId] ?? { agentId, steps: [] };
      return { ...r, lanes: { ...r.lanes, [agentId]: { ...lane, claim } } };
    });

  const setVerdict = (agentId: string, rollout: Rollout) => {
    finishCount.current += 1;
    const order = finishCount.current;
    setRace(r => {
      const lane = r.lanes[agentId] ?? { agentId, steps: [] };
      return { ...r, lanes: { ...r.lanes, [agentId]: { ...lane, rollout, finishOrder: order } } };
    });
  };

  /** Replay pre-graded rollouts with staggered timers. */
  const replayFixture = useCallback((rollouts: Rollout[]) => {
    clear();
    for (const r of rollouts) {
      setRace(s => ({ ...s, lanes: { ...s.lanes, [r.agentId]: { agentId: r.agentId, steps: [] } } }));
      let t = 250;
      for (const step of r.steps) {
        t += 180 + Math.min(step.latencyMs, 600) * 0.5 + Math.random() * 150;
        timers.current.push(setTimeout(() => pushStep(r.agentId, step), t));
      }
      timers.current.push(setTimeout(() => setClaim(r.agentId, r.finalClaimText), t + 260));
      timers.current.push(setTimeout(() => setVerdict(r.agentId, r), t + 650));
    }
  }, [clear]);

  /** Live mode for the integrator: EventSource on /api/run?taskId=... */
  const connectSSE = useCallback((url: string) => {
    clear();
    const es = new EventSource(url);
    es.onmessage = m => {
      const e = JSON.parse(m.data) as SseEvent;
      if (e.t === 'tool_result') pushStep(e.agentId, e.step);
      else if (e.t === 'model_claimed_done') setClaim(e.agentId, e.claim);
      else if (e.t === 'grader_verdict') setVerdict(e.agentId, e.rollout);
      else if (e.t === 'race_done') { setRace(r => ({ ...r, done: true })); es.close(); }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [clear]);

  return { race, replayFixture, connectSSE, clear };
}
