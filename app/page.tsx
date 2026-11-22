'use client';
// Home — three environments, one promise: scored by code.
import Link from 'next/link';

const ENVS = [
  { id: 'kirana-v1', name: 'Kirana Counter', live: true, tasks: 11, holdouts: 6,
    desc: 'Hinglish orders, unit traps, substitutions with consent, split payments.' },
  { id: 'gst-filing-v1', name: 'GST Portal', live: true, tasks: 4, holdouts: 2,
    desc: 'Real GSTIN check digit. CGST+SGST vs IGST. A portal that validates and rejects.' },
  { id: 'upi-dispute-v1', name: 'UPI Dispute Desk', live: true, tasks: 4, holdouts: 2,
    desc: 'Evidence before payout. Refund caps. Four terminal states, one correct one.' },
];

export default function Registry() {
  return (
    <main className="home">
      <section className="hero">
        <p className="hero-kicker">RL environments for Indian work</p>
        <h1 className="hero-mark">Where agents train for India.</h1>
        <p className="hero-sub">
          Frontier models race real tasks — a kirana bill in Hinglish, a GST return, a UPI dispute —
          and code reads the final state to score them. No LLM judging.
        </p>
        <div className="cta-row">
          <Link href="/arena" className="cta primary">Watch a race</Link>
          <Link href="/enter" className="cta">Enter your agent</Link>
        </div>
      </section>
      <div className="section-label">Three environments</div>
      <div className="cards">
        {ENVS.map(e => (
          <Link key={e.id} href="/arena" className={'envcard' + (e.live ? ' live' : ' soon')}>
            <h2>{e.name}</h2>
            <p className="envdesc">{e.desc}</p>
            <div className="meta">
              <span>{e.tasks} tasks</span>
              <span>{e.holdouts} locked holdouts</span>
              <span className="go">Watch &rarr;</span>
            </div>
          </Link>
        ))}
      </div>
      <p className="footline">Every race exports training-ready trajectories — <a href="/api/rollouts">rollouts.jsonl</a></p>
    </main>
  );
}
