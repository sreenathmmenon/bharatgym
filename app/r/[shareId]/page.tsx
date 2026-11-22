// GET /r/:shareId — human-readable replay of a recorded run. Raw JSON at /api/replay/:shareId.
import { byShareId } from '../../../src/harness/cache.js';
import ReplayView from '../../../src/ui/components/ReplayView.js';

export const dynamic = 'force-dynamic';

export default async function ReplayPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const rollout = byShareId(shareId);
  if (!rollout) {
    return (
      <main style={{ maxWidth: 560, margin: '60px auto', padding: '0 22px' }}>
        <h1 style={{ fontFamily: 'var(--serif)' }}>No recording found.</h1>
        <p style={{ color: 'var(--dim)' }}>
          Share links point at recordings on this deployment. Run a race in the Arena and
          use the share id printed under its score.
        </p>
      </main>
    );
  }
  return <ReplayView rollout={rollout} />;
}
