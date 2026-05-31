import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Edit2, Trash2, Eye, EyeOff, Bell, Megaphone, Square } from 'lucide-react';
import PageGuard from '@/components/shared/PageGuard';

const DISPLAY_TYPES = [
  { value: 'modal', label: 'מודאל (חוסם מסך)', icon: '🪟' },
  { value: 'toast', label: 'טוסט (פינה)', icon: '🔔' },
  { value: 'banner', label: 'באנר (פס עליון)', icon: '📢' },
];
const SCHEDULE_TYPES = [
  { value: 'immediate', label: 'מיידי' },
  { value: 'once', label: 'חד-פעמי (בתאריך/שעה)' },
  { value: 'daily', label: 'יומי (שעה קבועה)' },
  { value: 'weekly', label: 'שבועי (יום + שעה)' },
];
const SEEN_BEHAVIORS = [
  { value: 'once', label: 'פעם אחת בלבד' },
  { value: 'always', label: 'בכל פעם שמתאים' },
  { value: 'snooze', label: 'אפשרות דחייה' },
];
const TARGET_AUDIENCE = [
  { value: 'all', label: 'כולם' },
  { value: 'roles', label: 'לפי תפקיד' },
  { value: 'users', label: 'משתמשים ספציפיים' },
  { value: 'page', label: 'לפי עמוד' },
];
const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const EMPTY = {
  title: '', content: '', image_url: '', cta_text: '', cta_url: '',
  display_type: 'modal', schedule_type: 'immediate',
  scheduled_at: '', daily_time: '', weekly_day: 0, weekly_time: '',
  target_audience: 'all', target_roles: '', target_user_ids: '', target_page: '',
  seen_behavior: 'once', snooze_minutes: 60, is_active: true,
};

export default function Popups() {
  return (
    <PageGuard pageName="Popups" pageTitle="פופ-אפים מתוזמנים">
      <PopupsInner />
    </PageGuard>
  );
}

function PopupsInner() {
  const [popups, setPopups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await base44.functions.listPopups({});
      setPopups(Array.isArray(res?.data) ? res.data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(EMPTY); setShowForm(true); };
  const openEdit = (p) => {
    setEditing(p.id);
    setForm({
      ...EMPTY, ...p,
      weekly_day: p.weekly_day ?? 0,
      snooze_minutes: p.snooze_minutes ?? 60,
      target_roles: Array.isArray(p.target_roles) ? p.target_roles.join(', ') : (p.target_roles || ''),
      target_user_ids: Array.isArray(p.target_user_ids) ? p.target_user_ids.join(', ') : (p.target_user_ids || ''),
    });
    setShowForm(true);
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title || !form.content) return alert('כותרת ותוכן הם שדות חובה');
    setSaving(true);
    try {
      const payload = {
        ...form,
        target_roles: form.target_roles ? JSON.stringify(form.target_roles.split(',').map(s => s.trim()).filter(Boolean)) : null,
        target_user_ids: form.target_user_ids ? JSON.stringify(form.target_user_ids.split(',').map(s => s.trim()).filter(Boolean)) : null,
        weekly_day: Number(form.weekly_day),
        snooze_minutes: Number(form.snooze_minutes),
      };
      if (editing) {
        await base44.functions.updatePopup({ id: editing, ...payload });
      } else {
        await base44.functions.createPopup(payload);
      }
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (p) => {
    await base44.functions.updatePopup({ id: p.id, is_active: !p.is_active });
    load();
  };

  const del = async (p) => {
    if (!confirm(`למחוק את הפופ-אפ "${p.title}"?`)) return;
    await base44.functions.deletePopup({ id: p.id });
    load();
  };

  const typeIcon = (t) => ({ modal: '🪟', toast: '🔔', banner: '📢' }[t] || '📋');
  const scheduleLabel = (p) => {
    if (p.schedule_type === 'immediate') return 'מיידי';
    if (p.schedule_type === 'once') return `פעם: ${p.scheduled_at?.slice(0, 16).replace('T', ' ')}`;
    if (p.schedule_type === 'daily') return `יומי ${p.daily_time}`;
    if (p.schedule_type === 'weekly') return `${WEEKDAYS[p.weekly_day]} ${p.weekly_time}`;
    return '';
  };

  return (
    <div className="p-4 max-w-5xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ניהול פופ-אפים</h1>
          <p className="text-gray-500 text-sm mt-1">הודעות מתוזמנות לעובדים ולמשתמשים</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium">
          <Plus size={18} /> פופ-אפ חדש
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-16">טוען...</div>
      ) : popups.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          <Bell size={48} className="mx-auto mb-3 opacity-30" />
          <p>עדיין אין פופ-אפים. צור את הראשון!</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {popups.map(p => (
            <div key={p.id} className={`bg-white rounded-xl border p-4 flex items-center gap-4 shadow-sm ${!p.is_active ? 'opacity-50' : ''}`}>
              <span className="text-2xl">{typeIcon(p.display_type)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{p.title}</span>
                  {!p.is_active && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">כבוי</span>}
                </div>
                <p className="text-sm text-gray-500 truncate mt-0.5">{p.content}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span>{scheduleLabel(p)}</span>
                  <span>•</span>
                  <span>קהל: {TARGET_AUDIENCE.find(t => t.value === p.target_audience)?.label}</span>
                  <span>•</span>
                  <span>{p._count?.views ?? 0} צפיות</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggle(p)} title={p.is_active ? 'כבה' : 'הפעל'} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                  {p.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                  <Edit2 size={16} />
                </button>
                <button onClick={() => del(p)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form drawer */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" dir="rtl">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{editing ? 'עריכת פופ-אפ' : 'פופ-אפ חדש'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-6 space-y-5">

              {/* תוכן */}
              <section>
                <h3 className="font-semibold text-gray-700 mb-3">תוכן</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">כותרת *</label>
                    <input value={form.title} onChange={e => set('title', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="כותרת הפופ-אפ" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">תוכן *</label>
                    <textarea value={form.content} onChange={e => set('content', e.target.value)} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="טקסט ההודעה" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">תמונה (URL)</label>
                    <input value={form.image_url} onChange={e => set('image_url', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="https://..." />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-sm text-gray-600 block mb-1">טקסט כפתור</label>
                      <input value={form.cta_text} onChange={e => set('cta_text', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="לחץ כאן" />
                    </div>
                    <div className="flex-1">
                      <label className="text-sm text-gray-600 block mb-1">קישור כפתור</label>
                      <input value={form.cta_url} onChange={e => set('cta_url', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="https://..." />
                    </div>
                  </div>
                </div>
              </section>

              {/* עיצוב */}
              <section>
                <h3 className="font-semibold text-gray-700 mb-3">סוג תצוגה</h3>
                <div className="grid grid-cols-3 gap-2">
                  {DISPLAY_TYPES.map(d => (
                    <button
                      key={d.value}
                      onClick={() => set('display_type', d.value)}
                      className={`border rounded-xl p-3 text-center transition-all ${form.display_type === d.value ? 'border-blue-500 bg-blue-50' : 'hover:border-gray-300'}`}
                    >
                      <div className="text-2xl mb-1">{d.icon}</div>
                      <div className="text-xs font-medium">{d.label}</div>
                    </button>
                  ))}
                </div>
              </section>

              {/* תזמון */}
              <section>
                <h3 className="font-semibold text-gray-700 mb-3">תזמון</h3>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {SCHEDULE_TYPES.map(s => (
                    <button
                      key={s.value}
                      onClick={() => set('schedule_type', s.value)}
                      className={`border rounded-lg px-3 py-2 text-sm text-right transition-all ${form.schedule_type === s.value ? 'border-blue-500 bg-blue-50 font-medium' : 'hover:border-gray-300'}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                {form.schedule_type === 'once' && (
                  <input type="datetime-local" value={form.scheduled_at} onChange={e => set('scheduled_at', e.target.value)} className="border rounded-lg px-3 py-2 text-sm w-full" />
                )}
                {form.schedule_type === 'daily' && (
                  <input type="time" value={form.daily_time} onChange={e => set('daily_time', e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
                )}
                {form.schedule_type === 'weekly' && (
                  <div className="flex gap-3">
                    <select value={form.weekly_day} onChange={e => set('weekly_day', Number(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
                      {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                    <input type="time" value={form.weekly_time} onChange={e => set('weekly_time', e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
                  </div>
                )}
              </section>

              {/* קהל יעד */}
              <section>
                <h3 className="font-semibold text-gray-700 mb-3">קהל יעד</h3>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {TARGET_AUDIENCE.map(a => (
                    <button
                      key={a.value}
                      onClick={() => set('target_audience', a.value)}
                      className={`border rounded-lg px-3 py-2 text-sm text-right transition-all ${form.target_audience === a.value ? 'border-blue-500 bg-blue-50 font-medium' : 'hover:border-gray-300'}`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
                {form.target_audience === 'roles' && (
                  <input value={form.target_roles} onChange={e => set('target_roles', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="תפקידים מופרדים בפסיק: admin, manager" />
                )}
                {form.target_audience === 'users' && (
                  <input value={form.target_user_ids} onChange={e => set('target_user_ids', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="מזהי משתמשים מופרדים בפסיק" />
                )}
                {form.target_audience === 'page' && (
                  <input value={form.target_page} onChange={e => set('target_page', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="/Dashboard" />
                )}
              </section>

              {/* התנהגות */}
              <section>
                <h3 className="font-semibold text-gray-700 mb-3">התנהגות חזרה</h3>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {SEEN_BEHAVIORS.map(b => (
                    <button
                      key={b.value}
                      onClick={() => set('seen_behavior', b.value)}
                      className={`border rounded-lg px-3 py-2 text-sm text-center transition-all ${form.seen_behavior === b.value ? 'border-blue-500 bg-blue-50 font-medium' : 'hover:border-gray-300'}`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                {form.seen_behavior === 'snooze' && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">דחייה של</label>
                    <input type="number" min={5} value={form.snooze_minutes} onChange={e => set('snooze_minutes', e.target.value)} className="border rounded-lg px-3 py-2 text-sm w-24" />
                    <label className="text-sm text-gray-600">דקות</label>
                  </div>
                )}
              </section>

              {/* פעיל */}
              <div className="flex items-center gap-3 pt-1">
                <label className="text-sm font-medium text-gray-700">פעיל מיד</label>
                <button
                  onClick={() => set('is_active', !form.is_active)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${form.is_active ? 'bg-blue-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.is_active ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-3">
              <button onClick={save} disabled={saving} className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'שומר...' : editing ? 'שמור שינויים' : 'צור פופ-אפ'}
              </button>
              <button onClick={() => setShowForm(false)} className="px-6 py-2.5 border rounded-xl text-gray-600 hover:bg-gray-50">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
