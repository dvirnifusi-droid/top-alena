import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/shared/PageHeader';
import { Lightbulb } from 'lucide-react';
import ProposedActions from '@/components/marketing/ProposedActions';
import CampaignBuilder from '@/components/marketing/CampaignBuilder';
import PerformanceReview from '@/components/marketing/PerformanceReview';
import LiveCampaigns from '@/components/marketing/LiveCampaigns';

// ─── The questionnaire — grouped into sections so the owner answers in batches ───
const QUESTIONS = [
  {
    section: '🏪 1. פרטי העסק והלוגיסטיקה',
    fields: [
      { key: 'business_name', label: 'שם העסק', type: 'text', required: true },
      { key: 'business_type', label: 'סוג העסק', type: 'select', required: true,
        options: ['קיוסק / חנות נוחות', 'בר יין / בר אלכוהול', 'מסעדה', 'בית קפה', 'קייטרינג / חברת אירועים', 'מטבח רפאים (משלוחים בלבד)', 'אחר'] },
      { key: 'business_type_other', label: 'אם "אחר" — פרט', type: 'text', showIf: (d) => d.business_type === 'אחר' },
      { key: 'regulated_products', label: 'מוצרים תחת הגבלת פרסום בחוק (קריטי למניעת חסימת קמפיינים)', type: 'multiselect',
        options: ['אלכוהול', 'טבק / מוצרי עישון', 'ללא הגבלה'] },
      { key: 'location_city', label: 'עיר/יישוב', type: 'text' },
      { key: 'location_address', label: 'כתובת מלאה', type: 'text' },
      { key: 'delivery_radius_km', label: 'רדיוס הגעת לקוחות / משלוחים (ק"מ)', type: 'number' },
      { key: 'kosher_status', label: 'כשרות העסק', type: 'select',
        options: ['כן (עם תעודת כשרות)', 'לא', 'פתוח בשבת ללא תעודה'] },
      { key: 'opening_hours', label: 'שעות פתיחה קבועות', type: 'longtext',
        placeholder: 'למשל: ראשון-חמישי 11:00-23:00, שישי 11:00-15:00, שבת סגור' },
    ],
  },
  {
    section: '🎨 2. מותג, קונספט וסגנון',
    fields: [
      { key: 'concept', label: 'הקונספט / סגנון המטבח / סוג הסחורה המרכזית', type: 'longtext', required: true,
        placeholder: 'למשל: המבורגר שף מושחת, איטלקיה ביתית, בית קפה בריאות וטבעוני' },
      { key: 'brand_persona', label: 'אם העסק היה בן אדם — איזה אדם הוא היה? (טון המותג)', type: 'longtext' },
      { key: 'visual_show', label: 'ה"שואו" הוויזואלי / הייחודיות של המקום או המוצרים', type: 'longtext' },
      { key: 'logo_url', label: 'קישור ללוגו (אופציונלי)', type: 'text' },
    ],
  },
  {
    section: '🍽️ 3. מוצרים, רווחיות ומכירות',
    fields: [
      { key: 'flagship_products', label: '3 מנות / מוצרים הדגל של העסק', type: 'longtext', required: true,
        placeholder: '1. ...\n2. ...\n3. ...' },
      { key: 'best_seller', label: 'המוצר הנמכר ביותר כיום (Best Seller)', type: 'longtext' },
      { key: 'high_margin_items', label: 'מוצרים בעלי הרווחיות הגבוהה ביותר (High Margin)', type: 'longtext',
        placeholder: 'כאן ה-AI ימקד את הקמפיינים' },
      { key: 'primary_offering', label: 'ההצעה המרכזית שמביאה את רוב ההכנסות', type: 'longtext' },
      { key: 'menu_link', label: 'קישור לתפריט / קטלוג מוצרים', type: 'text' },
      { key: 'menu_photos', label: '📸 תמונות תפריט (אוכל ושתייה) — ה-AI יחלץ מהן מידע אוטומטית', type: 'photos' },
    ],
  },
  {
    section: '👥 4. קהל יעד והתנהגות לקוחות',
    fields: [
      { key: 'target_audience', label: 'הלקוח האידיאלי (גיל, מגדר, תחומי עניין, כאבים/צרכים)', type: 'longtext' },
      { key: 'current_audience', label: 'מי בפועל ממלא את המקום או קונה הכי הרבה כיום', type: 'longtext' },
      { key: 'buying_modes', label: 'איך הלקוחות רוכשים בעיקר', type: 'multiselect',
        options: ['תנועה מהרחוב (Walk-in)', 'ישיבה במקום', 'משלוחים (וולט / תן ביס / עצמאי)', 'איסוף עצמי (Takeaway)', 'אירועים / סגירת קבוצות', 'מנויים / כרטיסיות'] },
      { key: 'value_prop', label: 'למה לקוח יקנה דווקא ממך ולא מהמתחרים?', type: 'longtext' },
    ],
  },
  {
    section: '💰 5. ביצועים פיננסיים ותקציב',
    fields: [
      { key: 'monthly_revenue', label: 'מחזור חודשי ממוצע כיום (₪)', type: 'number' },
      { key: 'avg_order_value', label: 'שווי קנייה ממוצע (AOV) בש"ח', type: 'number', required: true },
      { key: 'monthly_budget', label: 'תקציב שיווק חודשי פנוי נטו לקמפיינים ממומנים (₪)', type: 'number', required: true,
        placeholder: 'כאן ה-AI בודק מה היכולת שלו' },
      { key: 'current_marketing_spend', label: 'הוצאות שיווק נוכחיות (כמה אתה משלם היום ועל מה)', type: 'longtext',
        placeholder: 'למשל: 800₪ למנהל קמפיינים, 200₪ הדפסת פליירים…' },
      { key: 'conversion_rate', label: 'אחוז המרה (% — אם ידוע)', type: 'number' },
      { key: 'repeat_customer_pct', label: 'אחוז לקוחות חוזרים (%)', type: 'number' },
      { key: 'ltv_estimate', label: 'אורך חיי לקוח / סכום מצטבר מלקוח חוזר (₪)', type: 'number' },
    ],
  },
  {
    section: '⏰ 6. עונתיות ותזמון פעילות',
    fields: [
      { key: 'weak_days', label: 'ימים חלשים/מאתגרים שצריך לחזק', type: 'multiselect', required: true,
        options: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'מוצ"ש'] },
      { key: 'strong_days', label: 'ימים חזקים', type: 'multiselect',
        options: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'מוצ"ש'] },
      { key: 'strong_hours', label: 'השעות החזקות ביותר ביום', type: 'text', placeholder: 'למשל: 12:00-15:00 וגם 19:00-22:00' },
      { key: 'seasonality', label: 'השפעת עונתיות', type: 'select',
        options: ['חזק משמעותית בקיץ / חלש בחורף', 'חזק משמעותית בחורף / חלש בקיץ', 'בעיקר סביב תקופות חגים', 'יציב לאורך כל השנה'] },
    ],
  },
  {
    section: '📢 7. נכסים דיגיטליים ומשאבים',
    fields: [
      { key: 'platforms_active', label: 'פלטפורמות עם עמוד פעיל', type: 'multiselect',
        options: ['Instagram', 'Facebook', 'TikTok', 'Google My Business', 'WhatsApp Business', 'אתר אינטרנט / חנות', 'מועדון לקוחות (מייל/SMS)', 'אף אחת'] },
      { key: 'main_url', label: 'קישור לאתר או עמוד סושיאל מרכזי', type: 'text' },
      { key: 'tech_systems', label: 'מערכות טכנולוגיות בעסק כיום', type: 'multiselect',
        options: ['מערכת להזמנת מקום (Ontopo / Tabit)', 'מערכת/אתר משלוחים עצמאי', 'קופה רושמת חכמה השומרת פרטי לקוחות', 'אין לי מערכות דיגיטליות'] },
      { key: 'media_assets', label: 'חומרי מדיה זמינים לפרסום', type: 'multiselect',
        options: ['יש תמונות מקצועיות של המקום/מוצרים', 'יש סרטונים קצרים בטלפון', 'אין חומרי מדיה — צריך הנחיה מה לצלם'] },
    ],
  },
  {
    section: '🎬 8. כוח אדם ומטרות חצי-שנתיות',
    fields: [
      { key: 'weekly_owner_time_hours', label: 'שעות בשבוע שאתה / הצוות יכולים להקדיש למשימות שיווק', type: 'number', required: true },
      { key: 'who_executes', label: 'מי הולך לבצע את המשימות', type: 'select',
        options: ['בעל העסק לבד', 'בעל העסק + עובד / שותף פנימי', 'יש לי ספקים חיצוניים (מעצב, עורך וידאו, איש קמפיינים)'] },
      { key: 'willing_to_film', label: 'מוכן להצטלם בוידאו (רילס / טיקטוק)', type: 'select',
        options: ['כן, בשמחה', 'רק אם חובה', 'ממש לא, בשום אופן'] },
      { key: 'main_challenge', label: 'האתגר השיווקי הגדול ביותר שלך כרגע', type: 'longtext' },
      { key: 'six_month_goal', label: 'איך תיראה הצלחה בעוד 6 חודשים (מספרים, יעדים, חלום)', type: 'longtext' },
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
      <PageHeader
        title="היועץ השיווקי שלך"
        subtitle="שואל אותך, מבין את העסק, ומכין לך תכנית 6 חודשים עם משימות יומיות"
        icon={Lightbulb}
        action={profile && (
          <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1.5 text-xs">
            <span className="font-bold text-slate-700">{profile.business_name || '—'}</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500">השלמת פרופיל: {completion}%</span>
            <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden ml-1">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${completion}%` }} />
            </div>
          </div>
        )}
      />

      {/* Tabs */}
      <nav className="bg-white border border-slate-200 rounded-2xl p-1.5 flex flex-wrap gap-1.5 sticky top-0 z-10 shadow-sm">
        {[
          { k: 'profile',  label: '🏪 פרופיל' },
          { k: 'strategy', label: '🎯 אסטרטגיה' },
          { k: 'actions',  label: '⚡ פעולות' },
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
      {!loading && tab === 'actions' && (
        <div className="space-y-5">
          <CampaignBuilder />
          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-bold text-slate-500 mb-2">⚡ פעולות מהירות (בלי תמונה)</h3>
            <ProposedActions />
          </div>
          <PerformanceReview />
          <LiveCampaigns />
        </div>
      )}
      {!loading && tab === 'tasks' && (
        <TasksView tasks={tasks} strategy={strategy} onChange={loadAll} hasProfile={!!profile?.completed} />
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
      payload.is_kosher = /כן|כשר/.test(data.kosher_status || '');
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
            {section.fields.filter(f => !f.showIf || f.showIf(data)).map(f => (
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
  if (f.type === 'photos') {
    return <MenuPhotosField field={f} value={value} onChange={onChange} />;
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

function MenuPhotosField({ field: f, value, onChange }) {
  const urls = Array.isArray(value) ? value : [];
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(null);

  const upload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const newUrls = [];
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        if (file_url) newUrls.push(file_url);
      }
      onChange([...urls, ...newUrls]);
    } catch { alert('שגיאה בהעלאה'); }
    finally { setUploading(false); }
  };

  const extract = async () => {
    if (!urls.length) return;
    setExtracting(true);
    try {
      const res = await base44.functions.extractMenuFromPhotos({ urls });
      setExtracted(res?.data?.menu || null);
    } catch { alert('שגיאה בחילוץ התפריט'); }
    finally { setExtracting(false); }
  };

  return (
    <div>
      <p className="text-sm font-bold text-slate-700 mb-1">{f.label}</p>
      <p className="text-xs text-slate-500 mb-2">בחר/י תמונה אחת או יותר של דף תפריט (אוכל / שתייה / קוקטיילים).</p>
      <label className="block w-full bg-slate-100 hover:bg-slate-200 cursor-pointer rounded-xl py-3 text-center text-sm font-bold text-slate-700">
        {uploading ? 'מעלה…' : '📸 העלה תמונות'}
        <input type="file" accept="image/*" multiple onChange={upload} className="hidden" disabled={uploading} />
      </label>
      {urls.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
          {urls.map((u, i) => (
            <div key={i} className="relative">
              <img src={u} alt="" className="w-full h-20 object-cover rounded-lg border border-slate-200" />
              <button onClick={() => onChange(urls.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white w-5 h-5 rounded-full text-xs font-bold leading-none">×</button>
            </div>
          ))}
        </div>
      )}
      {urls.length > 0 && (
        <button onClick={extract} disabled={extracting} className="mt-3 w-full bg-[#A04A2E] hover:bg-[#7A3722] disabled:opacity-50 text-white font-bold py-2 rounded-xl text-sm">
          {extracting ? '🤔 קורא את התפריט…' : '🔍 חלץ פריטים בעזרת AI'}
        </button>
      )}
      {extracted && (
        <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs">
          <p className="font-black text-emerald-900 mb-1">✅ נחלצו {Array.isArray(extracted?.items) ? extracted.items.length : 0} פריטים</p>
          {extracted?.summary && <p className="text-emerald-800">{extracted.summary}</p>}
          {Array.isArray(extracted?.items) && extracted.items.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer font-bold text-emerald-800">הצג רשימה</summary>
              <ul className="mt-1 list-disc pr-4 text-emerald-900 space-y-0.5">
                {extracted.items.slice(0, 50).map((it, i) => (
                  <li key={i}>{it.name}{it.price ? ` — ₪${it.price}` : ''}{it.category ? ` (${it.category})` : ''}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
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
      <div className="bg-gradient-to-l from-emerald-600 to-[#44512C] text-white rounded-2xl p-5">
        <p className="text-xs opacity-80">🎯 היעד</p>
        <p className="font-black text-base">{strategy.goal_summary}</p>
      </div>
      <div className="space-y-2">
        {months.map((m, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-black text-slate-800">חודש {m.month || i + 1} · {m.focus || ''}</p>
              {m.theme && <span className="text-xs bg-[#F4ECD8] text-[#7A3722] px-2 py-1 rounded-full font-bold">{m.theme}</span>}
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
function TasksView({ tasks, onChange, hasProfile, strategy }) {
  const monthsPlan = Array.isArray(strategy?.months_plan) ? strategy.months_plan : [];

  // Default to the month that has the most pending tasks (= "current" month)
  const initialMonth = (() => {
    const counts = {};
    tasks.forEach(t => {
      const m = t.month_number || 1;
      if (t.status !== 'completed') counts[m] = (counts[m] || 0) + 1;
    });
    const ks = Object.keys(counts).map(Number).sort((a, b) => counts[b] - counts[a]);
    return ks[0] || 1;
  })();
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [expanded, setExpanded] = useState(null);
  const [expansionCache, setExpansionCache] = useState({});
  const [loadingExp, setLoadingExp] = useState(false);
  const [generatingNext, setGeneratingNext] = useState(false);
  const [generatingTopup, setGeneratingTopup] = useState(false);

  const monthTasks = tasks.filter(t => (t.month_number || 1) === selectedMonth);
  const monthInfo = monthsPlan.find(m => Number(m.month) === selectedMonth) || monthsPlan[selectedMonth - 1] || null;
  const monthCompleted = monthTasks.filter(t => t.status === 'completed').length;
  const monthPct = monthTasks.length ? Math.round((monthCompleted / monthTasks.length) * 100) : 0;

  const todayStr = new Date().toISOString().slice(0, 10);

  // Group by week_in_month then by day
  const weeks = [1, 2, 3, 4].map(w => {
    const wTasks = monthTasks.filter(t => (t.week_in_month || 1) === w);
    const byDay = {};
    wTasks.forEach(t => {
      const d = t.due_date || 'אין תאריך';
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push(t);
    });
    const days = Object.keys(byDay).sort();
    return { week: w, days, byDay, completed: wTasks.filter(t => t.status === 'completed').length, total: wTasks.length };
  });

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

  const generateNextMonth = async () => {
    setGeneratingNext(true);
    try {
      await base44.functions.generateMonthTasks({ month_number: selectedMonth + 1 });
      await onChange();
      setSelectedMonth(selectedMonth + 1);
    } catch { alert('שגיאה ביצירת חודש'); }
    finally { setGeneratingNext(false); }
  };

  const generateThisMonth = async () => {
    setGeneratingNext(true);
    try {
      await base44.functions.generateMonthTasks({ month_number: selectedMonth });
      await onChange();
    } catch { alert('שגיאה ביצירת חודש'); }
    finally { setGeneratingNext(false); }
  };

  const generateTopup = async () => {
    setGeneratingTopup(true);
    try {
      await base44.functions.generateNextMarketingTasks({ count: 7 });
      await onChange();
    } catch { alert('שגיאה ביצירת משימות'); }
    finally { setGeneratingTopup(false); }
  };

  if (!hasProfile) {
    return (
      <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 text-center">
        <p className="font-black text-amber-800 mb-1">צריך פרופיל ואסטרטגיה לפני שיש משימות</p>
      </div>
    );
  }

  const monthCounts = {};
  tasks.forEach(t => { const m = t.month_number || 1; monthCounts[m] = (monthCounts[m] || 0) + 1; });
  const canGenerateNextMonth = selectedMonth < 6 && (monthCounts[selectedMonth + 1] || 0) === 0 && monthTasks.length > 0;

  return (
    <div className="space-y-4">
      {/* Month selector */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3">
        <p className="text-xs text-slate-500 mb-2">📅 בחר חודש בתכנית:</p>
        <div className="grid grid-cols-6 gap-1.5">
          {[1, 2, 3, 4, 5, 6].map(m => {
            const cnt = monthCounts[m] || 0;
            const isCurrent = m === selectedMonth;
            return (
              <button
                key={m}
                onClick={() => setSelectedMonth(m)}
                className={`py-2 rounded-xl text-sm font-black transition ${
                  isCurrent ? 'bg-[#A04A2E] text-white shadow' : cnt > 0 ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-50 text-slate-400'
                }`}
              >
                <div>חודש {m}</div>
                <div className={`text-[10px] ${isCurrent ? 'opacity-80' : ''}`}>{cnt} משימות</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Month context card */}
      {monthInfo && (
        <div className="bg-gradient-to-l from-[#A04A2E] to-[#A04A2E] text-white rounded-2xl p-4">
          <p className="text-xs opacity-80">חודש {selectedMonth} · {monthInfo.theme || ''}</p>
          <p className="font-black text-base mt-0.5">{monthInfo.focus || 'מיקוד החודש'}</p>
          <div className="mt-2 h-2 bg-white/30 rounded-full overflow-hidden">
            <div className="h-full bg-white transition-all" style={{ width: `${monthPct}%` }} />
          </div>
          <p className="text-xs opacity-90 mt-1">{monthCompleted}/{monthTasks.length} הושלמו · {monthPct}%</p>
        </div>
      )}

      {monthTasks.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center">
          <p className="text-slate-400 text-sm mb-3">אין עדיין משימות לחודש זה</p>
          {selectedMonth > 1 && (
            <button onClick={generateThisMonth} disabled={generatingNext} className="bg-[#A04A2E] hover:bg-[#7A3722] disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl">
              {generatingNext ? '🤔 מייצר…' : `✨ ייצר את חודש ${selectedMonth}`}
            </button>
          )}
        </div>
      ) : (
        <>
          {weeks.map(w => w.total > 0 && (
            <div key={w.week} className="bg-white border border-slate-200 rounded-2xl p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="font-black text-slate-800 text-sm">📍 שבוע {w.week}</p>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-bold">
                  {w.completed}/{w.total}
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${w.total ? (w.completed / w.total) * 100 : 0}%` }} />
              </div>
              <div className="space-y-3">
                {w.days.map(day => (
                  <div key={day}>
                    <p className="text-xs font-bold text-slate-500 mb-1.5">
                      {day === todayStr ? '📍 היום · ' : ''}
                      {day}
                    </p>
                    <div className="space-y-2">
                      {w.byDay[day].map(t => (
                        <TaskCard key={t.id} t={t} onComplete={markComplete} onExpand={expand}
                          expanded={expanded === t.id} expansion={expansionCache[t.id]}
                          loadingExp={loadingExp && expanded === t.id} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        {canGenerateNextMonth && (
          <button onClick={generateNextMonth} disabled={generatingNext} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-2xl disabled:opacity-50">
            {generatingNext ? '🤔 מייצר…' : `🚀 התחל חודש ${selectedMonth + 1}`}
          </button>
        )}
        <button onClick={generateTopup} disabled={generatingTopup} className="flex-1 bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-700 font-bold py-3 rounded-2xl disabled:opacity-50">
          {generatingTopup ? '🤔 מייצר…' : '✨ עוד 7 משימות לחודש הזה'}
        </button>
      </div>
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
  online:  { label: '🌐 דיגיטל', cls: 'bg-[#F4ECD8] text-[#44512C]' },
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
            {t.estimated_time && <span className="text-xs bg-[#F4ECD8] text-[#7A3722] px-2 py-0.5 rounded-full font-bold">⏱ {t.estimated_time} דק'</span>}
            {t.budget_required > 0 && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">💸 ₪{t.budget_required}</span>}
            {t.due_date && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">📅 {t.due_date}</span>}
          </div>
          <p className="text-sm text-slate-600 mt-1.5">{t.description}</p>
          {t.ai_reasoning && (
            <p className="text-xs text-[#7A3722] mt-1 italic">💡 {t.ai_reasoning}</p>
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
      <div className="bg-gradient-to-l from-[#A04A2E] to-[#A04A2E] text-white rounded-2xl p-5">
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
