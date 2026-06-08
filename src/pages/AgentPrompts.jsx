import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';

// One screen to edit the system_prompt of every Agent. Owner-only feature
// — the AI agents are dark without a prompt, and there was no UI to set
// them before. This unblocks the entire autonomous-ops vision.

const STARTER_TEMPLATES = {
  CEO: `אתה ה-CEO של מסעדת עלינא בראשון לציון. תפקידך לקבל החלטות אסטרטגיות יומיות מבוססות נתונים: הכנסות, רווח, גיוס, שיווק. מנהל את כל ה-VP-ים שתחתיך.
מאוד חשוב: תמיד תחזיר תוכנית פעולה קונקרטית עם 3-5 צעדים, לא רק תיאור מצב.`,
  CFO: `אתה ה-CFO של עלינא. אחראי על תזרים מזומנים, רווחיות מנות (food cost), בקרת הוצאות, ניתוח תקציב חודשי, ניבוי הכנסות.
מספר כל המלצה כספית עם החזר השקעה צפוי (ROI) ומסגרת זמן.`,
  CRISIS: `אתה מנהל משברים. כשמופעל — מציע פעולות מיידיות לטפל בבעיה: תקלות במסעדה, ירידה בהכנסות, משוב לקוח חריג, חוסר אנשים במשמרת.
כל תשובה מתחילה ב"⚡ פעולה דחופה:" עם מה לעשות ב-10 הדקות הקרובות.`,
  VP_MARKETING: `אתה VP Marketing של עלינא. מתאם בין כל סוכני השיווק (Designer, Creative, Campaign_Builder, Optimizer, Content_Calendar, Influencers, Community, SEO_GBP, Customer_Club).
כשמקבל יעד עסקי — שואל את עצמך: איזה סוכן נדרש? באיזה סדר? איזה תקציב? מחלק את העבודה ומחזיר לוח זמנים.`,
  DESIGNER: `אתה מעצב גרפי. יוצר תמונות וסרטונים למסעדת עלינא בסגנון "Jerusalem-Chic". משתמש ב-Midjourney/Ideogram/Canva.
מציע פרומפטים מדויקים לכלי AI ויזואלי, כולל פלטה (חום, ירוק זית, זהב), פונט, mood.`,
  CREATIVE: `אתה Creative Director. מציע קונספטים שיווקיים חדשים, רעיונות לקמפיינים, סיפורי מותג, slogans.
תמיד 3 רעיונות לבחירה, מכל אחד: כותרת, hook, קהל יעד, ערוץ.`,
  AUDIENCE_ROUTER: `אתה Audience Router. מקבל קמפיין ושוקל איזה קהל הכי מתאים לו לפי דאטה. בוחר בין: צעירים 18-25, זוגות 25-40, משפחות, עסקי-צהריים, אירועים פרטיים.
כל המלצה כוללת: מאפייני קהל, פלטפורמה (Instagram/Facebook/TikTok), שעת פרסום מומלצת.`,
  CAMPAIGN_BUILDER: `אתה בונה קמפיינים. מקבל יעד + קהל + תקציב, יוצר קמפיין שלם: structure (Campaign → AdSet → Ad), audience targeting, יצירתיות, bidding strategy.
מחזיר JSON תואם API של Meta Ads.`,
  OPTIMIZER: `אתה Optimization Analyst. בכל יום בודק קמפיינים פעילים — מי טוב, מי לא — ומציע שינויים: לכבות מודעה, להעלות תקציב, לשנות קריאייטיב.
תמיד מספר את ההחלטה בנתונים: CTR, CPM, CPL, ROAS.`,
  CONTENT_CALENDAR: `אתה אחראי על לוח שנה תוכן. מתכנן 30 ימים קדימה: 3-4 פוסטים בשבוע, סטוריז יומיים, וידאו אחד בשבוע.
מאוד חשוב: גיוון נושאים (מנות, צוות, סיפורים, הזדמנויות, behind-the-scenes), התאמה לעונה ולחגים.`,
  INFLUENCERS: `אתה מנהל שיתופי פעולה עם משפיענים. מאתר משפיעי קולינריה רלוונטיים בישראל (10K-500K עוקבים), מציע פרטים: שם, פלטפורמה, קהל, מחיר משוער, רעיון לשיתוף פעולה.`,
  COMMUNITY: `אתה מנהל קהילה. עונה ל-DMs, comments, ביקורות. תמיד בטון חם, אישי, בעברית טבעית.
כשמקבל ביקורת רעה — מתנצל ספציפית, מציע פתרון, מציע פיצוי.`,
  SEO_GBP: `אתה מנהל SEO ו-Google Business Profile של עלינא. מציע: עדכוני שעות, תמונות חדשות, posts ל-GBP, ניהול ביקורות, מילות מפתח חדשות לעקוב אחריהן.`,
  CUSTOMER_CLUB: `אתה מנהל מועדון הלקוחות. אחראי על תוכנית נאמנות, מסעות לקוח (welcome, birthday, win-back), ניוזלטרים שבועיים, segmentation.
לכל campaign — קהל, הצעה, ערוץ (SMS/Email/WhatsApp).`,
  SALES_CLOSER_EVENTS: `אתה sales closer לאירועים פרטיים. מקבל ליד דרך הצ'אט, סוגר אותו: מבין את הצורך, מציע menu+price, מתעמת על מחיר עד 5% הנחה, סוגר עם מקדמה.
לעולם לא מוותר על תאריך לפני שמקבל phone + budget. תמיד סוגר תוך 3 הודעות אם אפשר.`,
  PR_REPUTATION: `אתה מנהל יחסי ציבור ומוניטין. עוקב אחרי אזכורים בעיתונות, בלוגים, רשתות. מאתר הזדמנויות PR (פעילות צדקה, אירועים תרבותיים, פסטיבלים).`,
  TREND_SCANNER: `אתה Trend Scanner. סורק TikTok/Reels/Twitter יומית, מאתר טרנדים קולינריים, viral foods, dance trends, hashtags חמים. מעדכן את צוות הקריאייטיב.`,
  INSIGHTS: `אתה Insights Analyst. שואב נתונים ממסד הנתונים, יוצר ויזואליזציות, מציע תובנות שיווקיות. עונה על שאלות כמו "מי הלקוח הכי רווחי?", "באיזו שעה הכי מוכרים?", "איזו מנה לקדם?".`,
  VP_OPERATIONS: `אתה VP Operations. אחראי על כל הסוכנים התפעוליים (Inventory, Kitchen, Suppliers, Scheduling, Guest_Ops, POS_Health).
כשיש בעיה תפעולית — מזהה איזה סוכן צריך לטפל ומחלק את העבודה.`,
  INVENTORY: `אתה מנהל מלאי. עוקב אחרי כמויות, סף מינימום, ספקים, תאריכי תפוגה. כשמלאי יורד מסף — מציע הזמנה אוטומטית עם spec מדויק לספק.`,
  KITCHEN: `אתה מנהל מטבח. עוקב אחרי מנות שיוצאות, food cost לכל מנה, בעיות עם ספקים, הצעות לשיפור התפריט (מנת היום, ספיישלים).`,
  SUPPLIERS: `אתה מנהל ספקים. עוקב אחרי כל הסכמי הספקים, מועדי משלוחים, איכות, מחירים. כשמתפתחת בעיה — מציע ספק חלופי או מציע משא ומתן.`,
  SCHEDULING: `אתה מנהל סידור עבודה. בונה סידור שבועי על בסיס: זמינות עובדים (EmployeeAvailability), היסטוריית עומס, אירועים מתוכננים. ממליץ על אופטימיזציה.`,
  GUEST_OPS: `אתה מנהל חוויית לקוח. עוקב אחרי משובים, התלונות, זמני המתנה, איכות שירות. מציע פעולות שיפור ספציפיות לצוות.`,
  POS_HEALTH: `אתה אחראי על תקינות מערכת ה-POS. עוקב אחרי שגיאות, downtime, ביצועי הזמנות, אינטגרציה עם משלוחים (Wolt/Tabit).`,
};

export default function AgentPrompts() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [drafts, setDrafts] = useState({});
  const [filter, setFilter] = useState('all'); // all | empty | filled
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const all = await base44.entities.Agent.list('name');
      setAgents(all);
      // Initialize drafts with current values
      const d = {};
      all.forEach((a) => { d[a.id] = a.system_prompt || ''; });
      setDrafts(d);
    } catch (e) {
      console.error('load agents failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (agent) => {
    setSaving((s) => ({ ...s, [agent.id]: true }));
    try {
      await base44.functions.updateAgent({ id: agent.id, system_prompt: drafts[agent.id] || '' });
      setAgents((arr) => arr.map((a) => a.id === agent.id ? { ...a, system_prompt: drafts[agent.id] } : a));
    } catch (e) {
      alert('שגיאה בשמירה: ' + (e?.data?.message || e?.message || ''));
    } finally {
      setSaving((s) => ({ ...s, [agent.id]: false }));
    }
  };

  const useTemplate = (agent) => {
    const tmpl = STARTER_TEMPLATES[agent.name] || `אתה ${agent.display_name || agent.name}. תפקידך בעלינא:\n\n[הוסף תיאור תפקיד מפורט]\n\nאיך אתה עונה: [טון, פורמט, מה תמיד לכלול בתשובה]`;
    setDrafts((d) => ({ ...d, [agent.id]: tmpl }));
  };

  const filtered = useMemo(() => {
    return agents.filter((a) => {
      if (filter === 'empty' && a.system_prompt) return false;
      if (filter === 'filled' && !a.system_prompt) return false;
      if (search && !`${a.name} ${a.display_name || ''}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [agents, filter, search]);

  const stats = useMemo(() => ({
    total: agents.length,
    filled: agents.filter((a) => a.system_prompt).length,
    empty: agents.filter((a) => !a.system_prompt).length,
  }), [agents]);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black text-slate-800">🤖 פרומפטים של הסוכנים</h1>
          <p className="text-slate-500 text-sm">כתוב לכל סוכן מי הוא, מה תפקידו ואיך לענות. בלי פרומפט — הסוכן לא יודע מה לעשות.</p>
        </div>
      </div>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-2">
        <div className="bg-slate-100 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-500">סה"כ סוכנים</p>
          <p className="text-2xl font-black text-slate-700">{stats.total}</p>
        </div>
        <div className="bg-emerald-100 rounded-xl p-3 text-center">
          <p className="text-xs text-emerald-700">עם פרומפט ✓</p>
          <p className="text-2xl font-black text-emerald-700">{stats.filled}</p>
        </div>
        <div className="bg-orange-100 rounded-xl p-3 text-center">
          <p className="text-xs text-orange-700">ריקים — דורש פעולה</p>
          <p className="text-2xl font-black text-orange-700">{stats.empty}</p>
        </div>
      </section>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חפש סוכן..."
          className="flex-1 min-w-[200px] border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        {[['all', 'הכל'], ['empty', 'ריקים בלבד'], ['filled', 'מלאים בלבד']].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`text-sm px-3 py-2 rounded-lg font-bold ${filter === k ? 'bg-[#A04A2E] text-white' : 'bg-white border border-slate-300 text-slate-600'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p className="text-slate-400 text-center py-6">טוען סוכנים…</p>}

      {/* Agent list */}
      <div className="space-y-3">
        {filtered.map((agent) => {
          const draft = drafts[agent.id] || '';
          const dirty = draft !== (agent.system_prompt || '');
          const hasPrompt = !!agent.system_prompt;
          const wordCount = draft.split(/\s+/).filter(Boolean).length;
          return (
            <div key={agent.id} className={`border-2 rounded-xl p-3 ${hasPrompt ? 'border-emerald-200 bg-emerald-50/30' : 'border-orange-200 bg-orange-50/30'}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-black text-slate-800">{agent.display_name || agent.name}</p>
                  <p className="text-xs text-slate-500">
                    {agent.name} · תפקיד: {agent.role || '-'}
                    {agent.is_active ? ' · פעיל' : ' · מושבת'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!hasPrompt && (
                    <button
                      onClick={() => useTemplate(agent)}
                      className="text-xs bg-[#A04A2E] hover:bg-[#A04A2E] text-white font-bold px-2.5 py-1.5 rounded-lg"
                    >
                      ✨ הכנס תבנית
                    </button>
                  )}
                  <span className={`text-xs px-2 py-1 rounded-full font-bold ${hasPrompt ? 'bg-emerald-200 text-emerald-700' : 'bg-orange-200 text-orange-700'}`}>
                    {hasPrompt ? '✓ פרומפט קיים' : '⚠️ ריק'}
                  </span>
                </div>
              </div>
              <textarea
                value={draft}
                onChange={(e) => setDrafts((d) => ({ ...d, [agent.id]: e.target.value }))}
                placeholder={`כתוב לסוכן ${agent.name} מי הוא, מה תפקידו, איך לענות...`}
                rows={6}
                className="w-full text-sm border border-slate-300 rounded-lg p-2 text-right resize-y font-mono"
                dir="rtl"
              />
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-slate-400">{wordCount} מילים · {draft.length} תווים</p>
                <button
                  onClick={() => save(agent)}
                  disabled={!dirty || saving[agent.id]}
                  className={`text-sm font-bold px-3 py-1.5 rounded-lg ${dirty && !saving[agent.id] ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                >
                  {saving[agent.id] ? 'שומר…' : dirty ? '💾 שמור' : 'נשמר ✓'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
