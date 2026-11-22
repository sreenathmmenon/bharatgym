'use client';
// One racing lane: streaming tool calls, progress bar, claim, chips, score, finish stamp.
import type { LaneState } from '../lib/useRace.js';
import { ConfidentLie, CheckChips, Score } from './Scorecard.js';
import { useEffect, useRef } from 'react';

const MAX_STEPS = 12;
const STAMP = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];

export default function Lane({ lane, label }: { lane: LaneState; label: string }) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lane.steps.length]);

  const running = !lane.rollout;
  return (
    <div className={'lane' + (running ? ' running' : ' done')}>
      <h3>
        <span>{label}</span>
        {lane.finishOrder
          ? <span className={'stamp' + (lane.claim?.startsWith('[DNF]') ? ' dnf' : lane.finishOrder === 1 ? ' first' : '')}>{lane.claim?.startsWith('[DNF]') ? 'DNF' : STAMP[lane.finishOrder] ?? lane.finishOrder + 'th'}</span>
          : <span className="runtag">running&hellip;</span>}
      </h3>
      <div className="bar"><i style={{ width: `${Math.min(100, (lane.steps.length / MAX_STEPS) * 100)}%` }} /></div>
      <div className="log" ref={logRef}>
        {lane.steps.map(s => (
          <div key={s.i}>
            <span className="call">{s.call.name}</span>
            ({JSON.stringify(s.call.args).slice(1, -1).slice(0, 56)}) <span className="ms">{s.latencyMs}ms</span>
            <br />
            <span className="obs">&nbsp;&nbsp;{s.obs.split('\n')[0].slice(0, 84)}</span>
          </div>
        ))}
      </div>
      {lane.claim && lane.rollout && <ConfidentLie rollout={lane.rollout} />}
      {lane.claim && !lane.rollout && <div className="claimstrip">&ldquo;{lane.claim}&rdquo;</div>}
      {lane.rollout && (
        <>
          <CheckChips rollout={lane.rollout} />
          <Score value={lane.rollout.score} />
        </>
      )}
    </div>
  );
}
