import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, Plus, Save, Check, Star, RefreshCw } from 'lucide-react';

const CATEGORY_LABEL = {
  operations: 'תפעול', customer: 'לקוחות', ai: 'AI', advanced: 'מתקדם',
};

function LimitInput({ value, onChange, placeholder }) {
  return (
    <input
      type="number" min="0" inputMode="numeric"
      value={value == null ? '' : value}
      onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0))}
      placeholder={placeholder || '∞'}
      className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white text-center focus:border-amber-500 outline-none"
    />
  );
}

function PlanCard({ plan, catalog, onSave }) {
  const [p, setP] = useState(plan);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (k, v) => { setP(prev => ({ ...prev, [k]: v })); setSaved(false); };
  const toggleModule = (key) => {
    const has = p.modules.includes(key);
    set('modules', has ? p.modules.filter(m => m !== key) : [...p.modules, key]);
  };
  const save = async () => {
    setSaving(true);
    try {
      await base44.functions.upsertPlan({
        key: p.key, name: p.name, price_monthly: p.price_monthly, price_yearly: p.price_yearly,
        trial_days: p.trial_days, max_users: p.max_users, max_employees: p.max_employees,
        max_whatsapp: p.max_whatsapp, modules: p.modules, is_default: p.is_default, active: p.active,
      });
      setSaved(true);
      onSave?.();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setSaving(false); }
  };

  const byCat = {};
  for (const m of catalog) { (byCat[m.category] = byCat[m.category] || []).push(m); }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <input value={p.name} onChange={e => set('name', e.target.value)}
          className="bg-transparent text-lg font-bold text-white border-b border-transparent hover:border-slate-700 focus:border-amber-500 outline-none flex-1" />
        <code className="text-[11px] text-slate-500">{p.key}</code>
      </div>
      {p.tenant_count != null && <div className="text-[11px] text-slate-500 mt-0.5">{p.tenant_count} מסעדות בחבילה</div>}

      {/* Pricing */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <label className="text-[11px] text-slate-400">₪ חודשי
          <input type="number" min="0" value={p.price_monthly} onChange={e => set('price_monthly', parseInt(e.target.value, 10) || 0)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white mt-0.5 focus:border-amber-500 outline-none" />
        </label>
        <label className="text-[11px] text-slate-400">₪ שנתי
          <input type="number" min="0" value={p.price_yearly} onChange={e => set('price_yearly', parseInt(e.target.value, 10) || 0)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white mt-0.5 focus:border-amber-500 outline-none" />
        </label>
        <label className="text-[11px] text-slate-400">ימי ניסיון
          <input type="number" min="0" value={p.trial_days} onChange={e => set('trial_days', parseInt(e.target.value, 10) || 0)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white mt-0.5 focus:border-amber-500 outline-none" />
        </label>
      </div>

      {/* Limits */}
      <div className="mt-3">
        <div className="text-[11px] text-slate-400 mb-1">מגבלות (ריק = ללא הגבלה)</div>
        <div className="flex gap-2 flex-wrap">
          <div className="text-[11px] text-slate-400">משתמשים <LimitInput value={p.max_users} onChange={v => set('max_users', v)} /></div>
          <div className="text-[11px] text-slate-400">עובדים <LimitInput value={p.max_employees} onChange={v => set('max_employees', v)} /></div>
          <div className="text-[11px] text-slate-400">וואטסאפ/חודש <LimitInput value={p.max_whatsapp} onChange={v => set('max_whatsapp', v)} /></div>
        </div>
      </div>

      {/* Modules */}
      <div className="mt-3 flex-1">
        <div className="text-[11px] text-slate-400 mb-1">פיצ'רים כלולים</div>
        <div className="space-y-2">
          {Object.entries(byCat).map(([cat, mods]) => (
            <div key={cat}>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">{CATEGORY_LABEL[cat] || cat}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {mods.map(m => {
                  const on = p.modules.includes(m.key);
                  return (
                    <button key={m.key} onClick={() => toggleModule(m.key)}
                      className={`text-[11px] px-2 py-1 rounded border transition ${on
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                        : 'bg-slate-800 text-slate-500 border-slate-700 hover:border-slate-600'}`}>
                      {on && <Check className="w-3 h-3 inline ml-0.5" />}{m.name_he}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-800">
        <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
          <input type="checkbox" checked={!!p.is_default} onChange={e => set('is_default', e.target.checked)} className="accent-amber-500" />
          <Star className="w-3 h-3" /> ברירת מחדל לחדשות
        </label>
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-1.5 text-sm bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-3 py-1.5 rounded-lg disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'נשמר' : 'שמור'}
        </button>
      </div>
    </div>
  );
}

export default function PlatformFeatures() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.listPlans({});
      setData(res?.data || res);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const addPlan = () => {
    const key = window.prompt('מזהה חבילה חדשה (אנגלית, למשל "starter"):', '');
    if (!key) return;
    setData(d => ({
      ...d,
      plans: [...(d?.plans || []), {
        key: key.toLowerCase().replace(/[^a-z0-9_-]/g, ''), name: key, price_monthly: 0, price_yearly: 0,
        trial_days: 14, max_users: null, max_employees: null, max_whatsapp: null, modules: [], is_default: false, active: true, tenant_count: 0,
      }],
    }));
  };

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-fuchsia-400" /> פיצ'רים גלובליים וחבילות
        </h1>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> רענן
          </button>
          <button onClick={addPlan} className="flex items-center gap-1.5 text-sm bg-fuchsia-600 hover:bg-fuchsia-500 text-white px-3 py-1.5 rounded-lg">
            <Plus className="w-4 h-4" /> חבילה חדשה
          </button>
        </div>
      </div>
      <p className="text-sm text-slate-400">
        בונה החבילות: כל חבילה מגדירה אילו פיצ'רים כלולים, מגבלות כמותיות ומחיר. הקצאת חבילה למסעדה נעשית מ"כל המסעדות".
      </p>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {(data?.plans || []).map(p => (
            <PlanCard key={p.key} plan={p} catalog={data?.catalog || []} onSave={load} />
          ))}
        </div>
      )}
    </div>
  );
}
