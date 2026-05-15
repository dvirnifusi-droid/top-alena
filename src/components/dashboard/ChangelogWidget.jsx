import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Check, Clock, Calendar, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

// ===========================
// 📋 יומן שינויים - עדכן כאן!
// כל פעם שמוסיפים פיצ'ר חדש, הוסף רשומה לרשימה הזו.
// ===========================
const CHANGELOG = [
  // --- מאי 2026 ---
  {
    date: '2026-05-15',
    category: 'dashboard',
    label: 'גאדג\'טים חדשים לדשבורד',
    description: 'הוספת 12 גאדג\'טים חדשים לדשבורד המנהל והעובד: טיפים היום, מלאי נמוך, משלוחים פעילים, בקשות ממתינות, מובילי שבוע, תור נוכחי, סקרי לקוחות, הזמנות שולחנות, גרף שבועי, הטיפים שלי, הדירוג שלי, הודעות אחרונות.',
    prompt: 'הוסף לדשבורד המנהל גאדג\'טים חדשים: "טיפים היום" שמציג סך טיפים מדוחות TipReport של היום, "מלאי נמוך" שמציג התראות מ-InventoryAlert שלא נפתרו, "משלוחים פעילים" שמציג כמות משלוחים בסטטוס pending/picked_up מהיום, "בקשות ממתינות" שסופר LeaveRequest + ShiftSwapRequest בסטטוס pending, "מובילי השבוע" שמציג טופ 3 מ-CoinTransaction של 7 ימים אחרונים, "תור נוכחי" שמציג QueueEntry בסטטוס pending/active עם real-time subscribe, "סקרי לקוחות אחרונים" שמציג 3 פידבקים אחרונים מ-CustomerFeedback, "הזמנות שולחנות היום" שמציג 4 הזמנות מ-Reservation לפי תאריך, "גרף ביצועים שבועי" שמציג הכנסות של 7 ימים אחרונים מ-ShiftEndReport כ-BarChart. כמו כן, הוסף לדשבורד העובד: "הטיפים שלי השבוע" שמחפש את העובד לפי email ב-TipReport.staff_details, "הדירוג שלי" שמחשב דירוג מ-CoinTransaction של 7 ימים, "הודעות אחרונות" מ-ShiftMessage, "תור נוכחי" (אותו קומפוננט). כל הגאדג\'טים ניתנים להפעלה/כיבוי דרך "ערוך דשבורד" עם useDashboardLayout hook.',
  },
  {
    date: '2026-05-14',
    category: 'dashboard',
    label: 'מערכת התאמה אישית של דשבורד',
    description: 'הוספת DashboardCustomizer - דיאלוג drag & drop לניהול גאדג\'טים בדשבורד. כל משתמש יכול להפעיל/כבות ולסדר מחדש את הגאדג\'טים שלו. ההגדרות נשמרות ב-localStorage לפי אימייל.',
    prompt: 'הוסף לדשבורד מערכת התאמה אישית: כפתור "ערוך דשבורד" שפותח דיאלוג עם רשימת גאדג\'טים להפעלה/כיבוי. כל גאדג\'ט מוצג עם שם, אמוג\'י ו-toggle. ניתן לגרור ולשנות סדר (drag & drop עם @hello-pangea/dnd). ההגדרות נשמרות ב-localStorage בפורמט: {adminDashboard_EMAIL: [{id, visible, order}]}. צור hook בשם useDashboardLayout שחושף: layout (מסודר), saveLayout, isVisible(id). צור רשימות ADMIN_WIDGETS ו-EMPLOYEE_WIDGETS עם id, label, emoji, defaultOn.',
  },
  {
    date: '2026-05-13',
    category: 'media',
    label: 'ניהול מדיה במדריך שימוש',
    description: 'הוספת MediaManager למדריך השימוש - מאפשר למנהל להעלות תמונות, לנהל גלריה, לשלוט במיקום התמונה (object-position) ולצפות בתמונות במסך מלא (lightbox).',
    prompt: 'הוסף לדף UserGuide קומפוננט MediaManager: כפתור "ניהול מדיה" למנהלים בלבד שפותח דיאלוג. בדיאלוג: אפשרות העלאת תמונה עם UploadFile integration, הצגת גלריה של תמונות שנשמרו, בחירת object-position (top/center/bottom), מחיקת תמונות. הוסף תמיכה ב-lightbox - לחיצה על תמונה פותחת אותה במסך מלא עם חץ סגירה.',
  },
  {
    date: '2026-05-12',
    category: 'hr',
    label: 'ניתוח סיכון עובדים AI',
    description: 'הוספת EmployeeRiskAnalysis - ניתוח AI לזיהוי עובדים בסיכון עזיבה לפי נוכחות, ביצועים ודירוגים.',
    prompt: 'הוסף לדף Employees קומפוננט EmployeeRiskAnalysis: כפתור "ניתוח סיכון AI" שמנתח את כל העובדים. ה-AI מקבל נתוני ShiftTracking, EmployeePerformance, דירוגי מנהלים ומנתח עם InvokeLLM לזיהוי עובדים בסיכון עזיבה גבוה/בינוני/נמוך. מציג רשימה עם שם עובד, רמת סיכון בצבע (אדום/כתום/ירוק) והמלצה לפעולה.',
  },
  {
    date: '2026-05-11',
    category: 'training',
    label: 'לימוד תפריט עם Gemini',
    description: 'שדרוג מערכת הכשרת תפריט - שילוב עם Gemini Flash לשאלות חכמות על כל מנה, ניקוד אוטומטי וסיכום חלשויות/חזקויות.',
    prompt: 'הוסף לקומפוננט MenuLearning שאלות AI מבוסס Gemini: לכל מנה, ה-AI מייצר 3 שאלות על: מרכיבים, אלרגנים וסיפור המנה. הניקוד מחושב אוטומטית (100 על תשובה נכונה, -20 על שגויה). בסיום, InvokeLLM מייצר סיכום עם weak_areas ו-strong_areas ושומר ב-MenuTrainingResult.',
  },
  {
    date: '2026-05-10',
    category: 'queue',
    label: 'מערכת פינוקים + מטבעות תור',
    description: 'הוספת מטבעות עלינא לממתינים בתור - לקוחות צוברים מטבעות על זמן המתנה וממירים לפינוקים (שתייה, קינוח וכו\').',
    prompt: 'הוסף לדף QueueJoin מערכת TimeTreat: לקוח רואה כמה מטבעות צבר (דקת המתנה = מטבע). כפתור "פדה פינוק" מציג רשימה מ-TimeTreat entity עם שם, תיאור, עלות ואמוג\'י. לחיצה קוראת ל-selectTreat function ומעדכנת selected_treat_id ו-time_credits_spent ב-QueueEntry. המארחת רואה בדשבורד איזה פינוק הוזמן.',
  },
  {
    date: '2026-05-09',
    category: 'queue',
    label: 'geofencing - בדיקת קרבה לתור',
    description: 'הוספת בדיקת מיקום לממתינים בתור - לפני קריאה לשולחן, המערכת בודקת אם הלקוח קרוב לסניף.',
    prompt: 'הוסף לדף QueueJoin geofencing: כשהמארחת לוחצת "קרא לשולחן", עדכן QueueEntry עם seat_countdown_active=true ו-proximity_check_at. בדף QueueJoin, אם seat_countdown_active=true, בקש מהלקוח אישור מיקום (navigator.geolocation). שלח lat/lng ל-updateProximityResponse function שמחשב מרחק ממיקום המסעדה (מ-RestaurantProfile) ומעדכן proximity_response: yes/no. אם no - הצג אזהרה למארחת.',
  },
  {
    date: '2026-05-08',
    category: 'reports',
    label: 'ייצוא לרואה חשבון',
    description: 'הוספת AccountantExport - ייצוא נתוני משמרות, טיפים ומשכורות לפורמט Excel/CSV לשימוש רואה חשבון.',
    prompt: 'הוסף לדף DataExport קומפוננט ExportToAccountantDialog: בחר טווח תאריכים ולחץ "ייצוא". המערכת מאחזרת TipReport + ShiftEndReport + WorkShift לאותו טווח. מייצרת מבנה מסודר עם: שם עובד, תאריך, שעות, טיפ, מנה. מייצאת כ-CSV עם jspdf או JSON. שמור AccoutantExport entity עם תאריך הייצוא, טווח ומי ייצא.',
  },
  {
    date: '2026-05-07',
    category: 'shifts',
    label: 'ציוד אייפדים/מסופונים',
    description: 'הוספת DevicesDashboard - מעקב אחר אייפדים ומסופונים: מי לקח, מתי, ומצב הציוד בהחזרה.',
    prompt: 'צור דף DevicesDashboard ו-entity DeviceAsset עם שדות: device_type (ipad/terminal), device_number, status (available/in_use/maintenance), current_holder_id, current_holder_name, checked_out_at, condition_ok, return_photo_url. הדף מציג גריד של כל הציוד עם צבע לפי סטטוס. לחיצה על ציוד פנוי פותחת GearUpDialog (בחר עובד). לחיצה על ציוד תפוס פותחת GearReturnDialog עם אפשרות צילום + דיווח נזק.',
  },
  {
    date: '2026-05-06',
    category: 'marketing',
    label: 'מרכז שיווק AI',
    description: 'הוספת MarketingAI - יועץ שיווקי מבוסס AI עם ניתוח מתחרים, תכנון קמפיינים ויצירת תוכן ברשתות חברתיות.',
    prompt: 'צור דף MarketingAI עם 5 טאבים: (1) פרופיל מסעדה - שמור RestaurantProfile עם מטרות, אתגרים, קהל יעד. (2) ניתוח AI - InvokeLLM עם add_context_from_internet=true לניתוח שוק ומתחרים. (3) תכנון יומי - DailyPlan שמציג 3 משימות שיווקיות ליום עם AI. (4) מעבדת פוסטים - MarketingPostLab ליצירת תוכן לפייסבוק/אינסטגרם. (5) מאגר רעיונות - BrainstormingPanel עם InvokeLLM לרעיונות קמפיין.',
  },
  {
    date: '2026-05-05',
    category: 'hr',
    label: 'שידור מיידי - Pushover',
    description: 'הוספת התראות Pushover על אירועים חשובים: מועמד חדש, ארכיון גיוס, גיוס עזוב, תקרית, סיום משמרת, בקשת חופשה ועוד.',
    prompt: 'הוסף backend functions עם Pushover API לשליחת push notifications: pushoverOnNewCandidate (JobCandidate create automation), pushoverOnIncident (Incident create), pushoverOnShiftEndReport (ShiftEndReport create), pushoverOnLeaveRequest (LeaveRequest create), pushoverOnShiftSwap (ShiftSwapRequest create). כל פונקציה מקבלת את ה-entity data, מעצבת הודעה ושולחת ל-PUSHOVER_API_TOKEN עם title + message. צור entity automations לכל אחד.',
  },
  {
    date: '2026-05-04',
    category: 'queue',
    label: 'דשבורד מארחת מתקדם',
    description: 'שדרוג QueueDashboard - הוספת drag & drop לסידור תור, ספירה לאחור של 3 דקות, פיצ\'ר "טיפולים" ועוד.',
    prompt: 'שדרג QueueDashboard: הוסף drag & drop עם @hello-pangea/dnd לסידור רשומות התור (עדכן sort_order). הוסף ספירה לאחור של 3 דקות כשלקוח נקרא (seat_countdown_active=true). הוסף כפתור "טופל" שמסמן treated=true ומציג ✅. הוסף פאנל צד עם היסטוריה של הלקוח מ-Customer entity. הצג estimated_wait_time לפי ממוצע זמן המתנה של השעה האחרונה.',
  },
];

const CATEGORY_CONFIG = {
  dashboard: { label: 'דשבורד', color: 'bg-blue-100 text-blue-800' },
  hr: { label: 'עובדים', color: 'bg-purple-100 text-purple-800' },
  queue: { label: 'תור', color: 'bg-green-100 text-green-800' },
  training: { label: 'הכשרות', color: 'bg-yellow-100 text-yellow-800' },
  reports: { label: 'דוחות', color: 'bg-orange-100 text-orange-800' },
  shifts: { label: 'משמרות', color: 'bg-pink-100 text-pink-800' },
  marketing: { label: 'שיווק', color: 'bg-indigo-100 text-indigo-800' },
  media: { label: 'מדיה', color: 'bg-teal-100 text-teal-800' },
};

function groupByWeek(items) {
  const groups = {};
  items.forEach(item => {
    const d = new Date(item.date);
    // שבוע - ראשון ביום שני
    const day = d.getDay(); // 0=Sun
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    const key = monday.toISOString().split('T')[0];
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

function PromptCard({ item }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(item.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-right"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Badge className={`${CATEGORY_CONFIG[item.category]?.color || 'bg-slate-100 text-slate-700'} text-xs flex-shrink-0`}>
            {CATEGORY_CONFIG[item.category]?.label || item.category}
          </Badge>
          <span className="font-semibold text-sm text-slate-800 truncate">{item.label}</span>
          <span className="text-xs text-slate-400 flex-shrink-0">{item.date}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
          <p className="text-sm text-slate-600">{item.description}</p>
          <div className="bg-slate-900 rounded-lg p-3 relative">
            <p className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed pr-8">{item.prompt}</p>
            <button
              onClick={handleCopy}
              className="absolute top-2 left-2 p-1.5 bg-slate-700 hover:bg-slate-600 rounded-md transition-colors"
              title="העתק Prompt"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-slate-300" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChangelogWidget({ defaultFilter = 'week' }) {
  const [filter, setFilter] = useState(defaultFilter); // 'week' | 'month' | 'all'
  const [showDialog, setShowDialog] = useState(false);

  const now = new Date();
  const filtered = CHANGELOG.filter(item => {
    const d = new Date(item.date);
    if (filter === 'week') {
      const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
      return d >= weekAgo;
    }
    if (filter === 'month') {
      const monthAgo = new Date(now); monthAgo.setMonth(now.getMonth() - 1);
      return d >= monthAgo;
    }
    return true;
  });

  const grouped = groupByWeek(filtered);

  const formatWeekLabel = (mondayStr) => {
    const d = new Date(mondayStr);
    const sunday = new Date(d); sunday.setDate(d.getDate() + 6);
    return `${d.getDate()}/${d.getMonth() + 1} – ${sunday.getDate()}/${sunday.getMonth() + 1}`;
  };

  return (
    <>
      <Card className="hover:shadow-lg transition-all">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              יומן שינויים
              <Badge className="bg-indigo-100 text-indigo-700 text-xs">{filtered.length} עדכונים</Badge>
            </CardTitle>
            <div className="flex items-center gap-1">
              {['week', 'month', 'all'].map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${filter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {f === 'week' ? 'שבוע' : f === 'month' ? 'חודש' : 'הכל'}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">אין עדכונים בתקופה זו</p>
          ) : (
            <>
              {/* preview - 3 ראשונים */}
              <div className="space-y-2">
                {filtered.slice(0, 3).map((item, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 border-b border-slate-100 last:border-0">
                    <Badge className={`${CATEGORY_CONFIG[item.category]?.color || 'bg-slate-100 text-slate-700'} text-xs flex-shrink-0`}>
                      {CATEGORY_CONFIG[item.category]?.label || item.category}
                    </Badge>
                    <span className="text-sm text-slate-700 truncate flex-1">{item.label}</span>
                    <span className="text-xs text-slate-400 flex-shrink-0 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />{item.date.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
              {filtered.length > 3 && (
                <button
                  onClick={() => setShowDialog(true)}
                  className="mt-3 w-full text-xs text-indigo-600 hover:text-indigo-800 font-medium py-1.5 hover:bg-indigo-50 rounded-lg transition-colors"
                >
                  + {filtered.length - 3} עוד שינויים — לחץ לפירוט מלא עם Prompts
                </button>
              )}
              {filtered.length <= 3 && (
                <button
                  onClick={() => setShowDialog(true)}
                  className="mt-3 w-full text-xs text-indigo-600 hover:text-indigo-800 font-medium py-1.5 hover:bg-indigo-50 rounded-lg transition-colors"
                >
                  לחץ לפירוט מלא עם Prompts
                </button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialog מלא */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              יומן שינויים מלא
              <Badge className="bg-indigo-100 text-indigo-700">{filtered.length} עדכונים</Badge>
            </DialogTitle>
          </DialogHeader>

          {/* פילטרים */}
          <div className="flex items-center gap-2 sticky top-0 bg-white z-10 pb-3 pt-1 border-b">
            <span className="text-sm text-slate-600 font-medium">תקופה:</span>
            {['week', 'month', 'all'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-sm px-3 py-1 rounded-lg transition-colors ${filter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {f === 'week' ? '7 ימים אחרונים' : f === 'month' ? 'חודש אחרון' : 'הכל'}
              </button>
            ))}
          </div>

          <div className="space-y-6 mt-2">
            {grouped.length === 0 ? (
              <p className="text-center text-slate-500 py-8">אין עדכונים בתקופה זו</p>
            ) : (
              grouped.map(([weekStart, items]) => (
                <div key={weekStart}>
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-bold text-slate-600">שבוע {formatWeekLabel(weekStart)}</span>
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{items.length} עדכונים</span>
                  </div>
                  <div className="space-y-2 mr-6">
                    {items.map((item, i) => (
                      <PromptCard key={i} item={item} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}