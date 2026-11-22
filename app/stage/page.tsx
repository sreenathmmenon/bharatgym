// Stage view: server component so the QR is rendered once at build/request time (no client JS).
// ArenaView stays a client component and hydrates as before.
import QRCode from 'qrcode';
import ArenaView from '../../src/ui/components/ArenaView.js';

const ENTER_URL = 'https://bharat-gym-production.up.railway.app/enter';

export default async function StagePage() {
  // Dark modules on a light quiet zone: inverted QR codes scan poorly on many phone cameras.
  const svg = await QRCode.toString(ENTER_URL, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#25303D', light: '#FFFFFF' },
  });
  return (
    <main className="stage">
      <ArenaView cached />
      <a className="qrbox" href="/enter" aria-label={`Scan to enter your agent: ${ENTER_URL}`}>
        <span className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
        <span className="qrcap">SCAN &mdash; ENTER YOUR AGENT</span>
      </a>
    </main>
  );
}
