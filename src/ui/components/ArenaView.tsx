'use client';
// Shared arena: task bar + lanes + animated leaderboard rail. Used by /arena and /stage.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Lane from './Lane.js';
import { useRace } from '../lib/useRace.js';
import { DEMO_LANES, DEMO_TASK, DEMO_LEADERBOARD, LANE_LABELS, LeaderRow } from '../lib/fixtureLanes.js';

function Leaderboard({ rows }: { rows: LeaderRow[] }) {
  // FLIP: remember previous row tops, translate from delta to 0 on reorder.
  const refs = useRef(new Map<string, HTMLDivElement>());
  const prevTops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const tops = new Map<string, number>();
    refs.current.forEach((el, k) => tops.set(k, el.getBoundingClientRect().top));
    tops.forEach((top, k) => {
      const prev = prevTops.current.get(k);
      const el = refs.current.get(k);
      if (el && prev !== undefined && prev !== top) {
        el.style.transition = 'none';
        el.style.transform = `translateY(${prev - top}px)`;
        requestAnimationFrame(() => {
          el.style.transition = '';
          el.style.transform = '';
        });
      }
    });
    prevTops.current = tops;
  }, [rows]);
  return (
    <div className="rail">
      <h4>LEADERBOARD</h4>
      {rows.map((r, i) => (
        <div key={r.agentId} className={'lb-row' + (r.kind === 'floor' ? ' floor' : '')}
             ref={el => { if (el) refs.current.set(r.agentId, el); }}>
          <span>{i + 1}. {LANE_LABELS[r.agentId] ?? r.agentId}</span>
          <span>
            <b>{r.avg.toFixed(1)}</b> <span className="k">{r.kind === 'floor' ? 'FLOOR' : 'FRONTIER'} &middot; {r.runs}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ArenaView({ cached = false }: { cached?: boolean }) {
  const { race, replayFixture } = useRace();
  const [board, setBoard] = useState(DEMO_LEADERBOARD);

  useEffect(() => {
    replayFixture(DEMO_LANES);
  }, [replayFixture]);

  // When all lanes graded, nudge the board so the FLIP animation shows.
  const laneList = Object.values(race.lanes);
  const graded = laneList.filter(l => l.rollout).length;
  useEffect(() => {
    if (graded === DEMO_LANES.length && graded > 0) {
      setBoard(b => [...b].sort((x, y) => y.avg - x.avg).map((r, i) =>
        r.agentId === 'gpt' ? { ...r, avg: Math.max(60, r.avg - 2.1), runs: r.runs + 1 } : i === 0 ? { ...r, runs: r.runs + 1 } : r,
      ).sort((x, y) => y.avg - x.avg));
    }
  }, [graded]);

  return (
    <>
      <div className="taskbar">
        <span className={'badge' + (DEMO_TASK.split === 'HELD_OUT' ? ' lock' : '')}>
          {DEMO_TASK.split === 'HELD_OUT' ? '🔒 HELD OUT' : DEMO_TASK.split}
        </span>
        <span className="prompt">&ldquo;{DEMO_TASK.prompt}&rdquo;</span>
        <span className="credit">[{DEMO_TASK.id}] {DEMO_TASK.title}{DEMO_TASK.contributor ? ` · contributed by ${DEMO_TASK.contributor}` : ''}</span>
        {cached && <span className="badge" style={{ marginLeft: 'auto' }}>SCRIPTED DEMO REPLAY REPLAY</span>}
      </div>
      <div className="arena">
        <div className="lanes">
          {DEMO_LANES.map(r => {
            const lane = race.lanes[r.agentId] ?? { agentId: r.agentId, steps: [] };
            return <Lane key={r.agentId} lane={lane} label={LANE_LABELS[r.agentId] ?? r.agentId} />;
          })}
        </div>
        <Leaderboard rows={board} />
      </div>
    </>
  );
}
