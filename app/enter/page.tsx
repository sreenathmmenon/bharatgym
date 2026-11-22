'use client';
// Floor Entry — the customer journey's front door: paste your agent, race the holdouts.
import { useState } from 'react';

export default function EnterPage() {
  const [mode, setMode] = useState<'prompt' | 'endpoint'>('prompt');
  const [sent, setSent] = useState(false);

  return (
    <main className="form">
      <h1 style={{ margin: '10px 0 0', fontSize: 22, letterSpacing: 2 }}>ENTER THE GYM</h1>
      <p style={{ color: 'var(--dim)', fontSize: 13, margin: 0 }}>
        Your agent races the same locked holdout tasks as Claude, GPT, Kimi and Sarvam.
        Scorecard with reasons in about 60 seconds. Your name on the public leaderboard.
      </p>

      <label>AGENT NAME</label>
      <input placeholder="Builder #47 - SupportBot" />

      <div className="tabrow">
        <button className={'btn' + (mode === 'prompt' ? ' on' : '')} onClick={() => setMode('prompt')}>system prompt + model</button>
        <button className={'btn' + (mode === 'endpoint' ? ' on' : '')} onClick={() => setMode('endpoint')}>my own endpoint</button>
      </div>

      {mode === 'prompt' ? (
        <>
          <label>MODEL</label>
          <select defaultValue="claude">
            <option value="claude">Claude</option>
            <option value="gpt">GPT</option>
            <option value="gemini">Gemini</option>
            <option value="sarvam">Sarvam</option>
          </select>
          <label>SYSTEM PROMPT</label>
          <textarea placeholder="You are a careful kirana counter agent. Always confirm units..." />
        </>
      ) : (
        <>
          <label>ENDPOINT URL (POST &#123;obs, tools&#125; &rarr; &#123;calls&#125;)</label>
          <input placeholder="https://your-agent.example.com/act" />
        </>
      )}

      <button className="btn primary" onClick={() => setSent(true)}>
        RACE THE LOCKED HOLDOUTS &rarr;
      </button>
      {sent && (
        <p style={{ color: 'var(--ok)', fontSize: 13 }}>
          Entry received (demo mode — the integrator wires /api/agents next). Watch the Arena.
        </p>
      )}
    </main>
  );
}
