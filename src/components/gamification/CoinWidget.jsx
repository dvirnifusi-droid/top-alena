import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Coins } from 'lucide-react';

export default function CoinWidget({ employeeId, employeeName }) {
  const [balance, setBalance] = useState(null);
  const [display, setDisplay] = useState(0); // animated count-up value

  useEffect(() => {
    if (!employeeId) return;
    loadBalance();
  }, [employeeId]);

  const loadBalance = async () => {
    const txns = await base44.entities.CoinTransaction.filter({ employee_id: employeeId, status: 'approved' });
    const total = txns.reduce((sum, t) => sum + (t.amount || 0), 0);
    setBalance(total);
  };

  // Count-up: animate from current display to the real balance.
  useEffect(() => {
    if (balance === null) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || balance === display) { setDisplay(balance); return; }
    const from = display, diff = balance - from, dur = 900, t0 = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(Math.round(from + diff * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balance]);

  if (balance === null) return null;

  return (
    <Link to={createPageUrl('GamificationCenter')}>
      <div className="relative overflow-hidden flex items-center gap-2 bg-gradient-to-r from-yellow-400 to-amber-500 text-white rounded-full px-4 py-2 shadow-lg hover:shadow-xl transition-all hover:scale-105 cursor-pointer">
        <span className="pointer-events-none absolute inset-y-0 -inset-x-2" style={{ background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.6) 50%, transparent 65%)', animation: 'coinShine 3.8s ease-in-out infinite' }} />
        <span className="text-xl relative">🪙</span>
        <span className="font-black text-lg relative tabular-nums">{display.toLocaleString()}</span>
        <span className="text-xs font-medium opacity-90 relative">מטבעות</span>
      </div>
      <style>{`@keyframes coinShine{0%{transform:translateX(-130%)}55%,100%{transform:translateX(130%)}}`}</style>
    </Link>
  );
}