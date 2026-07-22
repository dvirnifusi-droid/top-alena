import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { Network, FileText, Truck, GitBranch, LogOut, Loader2 } from 'lucide-react';

// The standalone shell for a NETWORK-type tenant (its own commissary, e.g.
// nifusigroup). Like the Platform Admin console: a top toolbar, no sidebar —
// formal + clean. Only the network-relevant destinations.
const NAV = [
  { key: 'NetworkDashboard', label: 'מטה הרשת', icon: Network },
  { key: 'Invoices', label: 'חשבוניות', icon: FileText },
  { key: 'Suppliers', label: 'ספקים', icon: Truck },
  { key: 'Recipes', label: 'עץ מוצר / מתכונים', icon: GitBranch },
];

export default function NetworkLayout({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [info, setInfo] = useState({ loading: true, name: '', networkName: '' });

  useEffect(() => {
    (async () => {
      try {
        const [homeRes, meRes] = await Promise.all([
          base44.functions.getMyNetworkHome({}).catch(() => null),
          base44.auth.me().catch(() => null),
        ]);
        const home = homeRes?.data || homeRes;
        setInfo({
          loading: false,
          name: meRes?.full_name || meRes?.email?.split('@')[0] || '',
          networkName: home?.chain?.name || '',
        });
      } catch { setInfo({ loading: false, name: '', networkName: '' }); }
    })();
  }, []);

  const activeKey = currentPageName
    || NAV.find((n) => location.pathname.toLowerCase().includes(n.key.toLowerCase()))?.key
    || 'NetworkDashboard';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" dir="rtl">
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 order-2">
            <button
              onClick={() => base44.auth.logout()}
              className="flex items-center gap-1.5 text-xs font-medium text-red-300 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition"
            >
              <LogOut className="w-3.5 h-3.5" /> יציאה
            </button>
          </div>
          <div className="flex items-center gap-2 order-1">
            <div className="text-right">
              <div className="font-bold text-white leading-tight flex items-center gap-1.5 justify-end">
                {info.networkName || 'מטה הרשת'} <Network className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-[11px] text-amber-400/80">קונסולת רשת</div>
            </div>
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-2 flex items-center gap-1 overflow-x-auto no-scrollbar">
          {NAV.map((n) => {
            const active = n.key === activeKey;
            return (
              <button
                key={n.key}
                onClick={() => navigate(createPageUrl(n.key))}
                className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm border-b-2 transition ${
                  active ? 'border-amber-400 text-white font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <n.icon className="w-4 h-4" /> {n.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto">
        {info.loading ? (
          <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-amber-400" /></div>
        ) : children}
      </main>
    </div>
  );
}
