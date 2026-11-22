'use client';
// THE RECEIPT. The customer's final artifact: claim, chips, reasons, score, share link.
import { useEffect, useState } from 'react';
import type { Rollout } from '../../contracts/contract.js';

export function useCountUp(target: number, ms = 1000): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - k, 3)))); // ease-out cubic
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function ConfidentLie({ rollout }: { rollout: Rollout }) {
  const lying = rollout.checks.some(c => !c.passed);
  if (!rollout.finalClaimText) return null;
  return (
    <div className={'claimstrip' + (lying ? ' lying' : '')} title={lying ? 'The model said this. The grader disagrees.' : ''}>
      &ldquo;{rollout.finalClaimText}&rdquo;
    </div>
  );
}

export function CheckChips({ rollout, showReasons = true }: { rollout: Rollout; showReasons?: boolean }) {
  const failed = rollout.checks.filter(c => !c.passed);
  return (
    <>
      <div className="checks">
        {rollout.checks.map(c => (
          <span key={c.ruleId} className={'chip ' + (c.passed ? 'ok' : 'bad')} title={c.reason}>
            {c.passed ? '✓' : '✗'} {c.ruleId}
          </span>
        ))}
      </div>
      {showReasons && failed.length > 0 && (
        <div className="reasons">
          {failed.map(c => (
            <div key={c.ruleId}>{c.ruleId}: {c.reason}</div>
          ))}
        </div>
      )}
    </>
  );
}

export function Score({ value }: { value: number }) {
  const v = useCountUp(value);
  return (
    <div className={'scorebig ' + (value === 100 ? 'win' : 'lose')}>
      {v}<span className="den"> / 100</span>
    </div>
  );
}

export default function Scorecard({ rollout, taskTitle }: { rollout: Rollout; taskTitle?: string }) {
  return (
    <div className="lane" style={{ minHeight: 0 }}>
      <h3>
        <span>{rollout.agentId}</span>
        {taskTitle && <span style={{ color: 'var(--faint)', fontSize: 11 }}>{taskTitle}</span>}
      </h3>
      <ConfidentLie rollout={rollout} />
      <CheckChips rollout={rollout} />
      <Score value={rollout.score} />
      <div className="sharerow">
        share: <code>/r/{rollout.shareId}</code>
        <span>grader {rollout.graderVersion}</span>
        {rollout.isCached ? <span className="badge">CACHED</span> : null}
      </div>
    </div>
  );
}
