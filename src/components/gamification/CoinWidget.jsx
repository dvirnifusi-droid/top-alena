import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Coins } from 'lucide-react';

export default function CoinWidget({ employeeId, employeeName }) {
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    if (!employeeId) return;
    loadBalance();
  }, [employeeId]);

  const loadBalance = async () => {
    const txns = await base44.entities.CoinTransaction.filter({ employee_id: employeeId, status: 'approved' });
    const total = txns.reduce((sum, t) => sum + (t.amount || 0), 0);
    setBalance(total);
  };

  if (balance === null) return null;

  return (
    <Link to={createPageUrl('GamificationCenter')}>
      <div className="flex items-center gap-2 bg-gradient-to-r from-yellow-400 to-amber-500 text-white rounded-full px-4 py-2 shadow-lg hover:shadow-xl transition-all hover:scale-105 cursor-pointer">
        <span className="text-xl">🪙</span>
        <span className="font-black text-lg">{balance.toLocaleString()}</span>
        <span className="text-xs font-medium opacity-90">מטבעות</span>
      </div>
    </Link>
  );
}