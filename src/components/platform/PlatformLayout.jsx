import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import {
  Crown, Home, CheckCircle2, Building, Sparkles, Users, Send, CreditCard, Layers,
  Network, LogOut, ArrowLeft, Loader2,
} from 'lucide-react';

// The standalone Super-Admin shell. Platform pages render INSIDE this instead
// of the tenant sidebar Layout — this is "the layer above the restaurants".
// It also carries the platform-owner gate so every /Platform* page is protected
// centrally (individual pages no longer need their own PlatformOwnerOnly).

const NAV = [
  { key: 'PlatformAdmin', label: 'דף הבית', icon: Home },
  { key: 'PlatformAdminPending', label: 'אישור מסעדות', icon: CheckCircle2 },
  { key: 'PlatformAdminTenants', label: 'כל המסעדות', icon: Building },
  { key: 'NetworkHQ', label: 'מטה רשתות', icon: Network },
  { key: 'PlatformFeatures', label: "פיצ'רים גלובליים", icon: Sparkles },
  { key: 'PlatformUsers', label: 'ניהול משתמשים', icon: Users },
  { key: 'PlatformInvites', label: 'הזמנות', icon: Send },
  { key: 'PlatformSubscriptions', label: 'מנויים', icon: CreditCard },
  { key: 'PlatformWhiteLabel', label: 'White Label', icon: Layers },
];

function AccessDenied() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950" dir="rtl">
      <div className="text-center p-8 max-w-md">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Crown className="w-10 h-10 text-red-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">אין גישה לדף זה</h1>
        <p className="text-slate-400 mb-6">
          הדף הזה שמור לבעלים של הפלטפורמה (Platform Owner) בלבד. אם אתה בעל מסעדה,
          החשבון שלך מנהל את המסעדה שלך — לא את כל הפלטפורמה.
        </p>
        <Link to={createPageUrl('Dashboard')} className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm">
          <ArrowLeft className="w-4 h-4" /> חזרה למסעדה
        </Link>
      </div>
    </div>
  );
}

export default function PlatformLayout({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [gate, setGate] = useState({ loading: true, allowed: false, name: '' });

  useEffect(() => {
    (async () => {
      try {
        const [infoRes, meRes] = await Promise.all([
          base44.functions.getMyPlatformInfo({}),
          base44.auth.me().catch(() => null),
        ]);
        const info = infoRes?.data || infoRes;
        setGate({
          loading: false,
          allowed: !!info?.is_platform_owner,
          name: meRes?.full_name || meRes?.name || (info?.email || '').split('@')[0] || '',
        });
      } catch {
        setGate({ loading: false, allowed: false, name: '' });
      }
    })();
  }, []);

  if (gate.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
      </div>
    );
  }
  if (!gate.allowed) return <AccessDenied />;

  const activeKey = currentPageName
    || NAV.find(n => location.pathname.toLowerCase().includes(n.key.toLowerCase()))?.key
    || 'PlatformAdmin';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" dir="rtl">
      {/* Header bar */}
      <header className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 order-2">
            <Link
              to={createPageUrl('Dashboard')}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> עבור למסעדה
            </Link>
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
                Platform Admin <Crown className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-[11px] text-amber-400/80">קונסולת ניהול-על</div>
            </div>
          </div>
        </div>
        {/* Nav tabs */}
        <nav className="max-w-7xl mx-auto px-2 flex items-center gap-1 overflow-x-auto no-scrollbar">
          {NAV.map(n => {
            const active = n.key === activeKey;
            return (
              <button
                key={n.key}
                onClick={() => navigate(createPageUrl(n.key))}
                className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm border-b-2 transition ${
                  active
                    ? 'border-amber-400 text-white font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <n.icon className="w-4 h-4" /> {n.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Content — expose the owner name to children via context prop */}
      <main className="max-w-7xl mx-auto">
        {typeof children === 'function' ? children({ ownerName: gate.name }) : children}
      </main>
    </div>
  );
}
