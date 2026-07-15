import React, { useState } from 'react';
import { Lock } from 'lucide-react';

// Soft access lock: certain admin/platform/AI-tool pages require a PIN before
// they render. One correct entry unlocks them all for the browser session
// (sessionStorage). This is a UX access-tier gate, not hard security — the app's
// real permissions live server-side.
const PIN = '9999';
const SESSION_KEY = 'top_admin_pin_ok';

export const PIN_LOCKED_PAGES = new Set([
    // הגדרות פלטפורמה + Platform Admin
    'PlatformSettings', 'PlatformAdmin', 'PlatformAdminTenants', 'PlatformAdminPending',
    'PlatformFeatures', 'PlatformInvites', 'PlatformSubscriptions', 'PlatformUsers', 'PlatformWhiteLabel',
    // מרכז הגדרות וחיבורים
    'AdminSettings',
    // כלי AI — חוץ ממרכז AI (AiDashboard) ומיועץ שיווק (MarketingAdvisor)
    'MarketingAI', 'MarketingCampaigns', 'MarketingDashboard', 'MarketingHub', 'MarketingAgentsHub',
    'InstagramStudio', 'SmartPrediction', 'RevenueForecasting', 'AgentPrompts', 'AgentInbox', 'CharacterLounge',
]);

export function isPinUnlocked() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}

export default function PinGate({ children }) {
    const [ok, setOk] = useState(isPinUnlocked);
    const [val, setVal] = useState('');
    const [err, setErr] = useState(false);

    if (ok) return children;

    const submit = (e) => {
        e?.preventDefault?.();
        if (val === PIN) {
            try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* private mode */ }
            setOk(true);
        } else {
            setErr(true);
            setVal('');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE] p-4" dir="rtl">
            <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-3xl border border-[#EADFC8] shadow-xl p-7 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm" style={{ background: 'var(--brand-primary, #A04A2E)' }}>
                    <Lock className="w-7 h-7 text-white" />
                </div>
                <h1 className="font-display text-2xl font-bold text-[#2A2018] mb-1">אזור מוגן</h1>
                <p className="text-sm text-[#8A7C64] mb-5">הזן קוד גישה כדי להמשיך</p>
                <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus
                    value={val}
                    onChange={(e) => { setVal(e.target.value); setErr(false); }}
                    placeholder="••••"
                    className={`w-full text-center text-2xl tracking-[0.5em] font-bold rounded-xl border-2 px-4 py-3 mb-3 focus:outline-none ${err ? 'border-red-400 bg-red-50' : 'border-[#EADFC8] bg-[#FBF6EA]'}`}
                />
                {err && <p className="text-xs text-red-500 mb-3">קוד שגוי, נסה שוב</p>}
                <button type="submit" className="w-full text-white font-bold rounded-xl py-3 shadow-sm active:scale-95 transition-transform" style={{ background: 'var(--brand-primary, #A04A2E)' }}>
                    כניסה
                </button>
            </form>
        </div>
    );
}
