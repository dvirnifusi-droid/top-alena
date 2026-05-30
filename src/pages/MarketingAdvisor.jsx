import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

// ─── The questionnaire — grouped into sections so the owner answers in batches ───
const QUESTIONS = [
  {
    section: '🏪 פרטי העסק',
    fields: [
      { key: 'business_name', label: 'שם העסק', type: 'text', required: true },
      { key: 'business_type', label: 'סוג העסק', type: 'select',
        options: ['מסעדה', 'קיוסק', 'בר יין', 'בית קפה', 'בר', 'קייטרינג', 'משלוחים בלבד', 'אחר'] },
      { key: 'location_city', label: 'עיר/יישוב', type: 'text' },
      { key: 'location_address', label: 'כתובת מלאה', type: 'text' },
      { key: 'delivery_radius_km', label: 'רדיוס משלוחים (ק"מ)', type: 'number' },
      { key: 'is_kosher', label: 'העסק כשר?', type: 'bool' },
      { key: 'opening_hours', label: 'שעות פתיחה (טקסט חופשי — למשל "א-ה 11:00-23:00, שישי עד 15:00, שבת סגור")', type: 'longtext' },
    ],
  },
  {
    section: '🎨 מותג וקונספט',
    fields: [
      { key: 'concept', label: 'מה הקונספט / סגנון המטבח?', type: 'longtext', placeholder: 'למשל: המבורגר שף, איטלקיה ביתית, טבעוני בריאות' },
      { key: 'brand_persona', label: 'אם העסק היה בן אדם — איזה אדם הוא היה?', type: 'longtext' },
      { key: 'visual_show', label: 'מה ה"שואו" הוויזואלי / הייחודיות הוויזואלית?', type: 'longtext' },
      { key: 'logo_url', label: 'קישור ללוגו (אופציונלי)', type: 'text' },
    ],
  },
  {
    section: '🍽️ מוצרים ומה נמכר',
    fields: [
      { key: 'flagship_dishes', label: '3 מנות הדגל שלך', type: 'longtext', placeholder: '1. ...\n2. ...\n3. ...' },
      { key: 'best_sellers', label: 'מה הכי נמכר היום?', type: 'longtext' },
      { key: 'high_margin_items', label: 'איזה מוצרים יש להם הרווחיות הכי גבוהה?', type: 'longtext' },
      { key: 'primary_offering', label: 'מה ההצעה המרכזית — מה מביא רוב ההכנסות?', type: 'longtext' },
      { key: 'menu_link', label: 'קישור לתפריט (אם יש)', type: 'text' },
    ],
  },
  {
    section: '👥 קהל ולקוחות',
    fields: [
      { key: 'target_audience', label: 'מי הלקוח האידיאלי? (גיל / מגדר / תחומי עניין / כאבים)', type: 'longtext' },
      { key: 'current_audience', label: 'מי בפועל ממלא את המקום היום?', type: 'longtext' },
      { key: 'buying_mode', label: 'איך הלקוחות קונים בעיקר?', type: 'multiselect',
        options: ['ישיבה במקום', 'משלוחים (וולט/תן ביס)', 'איסוף עצמי (Takeaway)', 'אירועים', 'מנויים'] },
      { key: 'value_prop', label: 'למה לקנות דווקא ממך ולא ממתחרים?', type: 'longtext' },
    ],
  },
  {
    section: '⏰ פעילות וביצועים',
    fields: [
      { key: 'strong_days', label: 'מתי הימים החזקים?', type: 'longtext' },
      { key: 'weak_days', label: 'מתי הימים החלשים / מאתגרים?', type: 'longtext' },
      { key: 'strong_hours', label: 'מתי השעות החזקות?', type: 'longtext' },
      { key: 'monthly_revenue', label: 'מחזור חודשי ממוצע (₪)', type: 'number' },
      { key: 'avg_order_value', label: 'שווי קנייה ממוצע — AOV (₪)', type: 'number' },
      { key: 'conversion_rate', label: 'אחוז המרה (אם ידוע, %)', type: 'number' },
      { key: 'repeat_customer_pct', label: 'אחוז לקוחות חוזרים (%)', type: 'number' },
      { key: 'ltv_estimate', label: 'אורך חיי לקוח / סכום מצטבר ללקוח חוזר (₪)', type: 'number' },
    ],
  },
  {
    section: '💰 שיווק היום',
    fields: [
      { key: 'current_marketing', label: 'אילו פעולות שיווק אתה עושה היום?', type: 'longtext' },
      { key: 'current_marketing_cost', label: 'כמה אתה משלם עליהן כיום בחודש (₪)?', type: 'number' },
      { key: 'monthly_budget', label: 'תקציב שיווק חודשי פנוי לקמפיינים (₪)', type: 'number', required: true },
      { key: 'platforms_active', label: 'באילו פלטפורמות אתה פעיל?', type: 'multiselect',
        options: ['Instagram', 'Facebook', 'TikTok', 'Google', 'WhatsApp', 'מייל', 'דיוור SMS', 'אתר', 'אף אחת'] },
      { key: 'website_url', label: 'אתר קיים (אם יש)', type: 'text' },
    ],
  },
  {
    section: '🎬 משאבים אישיים',
    fields: [
      { key: 'weekly_owner_time_hours', label: 'כמה שעות בשבוע אתה יכול להקדיש לשיווק?', type: 'number', required: true },
      { key: 'team_resources', label: 'מי מבצע את המשימות? (אתה לבד / יש איש שיווק / מעצב / עורך וידאו)', type: 'longtext' },
      { key: 'willing_to_film', label: 'האם אתה מוכן להצטלם לוידאו (טיקטוק/רילס)?', type: 'bool' },
      { key: 'main_challenge', label: 'מה האתגר השיווקי המרכזי שלך כרגע?', type: 'longtext' },
      { key: 'six_month_goal', label: 'איך תיראה הצלחה בעוד 6 חודשים? (מספרים אם אפשר)', type: 'longtext' },
    ],
  },
];

// ─── Component ───
export default function MarketingAdvisor() {
  const [tab, setTab] = useState('profile'); // profile | strategy | tasks | chat | progress
  const [profile, setProfile] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [strategy, setStrategy] = useState(null);
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [pRes, tList, sList] = await Promise.all([
        base44.functions.getBusinessProfile({}).catch(() => ({ data: { profile: null } })),
        base44.entities.MarketingTask.list?.('-due_date', 200).catch(() => []),
        base44.entities.MarketingStrategy.list?.('-created_date', 1).catch(() => []),
      ]);
      setProfile(pRes?.data?.profile || null);
      setTasks(Array.isArray(tList) ? tList : []);
      setStrategy(Array.isArray(sList) && sList[0] ? sList[0] : null);
      // Decide which tab to land on
      const p = pRes?.data?.profile;
      if (!p?.completed) setTab('profile');
      else if (!sList?.[0]) setTab('strategy');
      else setTab('tasks');
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, []);

  const completion = (() => {
    if (!profile?.profile_data) return 0;
    const total = QUESTIONS.flatMap(s => s.fields).length;
    const answered = QUESTIONS.flatMap(s => s.fields).filter(f => {
      const v = profile.profile_data[f.key];
      if (Array.isArray(v)) return v.length > 0;
      return v !== undefined && v !== null && String(v).trim() !== '';
    }).length;
    return Math.round((answered / total) * 100);
  })();

  return (
    <div dir="rtl" className="max-w-4xl mx-auto p-3 sm:p-5 space-y-4">
      <header className="text-center">
        <div className="text-4xl mb-2">🚀</div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900">היועץ השיווקי שלך</h1>
        <p className="text-slate-500 text-sm">שואל אותך, מבין את העסק, ומכין לך תכנית 6 חודשים עם משימות יומיות</p>
        {profile && (
          <div className="mt-3 inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1.5 text-xs">
            <span className="font-bold text-slate-700">{profile.business_name || '—'}</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500">השלמת פרופיל: {completion}%</span>
            <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden ml-1">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${completion}%` }} />
            </div>
          </div>
        )}
      </header>

      {/* Tabs */}
      <nav className="bg-white border border-slate-200 rounded-2xl p-1.5 flex flex-wrap gap-1.5 sticky top-0 z-10 shadow-sm">
        {[
          { k: 'profile',  label: '🏪 פרופיל' },
          { k: 'strategy', label: '🎯 אסטרטגיה' },
          { k: 'tasks',    label: '📋 משימות' },
          { k: 'chat',     label: '💬 שאל את היועץ' },
          { k: 'progress', label: '📈 התקדמות' },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`flex-1 min-w-[100px] px-3 py-2 rounded-xl text-sm font-bold transition ${
              tab === t.k ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loading && <p className="text-center text-slate-400 py-12">טוען…</p>}

      {!loading && tab === 'profile' && (
        <ProfileForm profile={profile} onSaved={loadAll} />
      )}
      {!loading && tab === 'strategy' && (
        <StrategyView
          profile={profile}
          strategy={strategy}
          generating={generating}
          onGenerate={async () => {
            setGenerating(true);
            try {
              await base44.functions.generateMarketingStrategy({});
              await loadAll();
            } catch (e) {
              alert('שגיאה ביצירת האסטרטגיה: ' + (e?.message || ''));
            } finally { setGenerating(false); }
          }}
        />
      )}
      {!loading && tab === 'tasks' && (
        <TasksView tasks={tasks} onChange={loadAll} hasProfile={!!profile?.completed} />
      )}
      {!loading && tab === 'chat' && (
        <ChatView chat={chat} setChat={setChat} input={chatInput} setInput={setChatInput} sending={chatSending} setSending={setChatSending} />
      )}
      {!loading && tab === 'progress' && (
        <ProgressView tasks={tasks} strategy={strategy} profile={profile} />
      )}
    </div>
  );
}

// ─── Profile questionnaire form ───
function ProfileForm({ profile, onSaved }) {
  const [data, setData] = useState(profile?.profile_data || {});
  const [saving, setSaving] = useState(false);

  const update = (k, v) => setData(d => ({ ...d, [k]: v }));

  const save = async (markComplete = false) => {
    setSaving(true);
    try {
      const payload = { ...data, completed: markComplete };
      // Promote a few fields to typed columns
      payload.business_name = data.business_name || '';
      payload.business_type = data.business_type || '';
      payload.logo_url = data.logo_url || '';
      payload.is_kosher = !!data.is_kosher;
      payload.monthly_budget = typeof data.monthly_budget === 'number' ? data.monthly_budget : Number(data.monthly_budget) || null;
      payload.weekly_owner_time_hours = typeof data.weekly_owner_time_hours === 'number' ? data.weekly_owner_time_hours : Number(data.weekly_owner_time_hours) || null;
      await base44.functions.saveBusinessProfile({ profile: payload });
      await onSaved();
    } catch (e) { alert('שגיאה בשמירה'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      {QUESTIONS.map(section => (
        <section key={section.section} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <h2 className="font-black text-slate-800 mb-3">{section.section}</h2>
          <div className="space-y-3">
            {section.fields.map(f => (
              <FieldRow key={f.key} field={f} value={data[f.key]} onChange={(v) => update(f.key, v)} />
            ))}
          </div>
        </section>
      ))}

      <div className="sticky bottom-3 bg-white border border-slate-200 rounded-2xl p-3 shadow-lg flex gap-2 flex-wrap">
        <button
          disabled={saving}
          onClick={() => save(false)}
          className="flex-1 min-w-[140px] bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-700 font-bold py-2.5 rounded-xl disabled:opacity-50"
        >
          {saving ? 'שומר…' : '💾 שמור טיוטה'}
        </button>
        <button
          disabled={saving}
          onClick={() => save(true)}
          className="flex-1 min-w-[140px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl disabled:opacity-50"
        >
          {saving ? 'שומר…' : '✅ סיימתי לענות — סגור פרופיל'}
        </button>
      </div>
    </div>
  );
}

function FieldRow({ field: f, value, onChange }) {
  if (f.type === 'longtext') {
    return (
      <label className="block">
        <span className="text-sm font-bold text-slate-700 block mb-1">{f.label}{f.required && <span className="text-red-500"> *</span>}</span>
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={f.placeholder}
          rows={3}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
        />
      </label>
    );
  }
  if (f.type === 'select') {
    return (
      <label className="block">
        <span className="text-sm font-bold text-slate-700 block mb-1">{f.label}{f.required && <span className="text-red-500"> *</span>}</span>
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
          <option value="">— בחר —</option>
          {f.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  if (f.type === 'multiselect') {
    const cur = Array.isArray(value) ? value : [];
    return (
      <div>
        <p className="text-sm font-bold text-slate-700 mb-1">{f.label}</p>
        <div className="flex flex-wrap gap-2">
          {f.options.map(o => {
            const on = cur.includes(o);
            return (
              <button
                key={o}
                onClick={() => onChange(on ? cur.filter(x => x !== o) : [...cur, o])}
                className={`px-3 py-1.5 rounded-full text-sm font-bold border-2 transition ${on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400'}`}
              >
                {o}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  if (f.type === 'bool') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="w-5 h-5 accent-emerald-600" />
        <span className="text-sm font-bold text-slate-700">{f.label}</span>
      </label>
    );
  }
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700 block mb-1">{f.label}{f.required && <span className="text-red-500"> *</span>}</span>
      <input
        type={f.type === 'number' ? 'number' : 'text'}
        value={value ?? ''}
        onChange={(e) => onChange(f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
        placeholder={f.placeholder}
        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
      />
    </label>
  );
}

// ─── Strategy tab ───
function StrategyView({ profile, strategy, generating, onGenerate }) {
  if (!profile?.completed) {
    return (
      <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 text-center">
        <div className="text-3xl mb-2">🏪</div>
        <p className="font-black text-amber-800 mb-1">קודם נסגור את הפרופיל</p>
        <p className="text-amber-700 text-sm">לפני שאני בונה אסטרטגיה, צריך לדעת על העסק שלך הכל. עבור ל"פרופיל" וסיים לענות.</p>
      </div>
    );
  }
  if (!strategy) {
    return (
      <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-6 text-center">
        <div className="text-4xl mb-3">🎯</div>
        <p className="font-black text-emerald-900 text-base mb-2">מוכן ליצור את האסטרטגיה שלך</p>
        <p className="text-emerald-700 text-sm mb-4">אנתח את הפרופיל ואייצר תכנית 6 חודשים — חודש‑חודש, ואת ה‑10-15 משימות הראשונות.</p>
        <button onClick={onGenerate} disabled={generating} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black px-6 py-3 rounded-2xl shadow-lg">
          {generating ? '🤔 מייצר... יכול לקחת ~30 שניות' : '🚀 צור אסטרטגיה'}
        </button>
      </div>
    );
  }
  const months = Array.isArray(strategy?.months_plan) ? strategy.months_plan : [];
  return (
    <div className="space-y-3">
      <div className="bg-gradient-to-l from-emerald-600 to-teal-600 text-white rounded-2xl p-5">
        <p className="text-xs opacity-80">🎯 היעד</p>
        <p className="font-black text-base">{strategy.goal_summary}</p>
      </div>
      <div className="space-y-2">
        {months.map((m, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-black text-slate-800">חודש {m.month || i + 1} · {m.focus || ''}</p>
              {m.theme && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-bold">{m.theme}</span>}
            </div>
            {Array.isArray(m.expected_outcomes) && m.expected_outcomes.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-bold text-slate-600 mb-1">📊 תוצאות צפויות:</p>
                <ul className="text-sm text-slate-700 list-disc pr-4 space-y-0.5">
                  {m.expected_outcomes.map((o, j) => <li key={j}>{o}</li>)}
                </ul>
              </div>
            )}
            {Array.isArray(m.milestones) && m.milestones.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-bold text-slate-600 mb-1">🎯 אבני דרך:</p>
                <ul className="text-sm text-slate-700 list-disc pr-4 space-y-0.5">
                  {m.milestones.map((o, j) => <li key={j}>{o}</li>)}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
      <button onClick={onGenerate} disabled={generating} className="w-full bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-700 font-bold py-2.5 rounded-xl disabled:opacity-50 text-sm">
        {generating ? '🤔 מייצר מחדש...' : '🔄 צור אסטרטגיה חדשה (יחליף את הקודמת)'}
      </button>
    </div>
  );
}

// ─── Tasks tab ───
function TasksView({ tasks, onChange, hasProfile }) {
  const [expanded, setExpanded] = useState(null); // task id whose expansion is loading/showing
  const [expansionCache, setExpansionCache] = useState({});
  const [loadingExp, setLoadingExp] = useState(false);
  const [generatingMore, setGeneratingMore] = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);
  const pending = tasks.filter(t => t.status !== 'completed');
  const completed = tasks.filter(t => t.status === 'completed');
  const today = pending.filter(t => (t.due_date || '') <= todayStr);
  const upcoming = pending.filter(t => (t.due_date || '') > todayStr);

  const markComplete = async (t) => {
    try {
      await base44.entities.MarketingTask.update(t.id, { status: 'completed', completion_date: new Date().toISOString().slice(0, 10) });
      await onChange();
    } catch { alert('שגיאה בעדכון'); }
  };

  const expand = async (t) => {
    if (expanded === t.id) { setExpanded(null); return; }
    setExpanded(t.id);
    if (expansionCache[t.id]) return;
    setLoadingExp(true);
    try {
      const res = await base44.functions.expandMarketingTask({ task_id: t.id });
      setExpansionCache(c => ({ ...c, [t.id]: res?.data?.expansion || null }));
    } catch { setExpansionCache(c => ({ ...c, [t.id]: { error: true } })); }
    finally { setLoadingExp(false); }
  };

  const generateMore = async () => {
    setGeneratingMore(true);
    try {
      await base44.functions.generateNextMarketingTasks({ count: 7 });
      await onChange();
    } catch (e) { alert('שגיאה ביצירת משימות'); }
    finally { setGeneratingMore(false); }
  };

  if (!hasProfile) {
    return (
      <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 text-center">
        <p className="font-black text-amber-800 mb-1">צריך פרופיל ואסטרטגיה לפני שיש משימות</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Section title={`📍 היום + עבר (${today.length})`} empty="כל הכבוד, אתה עדכני 👏">
        {today.map(t => (
          <TaskCard key={t.id} t={t} onComplete={markComplete} onExpand={expand} expanded={expanded === t.id} expansion={expansionCache[t.id]} loadingExp={loadingExp && expanded === t.id} />
        ))}
      </Section>
      <Section title={`📅 הבאות בתור (${upcoming.length})`} empty="אין משימות מתוזמנות. צור עוד למטה.">
        {upcoming.slice(0, 20).map(t => (
          <TaskCard key={t.id} t={t} onComplete={markComplete} onExpand={expand} expanded={expanded === t.id} expansion={expansionCache[t.id]} loadingExp={loadingExp && expanded === t.id} />
        ))}
      </Section>
      <button onClick={generateMore} disabled={generatingMore} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl disabled:opacity-50">
        {generatingMore ? '🤔 מייצר…' : '✨ ייצר 7 משימות חדשות'}
      </button>
      {completed.length > 0 && (
        <details className="bg-white border border-slate-200 rounded-2xl p-3">
          <summary className="font-bold text-slate-700 cursor-pointer text-sm">✅ הושלמו ({completed.length})</summary>
          <div className="mt-3 space-y-2">
            {completed.slice(0, 20).map(t => (
              <div key={t.id} className="border border-slate-100 rounded-xl p-2 bg-slate-50 text-xs opacity-70">
                <p className="font-bold line-through">{t.title}</p>
                <p className="text-slate-500">{t.completion_date}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Section({ title, empty, children }) {
  return (
    <div>
      <p className="font-black text-slate-800 mb-2">{title}</p>
      {React.Children.count(children) === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center text-slate-400 text-sm">{empty}</div>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

const TYPE_STYLES = {
  online:  { label: '🌐 דיגיטל', cls: 'bg-blue-100 text-blue-700' },
  offline: { label: '🏃 שטח',  cls: 'bg-amber-100 text-amber-700' },
};
const PRIORITY_STYLES = {
  high:   'border-red-300 bg-red-50/40',
  medium: 'border-slate-200 bg-white',
  low:    'border-slate-100 bg-slate-50/40',
};

function TaskCard({ t, onComplete, onExpand, expanded, expansion, loadingExp }) {
  const ts = TYPE_STYLES[t.task_type] || TYPE_STYLES.online;
  return (
    <div className={`border-2 rounded-2xl p-3 ${PRIORITY_STYLES[t.priority] || PRIORITY_STYLES.medium}`}>
      <div className="flex items-start gap-2">
        <button onClick={() => onComplete(t)} title="סמן כהושלם" className="w-7 h-7 rounded-full border-2 border-emerald-400 hover:bg-emerald-50 flex items-center justify-center text-emerald-600 font-black text-sm flex-shrink-0">
          ✓
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-800">{t.title}</p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${ts.cls}`}>{ts.label}</span>
            {t.platform && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">{t.platform}</span>}
            {t.estimated_time && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">⏱ {t.estimated_time} דק'</span>}
            {t.budget_required > 0 && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">💸 ₪{t.budget_required}</span>}
            {t.due_date && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">📅 {t.due_date}</span>}
          </div>
          <p className="text-sm text-slate-600 mt-1.5">{t.description}</p>
          {t.ai_reasoning && (
            <p className="text-xs text-indigo-700 mt-1 italic">💡 {t.ai_reasoning}</p>
          )}
          <button onClick={() => onExpand(t)} className="text-xs text-emerald-700 font-bold mt-2 underline">
            {expanded ? '▲ סגור הסבר' : '📖 הסבר לי בפירוט איך לעשות'}
          </button>
          {expanded && (
            <div className="mt-2 bg-white rounded-xl border border-slate-200 p-3">
              {loadingExp && <p className="text-sm text-slate-500">🤔 חושב...</p>}
              {expansion?.error && <p className="text-sm text-red-500">לא הצלחתי להפיק הסבר. נסה שוב.</p>}
              {expansion && !expansion.error && (
                <>
                  {Array.isArray(expansion.steps) && (
                    <div className="mb-2">
                      <p className="text-xs font-black text-slate-700 mb-1">📝 צעדים:</p>
                      <ol className="text-sm text-slate-700 list-decimal pr-4 space-y-1">
                        {expansion.steps.map((s, i) => <li key={i}>{s}</li>)}
                      </ol>
                    </div>
                  )}
                  {expansion.copy && (
                    <div className="mb-2 bg-slate-50 rounded-lg p-2 border border-slate-200">
                      <p className="text-xs font-black text-slate-700 mb-1">✍️ ניסוח / קופי:</p>
                      <p className="text-sm text-slate-800 whitespace-pre-wrap">{expansion.copy}</p>
                    </div>
                  )}
                  {Array.isArray(expansion.warnings) && expansion.warnings.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs font-black text-amber-800 mb-1">⚠️ שים לב:</p>
                      <ul className="text-sm text-amber-900 list-disc pr-4 space-y-0.5">
                        {expansion.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                  {expansion.success_metric && (
                    <div className="text-xs bg-emerald-50 rounded-lg p-2 border border-emerald-200">
                      <span className="font-black text-emerald-800">🎯 איך נדע שהצלחנו: </span>
                      <span className="text-emerald-700">{expansion.success_metric}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Chat tab ───
function ChatView({ chat, setChat, input, setInput, sending, setSending }) {
  const scrollRef = useRef(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [chat]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    const history = [...chat, { role: 'user', content: text }];
    setChat(history);
    setSending(true);
    try {
      const res = await base44.functions.marketingAdvisorChat({ history, message: text });
      setChat(h => [...h, { role: 'assistant', content: res?.data?.reply || 'מצטער, אירעה תקלה.' }]);
    } catch { setChat(h => [...h, { role: 'assistant', content: 'שגיאה זמנית. נסה שוב.' }]); }
    finally { setSending(false); }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-col h-[60vh] sm:h-[70vh]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 mb-3">
        {chat.length === 0 && (
          <div className="text-center text-slate-400 text-sm py-8">
            <div className="text-3xl mb-2">💬</div>
            שאל אותי כל דבר על שיווק העסק שלך — אסטרטגיה, מודעה ספציפית, איך לטפל בבעיה, רעיון לאירוע…
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-slate-100 text-slate-800' : 'bg-emerald-600 text-white'}`}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-end">
            <div className="bg-emerald-600 text-white rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '120ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '240ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="שאל את היועץ…"
          className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
        />
        <button onClick={send} disabled={sending || !input.trim()} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-4 rounded-xl">שלח</button>
      </div>
    </div>
  );
}

// ─── Progress tab ───
function ProgressView({ tasks, strategy, profile }) {
  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'completed').length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const completedThisWeek = tasks.filter(t => {
    if (t.status !== 'completed' || !t.completion_date) return false;
    const c = new Date(t.completion_date).getTime();
    return Date.now() - c < 7 * 86400000;
  }).length;

  return (
    <div className="space-y-3">
      <div className="bg-gradient-to-l from-indigo-500 to-purple-600 text-white rounded-2xl p-5">
        <p className="text-xs opacity-80">📈 התקדמות כללית</p>
        <p className="font-black text-3xl">{pct}%</p>
        <div className="h-2 bg-white/30 rounded-full overflow-hidden mt-2">
          <div className="h-full bg-white" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs opacity-90 mt-1">{done} מתוך {total} משימות הושלמו</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card label="📅 השבוע" value={completedThisWeek} sub="משימות הושלמו" />
        <Card label="🎯 יעד" value={strategy?.goal_summary ? '✓' : '—'} sub={strategy?.goal_summary || 'בנה אסטרטגיה'} />
      </div>
      {profile?.is_kosher && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-800">
          🍽️ <b>הערה:</b> ה‑AI שלך מודע שהעסק כשר ולא יציע פעולות שמנוגדות לכך.
        </div>
      )}
    </div>
  );
}

function Card({ label, value, sub }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-black text-2xl text-slate-800 truncate">{value}</p>
      <p className="text-xs text-slate-500 truncate">{sub}</p>
    </div>
  );
}
