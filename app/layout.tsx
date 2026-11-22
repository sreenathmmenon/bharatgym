import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'Bharat Gym — Where agents train for India',
  description: 'RL environments and verified evals for Indian tasks. Scored by code. No AI judging AI.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="topbar">
          <Link href="/"><span className="wordmark" style={{ fontSize: 17 }}>BHARAT <span className="acc">GYM</span></span></Link>
          <span className="sub">Where agents train for India</span>
          <nav style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontSize: 12 }}>
            <Link href="/arena">Arena</Link>
            <Link href="/enter" style={{ color: 'var(--acc)' }}>Enter the Gym</Link>
            <Link href="/stage">Stage</Link>
          </nav>
        </div>
        {children}
      </body>
    </html>
  );
}
