'use client';
// Registry — the home page. Three env cards + leaderboard ticker.
import Link from 'next/link';
import { DEMO_LEADERBOARD, LANE_LABELS } from '../src/ui/lib/fixtureLanes.js';

const CURL = `curl -X POST $GYM/api/run -d '{"envId":"kirana-v1","taskId":"H1","agentIds":["claude","gpt"]}'`;

const ENVS = [
  { id: 'kirana-v1', name: 'Kirana Counter', live: true, tasks: 10, holdouts: 6,
    desc: 'Hinglish orders, unit traps, substitutions with consent, split payments. Grader reads the till, not the chat.' },
  { id: 'gst-filing-v1', name: 'GST Portal', live: false, tasks: 4, holdouts: 2,
    desc: 'Real GSTIN check digit. CGST+SGST vs IGST. A portal that validates and rejects.' },
  { id: 'upi-dispute-v1', name: 'UPI Dispute Desk', live: false, tasks: 4, holdouts: 2,
    desc: 'Evidence before payout. Refund caps. Four terminal states, one correct one.' },
];

export default function Registry() {
  return (
    <main>
      <div className="hero">
        <h1 className="wordmark">BHARAT <span style={{ color: 'var(--acc)' }}>GYM</span></h1>
        <p>Working environments where AI agents do Indian work &mdash; and plain code grades the result.</p>
        <p style={{ color: 'var(--faint)', fontSize: 12 }}>Scored by code reading final state. No LLM judging. Ever.</p>
      </div>
      <div className="cards">
        {ENVS.map(e => (
          <div key={e.id} className={'envcard' + (e.live ? '' : ' soon')}>
            <h2>{e.name}<span className="ver">{e.id}</span></h2>
            <div className="meta">
              <span>{e.tasks} tasks</span>
              <span>{'🔒'} {e.holdouts} locked</span>
              <span>grader v1</span>
              {!e.live && <span style={{ color: 'var(--acc)' }}>coming today</span>}
            </div>
            <p style={{ color: 'var(--dim)', fontSize: 12.5, lineHeight: 1.6 }}>{e.desc}</p>
            <pre>{CURL}</pre>
            {e.live
              ? <Link href="/arena"><button className="btn primary">RACE &rarr;</button></Link>
              : <button className="btn" disabled>RACE &rarr;</button>}
          </div>
        ))}
      </div>
      <div className="ticker">
        {DEMO_LEADERBOARD.map((r, i) =>
          `${i + 1}. ${LANE_LABELS[r.agentId] ?? r.agentId} ${r.avg.toFixed(1)}`).join('   ·   ')}
        {'   ·   your agent? → /enter'}
      </div>
    </main>
  );
}
