'use client';
// Shared arena: task bar + lanes + animated leaderboard rail. Used by /arena and /stage.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Lane from './Lane.js';
import { useRace } from '../lib/useRace.js';
import { DEMO_LANES, DEMO_TASK, DEMO_LEADERBOARD, LANE_LABELS, LeaderRow } from '../lib/fixtureLanes.js';

interface PublicTask { id: string; envId?: string; split: 'TRAIN' | 'HELD_OUT' | 'AUDIENCE'; title: string; prompt: string | null; sealed?: boolean; contributor?: string }

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
      <h4><span className="livedot" aria-hidden="true" />LEADERBOARD <span className="livetag">LIVE</span></h4>
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
  const { race, replayFixture, connectSSE } = useRace();
  const [board, setBoard] = useState(DEMO_LEADERBOARD);
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [tasks, setTasks] = useState<PublicTask[]>([]);
  const [selected, setSelected] = useState('K5');

  useEffect(() => {
    replayFixture(DEMO_LANES);
  }, [replayFixture]);

  useEffect(() => {
    fetch('/api/envs').then(r => r.json()).then(d => {
      const list: PublicTask[] = (d.envs ?? []).flatMap((e: { id: string; tasks?: PublicTask[] }) =>
        (e.tasks ?? []).map(t => ({ ...t, envId: t.envId ?? e.id })));
      if (list.length) setTasks(list);
    }).catch(() => {});
  }, []);

  const liveTask = tasks.find(t => t.id === selected);
  const runLive = () => {
    if (!selected) return;
    setMode('live');
    connectSSE(`/api/run?taskId=${encodeURIComponent(selected)}`);
  };
  const runDemo = () => {
    setMode('demo');
    setBoard(DEMO_LEADERBOARD);
    replayFixture(DEMO_LANES);
  };

  const laneList = Object.values(race.lanes);
  const graded = laneList.filter(l => l.rollout).length;

  // Demo: nudge the board so the FLIP animation shows. Live: pull the real leaderboard.
  useEffect(() => {
    if (mode === 'demo' && graded === DEMO_LANES.length && graded > 0) {
      setBoard(b => [...b].sort((x, y) => y.avg - x.avg).map((r, i) =>
        r.agentId === 'gpt' ? { ...r, avg: Math.max(60, r.avg - 2.1), runs: r.runs + 1 } : i === 0 ? { ...r, runs: r.runs + 1 } : r,
      ).sort((x, y) => y.avg - x.avg));
    }
  }, [mode, graded]);
  useEffect(() => {
    if (mode === 'live' && graded > 0) {
      fetch('/api/leaderboard').then(r => r.json()).then(d => {
        const rows: LeaderRow[] = (d.rows ?? []).map((r: { agentId: string; kind: string; avg: number; runs: number }) =>
          ({ agentId: r.agentId, kind: String(r.kind).toLowerCase() === 'floor' ? 'floor' as const : 'frontier' as const, avg: r.avg, runs: r.runs }));
        if (rows.length) setBoard(rows);
      }).catch(() => {});
    }
  }, [mode, graded, race.done]);

  const shownSplit = mode === 'live' && liveTask ? liveTask.split : DEMO_TASK.split;
  const shownPrompt = mode === 'live' && liveTask ? (liveTask.prompt ?? 'Prompt sealed until stage reveal') : DEMO_TASK.prompt;
  const shownMeta = mode === 'live' && liveTask
    ? `[${liveTask.id}] ${liveTask.title}`
    : `[${DEMO_TASK.id}] ${DEMO_TASK.title}${DEMO_TASK.contributor ? ` · contributed by ${DEMO_TASK.contributor}` : ''}`;

  return (
    <>
      <div className="taskbar controlbar">
        <select className="ctl-select" value={selected} onChange={e => setSelected(e.target.value)}>
          {tasks.map(t => (
            <option key={t.id} value={t.id}>
              [{t.id}] {t.split === 'HELD_OUT' ? '🔒 ' : ''}{t.title}
            </option>
          ))}
          {!tasks.length && <option value="K5">[K5] Unit trap: kg vs packet</option>}
        </select>
        <button onClick={runLive} className="ctl-btn ctl-live"><span className="ctl-dot" aria-hidden="true" />RUN LIVE RACE</button>
        <button onClick={runDemo} className="ctl-btn ctl-ghost">DEMO REPLAY</button>
      </div>
      <div className="taskbar">
        <span className={'badge' + (shownSplit === 'HELD_OUT' ? ' lock' : '')}>
          {shownSplit === 'HELD_OUT' ? '🔒 HELD OUT' : shownSplit}
        </span>
        <span className="prompt">&ldquo;{shownPrompt}&rdquo;</span>
        <span className="credit">{shownMeta}</span>
        <span className="badge" style={{ marginLeft: 'auto' }}>{mode === 'live' ? 'LIVE — REAL MODELS' : cached ? 'SCRIPTED DEMO REPLAY' : 'SCRIPTED DEMO'}</span>
      </div>
      <div className="arena">
        <div className="lanes">
          {mode === 'live'
            ? (laneList.length
                ? laneList.map(lane => <Lane key={lane.agentId} lane={lane} label={LANE_LABELS[lane.agentId] ?? lane.agentId} />)
                : <div style={{ padding: 24, color: 'var(--dim)', fontStyle: 'italic' }}>Starting race&hellip; lanes appear as models take their first step.</div>)
            : DEMO_LANES.map(r => {
                const lane = race.lanes[r.agentId] ?? { agentId: r.agentId, steps: [] };
                return <Lane key={r.agentId} lane={lane} label={LANE_LABELS[r.agentId] ?? r.agentId} />;
              })}
        </div>
        <Leaderboard rows={board} />
      </div>
    </>
  );
}
