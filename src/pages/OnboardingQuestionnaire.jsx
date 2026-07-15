import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';
import { Brain, Download, Save, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

/*
 * שאלון הצטרפות לעסק חדש → בונה את "ידע של דביר".
 * בשמירה: מייצרים מסמך Markdown של כל התשובות, מעלים אותו (UploadFile)
 * ורושמים אותו כ-AiAssistantFile פעיל. משם askGemini קורא ממנו ישירות
 * (text/markdown נתמך), בדיוק כמו שאר קובצי הידע של העסק.
 * הטיוטה נשמרת אוטומטית ב-localStorage.
 */

const DRAFT_KEY = 'dvir_ai_onboarding_draft_v1';
const FILE_PREFIX = '[אונבורדינג] '; // סמן יציב לזיהוי הקובץ בשמירה חוזרת

const SECTIONS = [
  {
    key: 'identity', titleHe: 'זהות העסק וה־DNA שלו', titleEn: 'Business Identity & DNA',
    note: 'הבסיס לכל השאר — מי אתם, ולמה לקוח בוחר בכם',
    questions: [
      { n: 1, he: 'שם העסק ושם מסחרי/כינוי אם יש.', en: 'Business name and any trade name / nickname.' },
      { n: 2, he: 'סוג העסק (מסעדה / בר / בית קפה / מזנון / רשת / אחר).', en: 'Type of business.' },
      { n: 3, he: 'כתובת/סניפים, טלפון ראשי, אתר ורשתות חברתיות.', en: 'Address/branches, main phone, website & social.' },
      { n: 4, he: 'שעות פעילות לכל יום בשבוע (כולל שישי/שבת/חגים).', en: 'Opening hours for each day.' },
      { n: 5, he: 'קונספט במשפט אחד (למשל: "חמארה ים-תיכונית כשרה").', en: 'Your concept in one sentence.' },
      { n: 6, he: 'כשרות — כשר? בהשגחת מי? חלבי/בשרי/פרווה?', en: 'Kosher status.' },
      { n: 7, he: 'קהל היעד — מי הלקוח הטיפוסי (גיל, סגנון, למה הוא בא)?', en: 'Target audience.' },
      { n: 8, he: 'מה מייחד אתכם — 3–5 דברים שאתם עושים אחרת/יותר טוב.', en: 'What sets you apart.', big: true },
      { n: 9, he: 'החזון והערכים (ה־DNA) — מה חשוב שכל עובד ירגיש ויעביר?', en: 'Vision & values (your DNA).', big: true },
      { n: 10, he: 'טון וסגנון דיבור המותג — רשמי/חברי/הומוריסטי? מה כן ולא אומרים.', en: 'Brand tone of voice.' },
      { n: 11, he: 'מיתוג ויזואלי — לוגו, צבעים, פונטים (צרף קבצים אם יש).', en: 'Visual branding.' },
      { n: 12, he: 'אווירה ומוזיקה — סגנון לפי חלקי היום, פלייליסטים, תאורה, ריח.', en: 'Atmosphere & music.' },
    ],
  },
  {
    key: 'menu', titleHe: 'תפריטים ומוצרים', titleEn: 'Menus & Products',
    note: 'מקביל ל"תפריט ערב", "תפריט שתייה", "ידע נרחב ללימוד תפריט"',
    questions: [
      { n: 13, he: 'אילו תפריטים יש? (בוקר / עסקיות / ערב / חמישי-שישי מיוחד / טייק אווי / משלוחים / קייטרינג).', en: 'Which menus do you have?' },
      { n: 14, he: 'לכל מנה: שם, תיאור/רכיבים, מחיר, אלרגנים, קטגוריה (או צרף תפריט).', en: 'Per dish: name, description, price, allergens, category.', big: true },
      { n: 15, he: 'תפריט שתייה — אלכוהול, קוקטיילים, שתייה קלה, חמים; מחירים.', en: 'Drinks menu.' },
      { n: 16, he: '"ידע נרחב" לכל מנה: איך מתארים ללקוח? מה מציעים לצידה? מנות דגל.', en: 'Deep menu knowledge.', big: true },
      { n: 17, he: 'מדיניות שינויים — מה מותר לשנות ומה לא.', en: 'Modification policy.' },
      { n: 18, he: 'גדלי מנה / כמויות — כמה גרם רכיב עיקרי למנה, גדלים.', en: 'Portion sizes.' },
    ],
  },
  {
    key: 'recipes', titleHe: 'מתכונים והכנה (מטבח + בר)', titleEn: 'Recipes & Prep',
    note: 'מקביל ל"ספר מתכונים מטבח", "ספר מתכונים קוקטיילים כולל באצ\'"',
    questions: [
      { n: 19, he: 'מתכוני מטבח: רכיבים+כמויות, שלבי הכנה, זמני/טמפ\' בישול, Mise en place (או צרף ספר מתכונים).', en: 'Kitchen recipes + mise en place.', big: true },
      { n: 20, he: 'מתכוני בר/קוקטיילים — מרכיבים, כמויות (מ"ל), הגשה, קישוט.', en: 'Bar/cocktail recipes.' },
      { n: 21, he: 'באצ\'ים (Batch) — תערובות/רטבים/סירופים: מתכון, כמות, זמן החזקה.', en: 'Batches.' },
      { n: 22, he: 'תקלות אפשריות במנה ודרכי טיפול ואיך מתקנים.', en: 'Possible dish issues & fixes.' },
    ],
  },
  {
    key: 'shifts', titleHe: 'נהלי משמרת וצ\'ק-ליסטים', titleEn: 'Shift Procedures & Checklists',
    note: 'פרט את רשימת הפעולות, או צרף צ\'ק-ליסט קיים',
    questions: [
      { n: 23, he: 'פתיחת משמרת בוקר/צהריים — לפי אזורים: פלור, חוץ, פנים, בר, מטבח, שירותים, משלוחים.', en: 'Morning/noon opening by zone.', big: true },
      { n: 24, he: 'סגירת משמרת בוקר / העברת משמרת לערב — מה מעבירים ולמי.', en: 'Morning close / handover.' },
      { n: 25, he: 'פתיחת משמרת ערב (כולל פתיחת בר ערב).', en: 'Evening opening.' },
      { n: 26, he: 'סגירת משמרת ערב (כולל בר) — ספירת קופה, ניקיונות, כיבוי מערכות.', en: 'Evening close.' },
      { n: 27, he: 'אחריות — מי מבצע כל צ\'ק-ליסט? מי מוודא שבוצע?', en: 'Ownership per checklist.' },
      { n: 28, he: 'תחזוקה ותקינות — מה בודקים מדי יום/שבוע.', en: 'Maintenance checks.' },
    ],
  },
  {
    key: 'team', titleHe: 'נהלי צוות ומדיניות', titleEn: 'Team Policies',
    note: 'מקביל ל"נהלי צוות (אוכל וטיפים)", "תוכני הכשרת אחמ"ש"',
    questions: [
      { n: 29, he: 'תפקידים והיררכיה — מלצר, ראנר, מארחת, ברמן, טבח, אחמ"ש, מנהל; אחריות של כל אחד.', en: 'Roles & hierarchy.', big: true },
      { n: 30, he: 'קוד לבוש — מה מותר ללבוש ומה אסור.', en: 'Dress code.' },
      { n: 31, he: 'אוכל עובדים — מה מותר, מתי, כמה זה עולה, איפה מקלידים.', en: 'Staff meals.' },
      { n: 32, he: 'טיפים — איך מחלקים (משותף/אישי)? חלוקה לראנר/מטבח? לפי שעות?', en: 'Tips distribution.' },
      { n: 33, he: 'נוכחות והפסקות — החתמה, אורך הפסקה, מדיניות איחורים.', en: 'Attendance & breaks.' },
      { n: 34, he: 'גיוס והכשרה — איך מכשירים עובד חדש? כמה חפיפה? חומרי הדרכה קיימים?', en: 'Hiring & training.' },
      { n: 35, he: 'סמכויות — מה מלצר מחליט לבד, ומתי קוראים לאחמ"ש/מנהל?', en: 'Authority levels.' },
    ],
  },
  {
    key: 'service', titleHe: 'שירות ואירוח', titleEn: 'Service & Hospitality',
    note: 'מקביל לנהלי אירוח, זמני הושבה, ניהול משברים',
    questions: [
      { n: 36, he: 'זמני הושבה — כמה זמן שולחן לפי גודל קבוצה.', en: 'Seating times by party size.' },
      { n: 37, he: 'ניהול המתנה/הזמנות — תור, שולחנות שמורים, בקשות לשולחן ספציפי.', en: 'Waitlist/reservations.' },
      { n: 38, he: 'פינוקים ומחוות — מתי על חשבון הבית? מי מאשר? סמכות מלצר.', en: 'Comps & gestures.' },
      { n: 39, he: 'מקרים מיוחדים — כלבים, עישון, נגישות, ילדים, אלרגיות מסכנות חיים.', en: 'Special cases.' },
      { n: 40, he: 'ניהול משברים — נוהל לכל תרחיש: לקוח לא אהב מנה, ביטול מנה, שבירת ציוד, תלונה, עומס חריג.', en: 'Crisis handling.', big: true },
    ],
  },
  {
    key: 'systems', titleHe: 'מערכות וטכנולוגיה', titleEn: 'Systems & Technology',
    note: 'מקביל ל"נספח טכני — הפרטים הקטנים"',
    questions: [
      { n: 41, he: 'קופה / POS — איזו מערכת? למי מתקשרים בתקלה? מה עושים בזמן תקלה?', en: 'POS & fallback.' },
      { n: 42, he: 'הזמנות שולחנות — איזו מערכת (Ontopo/אחר)? גישות רלוונטיות.', en: 'Reservations system.' },
      { n: 43, he: 'משלוחים — אילו אפליקציות (Wolt/עצמי)? נהלי אריזה, אזורי חלוקה.', en: 'Delivery apps & zones.' },
      { n: 44, he: 'תשלום — סליקה, אשראי, מזומן, סיבוס/תווים, החזרים.', en: 'Payments & refunds.' },
      { n: 45, he: 'Wi-Fi / מוזיקה / תאורה — רשת וסיסמה לאורחים, חשבון Spotify, מיקום מפסקים.', en: 'Wi-Fi / music / lighting.' },
      { n: 46, he: 'אנשי קשר לתמיכה — טכנאי קופה, חשמלאי, אינסטלטור, IT (שם + טלפון).', en: 'Support contacts.' },
    ],
  },
  {
    key: 'management', titleHe: 'ניהול, ספקים וכספים', titleEn: 'Management, Suppliers & Finance',
    note: 'המידע ש-Dvir AI צריך כדי לנהל, לא רק להדריך',
    questions: [
      { n: 47, he: 'ספקים — מי מספק מה (בשר, ירקות, אלכוהול, חד-פעמי), תדירות, ימי אספקה, איש קשר.', en: 'Suppliers.', big: true },
      { n: 48, he: 'הזמנת מלאי — איך יודעים מתי להזמין? מי אחראי? מלאי מינימום?', en: 'Ordering.' },
      { n: 49, he: 'ספירת מלאי — כל כמה זמן, אילו פריטים קריטיים לספור.', en: 'Inventory count.' },
      { n: 50, he: 'יעדים ומדדים — יעד מכירה יומי/חודשי, אחוז עבודה, פדיון ממוצע לשולחן.', en: 'Targets & KPIs.' },
      { n: 51, he: 'דוחות — אילו דוחות תרצה מ-Dvir AI ובאיזו תדירות.', en: 'Reports.' },
    ],
  },
];

const ATTACH_ITEMS = [
  { key: 'menus', he: 'תפריטים (אוכל + שתייה)' },
  { key: 'recipes', he: 'ספר מתכונים (מטבח / בר)' },
  { key: 'checklists', he: 'צ\'ק-ליסטים קיימים (פתיחה/סגירה)' },
  { key: 'policies', he: 'נהלי צוות / הסכם עבודה / קוד לבוש' },
  { key: 'training', he: 'חומרי הדרכה / סרטונים' },
  { key: 'suppliers', he: 'רשימת ספקים ואנשי קשר' },
  { key: 'brand', he: 'לוגו וקבצי מיתוג' },
  { key: 'other', he: 'כל מסמך תפעולי אחר' },
];

const ALL_QS = SECTIONS.flatMap((s) => s.questions);

export default function OnboardingQuestionnaire() {
  const { toast } = useToast();
  const [answers, setAnswers] = useState({});
  const [checks, setChecks] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) { const d = JSON.parse(raw); setAnswers(d.answers || {}); setChecks(d.checks || {}); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ answers, checks })); } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [answers, checks]);

  const answeredCount = useMemo(() => ALL_QS.filter((q) => (answers[q.n] || '').trim()).length, [answers]);
  const pct = Math.round((answeredCount / ALL_QS.length) * 100);
  const setAnswer = (n, v) => setAnswers((p) => ({ ...p, [n]: v }));

  const businessName = () => (answers[1] || 'העסק').trim().split('\n')[0].slice(0, 40) || 'העסק';

  const buildMarkdown = () => {
    const lines = [];
    lines.push(`# בסיס הידע של ${businessName()} — שאלון הצטרפות`);
    lines.push(`> נוצר מטופס האונבורדינג · הושלמו ${answeredCount}/${ALL_QS.length} שאלות`);
    lines.push('');
    for (let i = 0; i < SECTIONS.length; i++) {
      const s = SECTIONS[i];
      const answered = s.questions.filter((q) => (answers[q.n] || '').trim());
      if (!answered.length) continue;
      lines.push(`## חלק ${i} · ${s.titleHe}`);
      lines.push('');
      for (const q of answered) {
        lines.push(`**ש${q.n}. ${q.he}**`);
        lines.push('');
        lines.push((answers[q.n] || '').trim());
        lines.push('');
      }
    }
    const checked = ATTACH_ITEMS.filter((it) => checks[it.key]).map((it) => it.he);
    if (checked.length) {
      lines.push('## חלק 8 · חומרים קיימים לצירוף');
      lines.push('');
      lines.push(checked.map((c) => `- ${c}`).join('\n'));
      lines.push('');
    }
    return lines.join('\n');
  };

  const saveToDvirKnowledge = async () => {
    if (answeredCount === 0) {
      toast({ title: 'אין מה לשמור עדיין', description: 'מלא לפחות שאלה אחת לפני השמירה.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const md = buildMarkdown();
      const fileName = `${FILE_PREFIX}${businessName()}.md`;
      const file = new File([md], fileName, { type: 'text/markdown' });

      // upsert: מוחקים גרסה קודמת של אותו קובץ אונבורדינג לפני יצירת חדשה
      try {
        const existing = await base44.functions.listAiAssistantFiles({});
        const rows = Array.isArray(existing) ? existing : existing?.files || existing?.data || [];
        for (const f of rows) {
          if (f?.id && typeof f.file_name === 'string' && f.file_name.startsWith(FILE_PREFIX)) {
            await base44.functions.deleteAiAssistantFile({ id: f.id });
          }
        }
      } catch { /* ignore listing/cleanup errors — still create the new file */ }

      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      if (!file_url) throw new Error('העלאה החזירה כתובת ריקה');
      await base44.functions.createAiAssistantFile({
        file_name: fileName,
        mime_type: 'text/markdown',
        file_url,
        file_size: file.size,
        description: 'שאלון הצטרפות — בסיס הידע של העסק (נוצר מהאונבורדינג)',
      });

      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
      toast({ title: 'נשמר ל"ידע של דביר" ✅', description: 'הקובץ נשלח ל-Gemini — הצ\'אט כבר יכול לענות מהתשובות שלך.' });
    } catch (e) {
      console.error(e);
      toast({ title: 'שגיאה בשמירה', description: e?.message || 'נסה שוב', variant: 'destructive' });
    }
    setSaving(false);
  };

  const clearAll = () => {
    if (!window.confirm('לנקות את כל התשובות? הטיוטה המקומית תימחק.')) return;
    setAnswers({}); setChecks({});
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  };

  const downloadPdf = () => {
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const sectionsHtml = SECTIONS.map((s, i) => `
      <div class="section"><div class="sh">חלק ${i} · ${esc(s.titleHe)} <span class="en">${esc(s.titleEn)}</span></div>
      <div class="sb">${s.questions.map((q) => `<div class="q"><div class="qh"><b>${q.n}.</b> ${esc(q.he)}</div><div class="ans">${esc(answers[q.n]) || '&nbsp;'}</div></div>`).join('')}</div></div>`).join('');
    const checkedHtml = ATTACH_ITEMS.map((it) => `<li>${checks[it.key] ? '☑' : '☐'} ${esc(it.he)}</li>`).join('');
    const html = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><title>שאלון הצטרפות · Dvir AI</title><style>
      @page{size:A4;margin:14mm 12mm;} *{box-sizing:border-box;} body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2933;line-height:1.5;font-size:12px;margin:0;}
      h1{font-size:24px;margin:0 0 2px;color:#0f172a;} .sub{color:#64748b;margin:0 0 16px;font-size:13px;}
      .section{margin-bottom:16px;break-inside:avoid;} .sh{background:linear-gradient(90deg,#0f766e,#14b8a6);color:#fff;border-radius:7px 7px 0 0;padding:8px 14px;font-size:15px;font-weight:700;}
      .sh .en{font-size:11px;font-weight:600;opacity:.9;} .sb{border:1px solid #e2e8f0;border-top:none;border-radius:0 0 7px 7px;padding:8px 14px;}
      .q{margin-bottom:9px;break-inside:avoid;} .qh{font-weight:700;color:#0f172a;} .ans{margin-top:3px;border:1px solid #cbd5e1;border-radius:6px;padding:6px 9px;min-height:20px;white-space:pre-wrap;}
      ul{list-style:none;padding:0;} li{margin-bottom:6px;}</style></head><body>
      <h1>📋 שאלון הצטרפות · בסיס הידע של Dvir AI</h1><p class="sub">הושלמו ${answeredCount}/${ALL_QS.length} שאלות</p>
      ${sectionsHtml}<div class="section"><div class="sh">חלק 8 · חומרים קיימים לצירוף</div><div class="sb"><ul>${checkedHtml}</ul></div></div></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast({ title: 'החלון נחסם', description: 'אפשר חלונות קופצים כדי להוריד PDF', variant: 'destructive' }); return; }
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 350);
  };

  return (
    <div dir="rtl" className="max-w-4xl mx-auto p-4 md:p-8 pb-24">
      <PageHeader
        title="שאלון הצטרפות לעסק חדש"
        subtitle={`התשובות נכנסות ל"ידע של דביר" — והצ'אט קורא מהן`}
        icon={Brain}
      />

      <Card className="mb-4 border-amber-200 bg-amber-50/60">
        <CardContent className="p-4 text-sm text-slate-700 space-y-1">
          <p>מלא את השאלון ולחץ "שמור ל'ידע של דביר'". התשובות נשלחות ל-Gemini וכל עובד יוכל לשאול את הצ'אט עליהן.</p>
          <p className="text-slate-500">אין צורך למלא הכל בבת אחת — הטיוטה נשמרת אוטומטית במכשיר. יש כבר קובץ? העלה אותו ישירות במסך "ידע של דביר".</p>
        </CardContent>
      </Card>

      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 py-3 mb-5 -mx-4 px-4 md:mx-0 md:px-0 md:border-0 md:bg-transparent md:static">
        <div className="flex items-center gap-2 mb-2">
          <Progress value={pct} className="h-2 flex-1" />
          <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">{answeredCount}/{ALL_QS.length} ({pct}%)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={saveToDvirKnowledge} disabled={saving} className="bg-teal-700 hover:bg-teal-800">
            {saving ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : savedOk ? <CheckCircle2 className="w-4 h-4 ml-1" /> : <Save className="w-4 h-4 ml-1" />}
            {savedOk ? 'נשמר!' : "שמור ל'ידע של דביר'"}
          </Button>
          <Button onClick={downloadPdf} variant="outline"><Download className="w-4 h-4 ml-1" /> הורד / הדפס PDF</Button>
          <Button onClick={clearAll} variant="ghost" className="text-slate-500"><Trash2 className="w-4 h-4 ml-1" /> נקה</Button>
        </div>
      </div>

      <div className="space-y-5">
        {SECTIONS.map((section, idx) => (
          <Card key={section.key} className="overflow-hidden">
            <div className="bg-gradient-to-l from-teal-600 to-emerald-500 text-white px-4 py-3">
              <div className="font-bold text-lg">חלק {idx} · {section.titleHe}</div>
              <div className="text-xs opacity-90" dir="ltr">{section.titleEn}</div>
              {section.note && <div className="text-[11px] opacity-80 mt-0.5">{section.note}</div>}
            </div>
            <CardContent className="p-4 space-y-4">
              {section.questions.map((q) => (
                <div key={q.n}>
                  <label className="block font-semibold text-slate-800 text-sm">
                    <span className="text-teal-700 font-extrabold">{q.n}.</span> {q.he}
                  </label>
                  <div className="text-[11px] text-slate-400 mb-1" dir="ltr">{q.en}</div>
                  <Textarea
                    value={answers[q.n] || ''}
                    onChange={(e) => setAnswer(q.n, e.target.value)}
                    rows={q.big ? 4 : 2}
                    className="resize-y"
                    placeholder="הקלד כאן, או ציין 'צירפתי קובץ' / 'לא רלוונטי'…"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        <Card className="overflow-hidden">
          <div className="bg-gradient-to-l from-teal-600 to-emerald-500 text-white px-4 py-3">
            <div className="font-bold text-lg">חלק 8 · חומרים קיימים לצירוף</div>
            <div className="text-[11px] opacity-80 mt-0.5">כל מה שכבר קיים — פשוט העלה במסך "ידע של דביר", לא צריך להקליד מחדש</div>
          </div>
          <CardContent className="p-4 space-y-3">
            {ATTACH_ITEMS.map((it) => (
              <label key={it.key} className="flex items-center gap-3 cursor-pointer">
                <Checkbox checked={!!checks[it.key]} onCheckedChange={(v) => setChecks((p) => ({ ...p, [it.key]: !!v }))} />
                <span className="text-sm text-slate-800">{it.he}</span>
              </label>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 border-emerald-200 bg-emerald-50/60">
        <CardContent className="p-4 text-sm text-slate-700">
          <p className="font-bold text-emerald-700 mb-1">מה קורה אחרי שמירה?</p>
          נוצר קובץ ב"ידע של דביר" עם כל התשובות, הוא נשלח ל-Gemini, ומאותו רגע הצ'אט של Dvir AI עונה מהתוכן — בדיוק כמו שאתה היית עונה.
        </CardContent>
      </Card>
    </div>
  );
}
