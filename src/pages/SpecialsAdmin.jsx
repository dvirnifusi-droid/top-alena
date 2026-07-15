import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

// Admin UI for SpecialPopup. Owner-editable marketing popups + funnel stats.
// Routes: /SpecialsAdmin (auth required).

const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function emptyForm() {
  return {
    id: null,
    variant: '',
    eyebrow: '',
    emoji: '🎉',
    title: '',
    body: '',
    cta: 'הזמן שולחן',
    cta_href: '',
    target_days: '',
    target_hour_from: '',
    target_hour_to: '',
    priority: 0,
    is_active: true,
    starts_at: '',
    ends_at: '',
  };
}

export default function SpecialsAdmin() {
  const [popups, setPopups] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // form state when editing
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const [list, stats] = await Promise.all([
        base44.functions.listSpecialPopups().then(r => r.data),
        base44.functions.getPopupAnalytics({ since_days: 30 }).then(r => r.data),
      ]);
      setPopups(Array.isArray(list) ? list : []);
      setAnalytics(stats);
    } catch (e) {
      setErr(e?.message || 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startNew = () => setEditing(emptyForm());
  const startEdit = (p) => setEditing({
    id: p.id,
    variant: p.variant,
    eyebrow: p.eyebrow || '',
    emoji: p.emoji || '',
    title: p.title,
    body: p.body || '',
    cta: p.cta || 'הזמן שולחן',
    cta_href: p.cta_href || '',
    target_days: p.target_days || '',
    target_hour_from: p.target_hour_from ?? '',
    target_hour_to: p.target_hour_to ?? '',
    priority: p.priority ?? 0,
    is_active: !!p.is_active,
    starts_at: p.starts_at ? String(p.starts_at).slice(0, 16) : '',
    ends_at: p.ends_at ? String(p.ends_at).slice(0, 16) : '',
  });

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setErr('');
    try {
      const payload = {
        ...editing,
        target_hour_from: editing.target_hour_from === '' ? null : Number(editing.target_hour_from),
        target_hour_to: editing.target_hour_to === '' ? null : Number(editing.target_hour_to),
        priority: Number(editing.priority) || 0,
        starts_at: editing.starts_at || null,
        ends_at: editing.ends_at || null,
      };
      await base44.functions.upsertSpecialPopup(payload);
      setMsg('נשמר ✓');
      setEditing(null);
      await load();
      setTimeout(() => setMsg(''), 2000);
    } catch (e) {
      setErr(e?.message || 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p) => {
    if (!confirm(`למחוק את "${p.title}"? אירועי טלמטריה ישמרו.`)) return;
    setErr('');
    try {
      await base44.functions.deleteSpecialPopup({ id: p.id });
      await load();
    } catch (e) {
      setErr(e?.message || 'שגיאה במחיקה');
    }
  };

  const toggleActive = async (p) => {
    setErr('');
    try {
      await base44.functions.upsertSpecialPopup({ ...p, is_active: !p.is_active });
      await load();
    } catch (e) {
      setErr(e?.message || 'שגיאה');
    }
  };

  const seedDefaults = async () => {
    if (popups.length > 0) {
      if (!confirm('יש כבר פופאפים. seed יוסיף רק אם הטבלה ריקה. להמשיך?')) return;
    }
    setErr('');
    try {
      const res = await base44.functions.seedSpecialPopupsIfEmpty();
      setMsg(res.data?.seeded ? `נטענו ${res.data.count} ברירות מחדל ✓` : 'הטבלה לא ריקה — לא הוטענו');
      await load();
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setErr(e?.message || 'שגיאה');
    }
  };

  // ───────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="min-h-screen p-4 md:p-8" style={{ background: '#FAF5E8', fontFamily: 'Heebo, system-ui, sans-serif' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;700;900&family=Heebo:wght@300;400;500;600;700;900&display=swap'); .brand-display{font-family:'Frank Ruhl Libre',serif;font-weight:900}`}</style>

      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="פופאפים — עורך + סטטיסטיקה"
          subtitle="הוסף/ערוך פופאפים שמופיעים על דף ההזמנות. נתונים ל-30 הימים האחרונים."
          icon={Sparkles}
          action={(
            <div className="flex gap-2">
              <button onClick={seedDefaults} className="px-4 py-2 rounded-xl text-sm font-bold border" style={{ background: '#FFFEFB', color: '#44512C', borderColor: 'rgba(68,81,44,0.30)' }}>טען ברירות מחדל</button>
              <button onClick={startNew} className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: '#A04A2E', color: '#F4ECD8' }}>+ פופאפ חדש</button>
            </div>
          )}
        />

        {err && <div className="rounded-xl p-3 text-sm" style={{ background: '#FFEBEB', color: '#A11A1A', border: '1px solid #F5C2C2' }}>{err}</div>}
        {msg && <div className="rounded-xl p-3 text-sm" style={{ background: '#E6F4D9', color: '#3C5A14', border: '1px solid #B8D687' }}>{msg}</div>}

        {/* Analytics */}
        {analytics && analytics.variants && analytics.variants.length > 0 && (
          <section className="rounded-2xl overflow-hidden" style={{ background: '#FFFEFB', border: '1px solid rgba(184,149,86,0.40)' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(184,149,86,0.30)', background: '#1F1B17', color: '#F4ECD8' }}>
              <div className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: '#D9BD83' }}>פאנל המרות · {analytics.since_days} ימים אחרונים</div>
              <h3 className="brand-display text-xl mt-0.5">איזה פופאפ ממיר הכי טוב</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: '#F4ECD8' }}>
                  <th className="text-right px-4 py-2 font-bold" style={{ color: '#44512C' }}>וריאנט</th>
                  <th className="text-right px-3 py-2 font-bold" style={{ color: '#44512C' }}>הוצג</th>
                  <th className="text-right px-3 py-2 font-bold" style={{ color: '#44512C' }}>נסגר</th>
                  <th className="text-right px-3 py-2 font-bold" style={{ color: '#44512C' }}>לחיצות</th>
                  <th className="text-right px-3 py-2 font-bold" style={{ color: '#44512C' }}>CTR</th>
                  <th className="text-right px-3 py-2 font-bold" style={{ color: '#44512C' }}>הזמין</th>
                  <th className="text-right px-3 py-2 font-bold" style={{ color: '#44512C' }}>המרה</th>
                </tr>
              </thead>
              <tbody>
                {analytics.variants.map(v => (
                  <tr key={v.variant} style={{ borderTop: '1px solid rgba(184,149,86,0.20)' }}>
                    <td className="px-4 py-2 font-bold" style={{ color: '#1F1B17' }}>{v.variant}</td>
                    <td className="px-3 py-2" style={{ color: '#1F1B17' }}>{v.shown}</td>
                    <td className="px-3 py-2" style={{ color: '#8B7F65' }}>{v.dismissed}</td>
                    <td className="px-3 py-2 font-bold" style={{ color: '#A04A2E' }}>{v.clicked}</td>
                    <td className="px-3 py-2" style={{ color: '#44512C' }}>{v.ctr}%</td>
                    <td className="px-3 py-2 font-bold" style={{ color: '#44512C' }}>{v.converted}</td>
                    <td className="px-3 py-2 font-bold" style={{ color: '#44512C' }}>{v.conversion_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Popups list */}
        <section className="space-y-3">
          <h2 className="brand-display text-2xl" style={{ color: '#1F1B17' }}>פופאפים פעילים ולא פעילים</h2>
          {loading ? (
            <div className="text-sm" style={{ color: '#8B7F65' }}>טוען...</div>
          ) : popups.length === 0 ? (
            <div className="rounded-2xl p-6 text-center" style={{ background: '#FFFEFB', border: '1px dashed rgba(184,149,86,0.45)' }}>
              <div className="text-sm" style={{ color: '#44512C' }}>אין פופאפים עדיין. לחץ "טען ברירות מחדל" כדי להתחיל מ-6 וריאנטים מובנים, או "+ פופאפ חדש" כדי לבנות מאפס.</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {popups.map(p => (
                <div key={p.id} className="rounded-2xl p-4 space-y-2" style={{ background: '#FFFEFB', border: `1px solid ${p.is_active ? 'rgba(68,81,44,0.30)' : 'rgba(184,149,86,0.20)'}`, opacity: p.is_active ? 1 : 0.6 }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: '#B89556' }}>{p.variant} · עדיפות {p.priority}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {p.emoji && <span className="text-2xl">{p.emoji}</span>}
                        <h3 className="brand-display text-lg" style={{ color: '#1F1B17' }}>{p.title}</h3>
                      </div>
                    </div>
                    <button onClick={() => toggleActive(p)} className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1" style={p.is_active ? { background: '#44512C', color: '#F4ECD8' } : { background: '#F4ECD8', color: '#8B7F65', border: '1px solid #C8B889' }}>
                      {p.is_active ? 'פעיל' : 'כבוי'}
                    </button>
                  </div>
                  <p className="text-xs leading-snug" style={{ color: '#44512C' }}>{p.body}</p>
                  <div className="flex flex-wrap gap-1.5 text-[10px]">
                    {p.target_days && <span className="rounded-full px-2 py-0.5" style={{ background: 'rgba(184,149,86,0.15)', color: '#8B5A3A' }}>ימים: {String(p.target_days).split(',').map(d => DAY_NAMES[Number(d)] || d).join(',')}</span>}
                    {(p.target_hour_from != null || p.target_hour_to != null) && (
                      <span className="rounded-full px-2 py-0.5" style={{ background: 'rgba(184,149,86,0.15)', color: '#8B5A3A' }}>שעות: {p.target_hour_from ?? '*'}-{p.target_hour_to ?? '*'}</span>
                    )}
                    {p.cta_href && <span className="rounded-full px-2 py-0.5" style={{ background: 'rgba(68,81,44,0.10)', color: '#44512C' }}>→ {p.cta_href}</span>}
                  </div>
                  <div className="flex gap-2 pt-2 border-t" style={{ borderColor: 'rgba(184,149,86,0.25)' }}>
                    <button onClick={() => startEdit(p)} className="text-xs font-bold rounded-lg px-3 py-1.5" style={{ background: '#1F1B17', color: '#F4ECD8' }}>ערוך</button>
                    <button onClick={() => remove(p)} className="text-xs font-bold rounded-lg px-3 py-1.5" style={{ background: '#FFEBEB', color: '#A11A1A', border: '1px solid #F5C2C2' }}>מחק</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: 'rgba(31,27,23,0.55)' }} onClick={() => setEditing(null)}>
          <div className="w-full max-w-2xl rounded-3xl p-5 md:p-6 max-h-[92vh] overflow-y-auto" style={{ background: '#FFFEFB', border: '1px solid rgba(184,149,86,0.45)' }} onClick={(e) => e.stopPropagation()}>
            <h2 className="brand-display text-2xl mb-4" style={{ color: '#1F1B17' }}>{editing.id ? 'עריכת פופאפ' : 'פופאפ חדש'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <Field label="מזהה (variant, אנגלית-תיאורית)" required value={editing.variant} onChange={(v) => setEditing({ ...editing, variant: v })} />
              <Field label="עדיפות (גבוה = עדיף)" type="number" value={editing.priority} onChange={(v) => setEditing({ ...editing, priority: v })} />
              <Field label="כותרת עליונה קטנה (eyebrow)" value={editing.eyebrow} onChange={(v) => setEditing({ ...editing, eyebrow: v })} />
              <Field label="אימוג'י (תו אחד)" value={editing.emoji} onChange={(v) => setEditing({ ...editing, emoji: v })} />
              <Field className="md:col-span-2" label="כותרת ראשית" required value={editing.title} onChange={(v) => setEditing({ ...editing, title: v })} />
              <Field className="md:col-span-2" label="גוף הטקסט" textarea value={editing.body} onChange={(v) => setEditing({ ...editing, body: v })} />
              <Field label="טקסט כפתור CTA" value={editing.cta} onChange={(v) => setEditing({ ...editing, cta: v })} />
              <Field label="קישור CTA (ריק = גלול לטופס)" value={editing.cta_href} onChange={(v) => setEditing({ ...editing, cta_href: v })} placeholder="/EventsInquiry" />
              <Field label="ימים פעילים (CSV: 0=א׳, 6=ש׳)" value={editing.target_days} onChange={(v) => setEditing({ ...editing, target_days: v })} placeholder="ריק = כל יום" />
              <div className="grid grid-cols-2 gap-2">
                <Field label="שעה מ-" type="number" value={editing.target_hour_from} onChange={(v) => setEditing({ ...editing, target_hour_from: v })} placeholder="0-23" />
                <Field label="שעה עד-" type="number" value={editing.target_hour_to} onChange={(v) => setEditing({ ...editing, target_hour_to: v })} placeholder="0-24" />
              </div>
              <Field label="פעיל מ- (אופציונלי)" type="datetime-local" value={editing.starts_at} onChange={(v) => setEditing({ ...editing, starts_at: v })} />
              <Field label="פעיל עד- (אופציונלי)" type="datetime-local" value={editing.ends_at} onChange={(v) => setEditing({ ...editing, ends_at: v })} />
              <label className="md:col-span-2 flex items-center gap-2 cursor-pointer" style={{ color: '#1F1B17' }}>
                <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
                <span className="text-sm">פעיל</span>
              </label>
            </div>
            <div className="flex gap-2 mt-5 pt-4 border-t" style={{ borderColor: 'rgba(184,149,86,0.30)' }}>
              <button onClick={save} disabled={saving} className="flex-1 font-bold py-2.5 rounded-xl disabled:opacity-50" style={{ background: '#A04A2E', color: '#F4ECD8' }}>
                {saving ? 'שומר...' : 'שמור'}
              </button>
              <button onClick={() => setEditing(null)} className="px-5 py-2.5 rounded-xl font-bold" style={{ background: '#FFFEFB', color: '#44512C', border: '1px solid rgba(184,149,86,0.45)' }}>
                בטל
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder, required, textarea, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-bold mb-1" style={{ color: '#44512C' }}>{label} {required && <span style={{ color: '#A04A2E' }}>*</span>}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none"
          style={{ background: '#FAF5E8', border: '1px solid rgba(184,149,86,0.40)', color: '#1F1B17' }}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none"
          style={{ background: '#FAF5E8', border: '1px solid rgba(184,149,86,0.40)', color: '#1F1B17' }}
        />
      )}
    </label>
  );
}
