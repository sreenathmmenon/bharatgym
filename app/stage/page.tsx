'use client';
import ArenaView from '../../src/ui/components/ArenaView.js';

export default function StagePage() {
  return (
    <main className="stage">
      <ArenaView cached />
      <div className="qrbox">SCAN TO<br />SEND A TASK<br />(QR here)</div>
    </main>
  );
}
