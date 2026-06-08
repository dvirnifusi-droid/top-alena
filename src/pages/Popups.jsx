import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Edit2, Trash2, Eye, EyeOff, Bell, Upload, Search } from 'lucide-react';
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

const ROLE_OPTIONS = [
  { value: 'owner', label: 'בעלים' },
  { value: 'admin', label: 'מנהל מערכת' },
  { value: 'manager', label: 'מנהל משמרת' },
  { value: 'employee', label: 'עובד' },
];

// Curated list of common pages with Hebrew labels.
// Page name must match a key in src/pages.config.js so /Page navigates correctly.
const PAGE_OPTIONS = [
  { value: '/Dashboard', label: 'לוח בקרה' },
  { value: '/EmployeeHome', label: 'דף הבית של העובד' },
  { value: '/AvailabilityForm', label: 'טופס זמינות' },
  { value: '/WorkScheduling', label: 'סידור עבודה' },
  { value: '/Checklists', label: 'צ\'קליסטים' },
  { value: '/ShiftEndReport', label: 'דוח סיום משמרת' },
  { value: '/ShiftChat', label: 'צ\'אט משמרת' },
  { value: '/Tips', label: 'ניהול טיפים' },
  { value: '/Incidents', label: 'תקריות' },
  { value: '/BriefingManagement', label: 'תדריכים' },
  { value: '/TablesManagement', label: 'ניהול שולחנות' },
  { value: '/RestroomCleaning', label: 'ניקיון שירותים' },
  { value: '/MarketingAdvisor', label: 'יועץ שיווק AI' },
  { value: '/Employees', label: 'רשימת עובדים' },
  { value: '/Reports', label: 'דוחות' },
  { value: '/Invoices', label: 'חשבוניות' },
  { value: '/Suppliers', label: 'ספקים' },
  { value: '/Deliveries', label: 'משלוחים' },
  { value: '/CustomerClub', label: 'מועדון לקוחות' },
  { value: '/RecruitmentInterviews', label: 'ראיונות וגיוס' },
  { value: '/Training', label: 'הכשרות' },
  { value: '/Leaderboard', label: 'טבלת מובילים' },
  { value: '/GamificationCenter', label: 'מרכז גיימיפיקציה' },
  { value: '/MyPerformance', label: 'הביצועים שלי' },
  { value: '/AvailabilityRequests', label: 'בקשות זמינות' },
  { value: '/LeaveRequests', label: 'בקשות חופשה' },
  { value: '/AiDashboard', label: 'מרכז בקרת AI' },
  { value: '/Popups', label: 'ניהול פופ-אפים' },
];

const EMPTY = {
  title: '', content: '', image_url: '', cta_text: '', cta_url: '',
  display_type: 'modal', schedule_type: 'immediate',
  scheduled_at: '', daily_time: '', weekly_day: 0, weekly_time: '',
  target_audience: 'all', target_roles: [], target_user_ids: [], target_page: '',
  seen_behavior: 'once', snooze_minutes: 60, is_active: true,
};

function parseList(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
}

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
  const [employees, setEmployees] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');

  const load = async () => {
    try {
      const res = await base44.functions.listPopups({});
      setPopups(Array.isArray(res?.data) ? res.data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Pre-load active employees for the "specific users" picker
    base44.entities.Employee.filter({ status: 'active' })
      .then(list => setEmployees(Array.isArray(list) ? list : []))
      .catch(() => setEmployees([]));
  }, []);

  // Group employees by position (Hebrew labels come from Employee.position field)
  const employeesByPosition = useMemo(() => {
    const groups = {};
    const filter = employeeSearch.trim().toLowerCase();
    for (const emp of employees) {
      if (filter && !(emp.full_name || '').toLowerCase().includes(filter)) continue;
      const pos = emp.position || 'ללא תפקיד';
      (groups[pos] = groups[pos] || []).push(emp);
    }
    return groups;
  }, [employees, employeeSearch]);

  const openNew = () => { setEditing(null); setForm(EMPTY); setShowForm(true); };
  const openEdit = (p) => {
    setEditing(p.id);
    setForm({
      ...EMPTY, ...p,
      weekly_day: p.weekly_day ?? 0,
      snooze_minutes: p.snooze_minutes ?? 60,
      target_roles: parseList(p.target_roles),
      target_user_ids: parseList(p.target_user_ids),
    });
    setShowForm(true);
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleInArray = (key, value) => setForm(f => {
    const arr = Array.isArray(f[key]) ? f[key] : [];
    return { ...f, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
  });

  const handleImageUpload = async (file) => {
    if (!file) return;
    setUploadingImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      if (file_url) set('image_url', file_url);
    } catch (e) {
      alert('שגיאה בהעלאת התמונה');
    } finally {
      setUploadingImage(false);
    }
  };

  const save = async () => {
    if (!form.title || !form.content) return alert('כותרת ותוכן הם שדות חובה');
    setSaving(true);
    try {
      const payload = {
        ...form,
        target_roles: form.target_roles?.length ? JSON.stringify(form.target_roles) : null,
        target_user_ids: form.target_user_ids?.length ? JSON.stringify(form.target_user_ids) : null,
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
        <button onClick={openNew} className="flex items-center gap-2 bg-[#44512C] text-white px-4 py-2 rounded-lg hover:bg-[#44512C] font-medium">
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
                    <label className="text-sm text-gray-600 block mb-1">תמונה</label>
                    <div className="flex gap-2">
                      <input
                        value={form.image_url}
                        onChange={e => set('image_url', e.target.value)}
                        className="flex-1 border rounded-lg px-3 py-2 text-sm"
                        placeholder="הדבק קישור או העלה קובץ"
                      />
                      <label className={`flex items-center gap-1 px-3 py-2 rounded-lg border text-sm cursor-pointer ${uploadingImage ? 'bg-gray-100 text-gray-400' : 'bg-[#F4ECD8] text-[#44512C] hover:bg-[#F4ECD8] border-[#E8D9B5]'}`}>
                        <Upload size={14} /> {uploadingImage ? 'מעלה...' : 'העלה'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingImage}
                          onChange={e => handleImageUpload(e.target.files?.[0])}
                        />
                      </label>
                    </div>
                    {form.image_url && (
                      <div className="mt-2 flex items-center gap-2">
                        <img src={form.image_url} alt="" className="h-16 w-16 object-cover rounded-lg border" />
                        <button onClick={() => set('image_url', '')} className="text-xs text-red-500 hover:underline">הסר תמונה</button>
                      </div>
                    )}
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
                      className={`border rounded-xl p-3 text-center transition-all ${form.display_type === d.value ? 'border-[#44512C] bg-[#F4ECD8]' : 'hover:border-gray-300'}`}
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
                      className={`border rounded-lg px-3 py-2 text-sm text-right transition-all ${form.schedule_type === s.value ? 'border-[#44512C] bg-[#F4ECD8] font-medium' : 'hover:border-gray-300'}`}
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
                      className={`border rounded-lg px-3 py-2 text-sm text-right transition-all ${form.target_audience === a.value ? 'border-[#44512C] bg-[#F4ECD8] font-medium' : 'hover:border-gray-300'}`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
                {form.target_audience === 'roles' && (
                  <div className="border rounded-lg p-3 bg-gray-50">
                    <div className="text-xs text-gray-500 mb-2">בחר תפקיד אחד או יותר:</div>
                    <div className="grid grid-cols-2 gap-2">
                      {ROLE_OPTIONS.map(r => {
                        const checked = form.target_roles?.includes(r.value);
                        return (
                          <label key={r.value} className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${checked ? 'border-[#44512C] bg-[#F4ECD8] font-medium' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                            <input
                              type="checkbox"
                              checked={!!checked}
                              onChange={() => toggleInArray('target_roles', r.value)}
                              className="accent-blue-600"
                            />
                            {r.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                {form.target_audience === 'users' && (
                  <div className="border rounded-lg p-3 bg-gray-50">
                    <div className="flex items-center gap-2 mb-2">
                      <Search size={14} className="text-gray-400" />
                      <input
                        value={employeeSearch}
                        onChange={e => setEmployeeSearch(e.target.value)}
                        placeholder="חפש עובד לפי שם..."
                        className="flex-1 border rounded-md px-2 py-1 text-sm bg-white"
                      />
                      <span className="text-xs text-gray-500">
                        נבחרו {form.target_user_ids?.length || 0}
                      </span>
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-3">
                      {Object.keys(employeesByPosition).length === 0 ? (
                        <div className="text-center text-sm text-gray-400 py-4">
                          {employees.length === 0 ? 'טוען עובדים...' : 'אין עובדים שתואמים לחיפוש'}
                        </div>
                      ) : (
                        Object.entries(employeesByPosition).map(([position, emps]) => (
                          <div key={position}>
                            <div className="text-xs font-semibold text-gray-500 mb-1">{position} ({emps.length})</div>
                            <div className="grid grid-cols-2 gap-1">
                              {emps.map(emp => {
                                const checked = form.target_user_ids?.includes(emp.id);
                                return (
                                  <label key={emp.id} className={`flex items-center gap-2 border rounded-md px-2 py-1 text-sm cursor-pointer transition-colors ${checked ? 'border-[#44512C] bg-[#F4ECD8] font-medium' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                                    <input
                                      type="checkbox"
                                      checked={!!checked}
                                      onChange={() => toggleInArray('target_user_ids', emp.id)}
                                      className="accent-blue-600"
                                    />
                                    <span className="truncate">{emp.full_name || emp.id}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
                {form.target_audience === 'page' && (
                  <div className="border rounded-lg p-3 bg-gray-50">
                    <div className="text-xs text-gray-500 mb-2">בחר את העמוד בו הפופ-אפ יופיע:</div>
                    <select
                      value={form.target_page}
                      onChange={e => set('target_page', e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    >
                      <option value="">-- בחר עמוד --</option>
                      {PAGE_OPTIONS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
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
                      className={`border rounded-lg px-3 py-2 text-sm text-center transition-all ${form.seen_behavior === b.value ? 'border-[#44512C] bg-[#F4ECD8] font-medium' : 'hover:border-gray-300'}`}
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
                  className={`relative w-12 h-6 rounded-full transition-colors ${form.is_active ? 'bg-[#44512C]' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.is_active ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-3">
              <button onClick={save} disabled={saving} className="flex-1 bg-[#44512C] text-white py-2.5 rounded-xl font-semibold hover:bg-[#44512C] disabled:opacity-50">
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
