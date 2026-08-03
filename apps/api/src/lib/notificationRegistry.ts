// notificationRegistry.ts
// ---------------------------------------------------------------------------
// Single source of truth for every business-initiated WhatsApp/notification the
// app sends. Powers the owner-facing /NotificationSettings page.
//
// SAFETY MODEL: this registry only carries metadata + default *seeds*. It does
// NOT drive runtime by itself. At each send site the rule is:
//     const override = await notifOverrideText(key);
//     const text = override ? applyTokens(override, vars) : <EXISTING EXACT CODE STRING>;
// so a tenant that never edits a message keeps today's behavior byte-for-byte.
// `defaultText` below is what the editor shows as the starting point / "reset"
// value — it mirrors the current code string in {token} form.
// ---------------------------------------------------------------------------

export type NotifKind = 'cron' | 'event' | 'action';
export type NotifAudience = 'owner' | 'staff' | 'customer' | 'vendor' | 'tenant';

// full            -> reword freely; text rides the approved {{3}} var or SMS/free-form. No Meta review.
// meta_reapproval -> editable, but a reworded WhatsApp template must pass Meta review (24-72h); SMS meanwhile.
// none            -> assembled from live data (or fully owner-typed each send); toggle/schedule only, no text editor.
export type TextEditability = 'full' | 'meta_reapproval' | 'none';

// time  -> single wall-clock "HH:mm"
// slots -> per-weekday map { "0".."6": "HH:mm" } (0 = Sunday, Israel time)
// none  -> not schedulable (interval-, proximity-, event- or action-driven)
export type ScheduleShape = 'time' | 'slots' | 'none';

export interface NotifVar {
  token: string; // e.g. 'name' -> used as {name} in the template
  label: string; // Hebrew description shown as an insertable chip
}

export interface NotifDef {
  key: string;
  audience: NotifAudience;
  label: string;        // Hebrew title in the settings UI
  description: string;  // Hebrew "when / to whom"
  kind: NotifKind;
  defaultEnabled: boolean;
  scheduleShape: ScheduleShape;
  defaultSchedule?: { time?: string; slots?: Record<string, string> };
  // false = shown but not on/off-toggleable (transactional guest sends / owner
  // actions the owner explicitly triggers). Owner 'action' kinds are also
  // treated as always-on. Default true.
  gateable?: boolean;
  textEditability: TextEditability;
  defaultText?: string;      // editor seed (mirrors current code string), {token} form
  variables?: NotifVar[];
  note?: string;             // extra hint shown in the editor
  // Owner-editable "send X minutes after the trigger" delay. Persisted in
  // RestaurantProfile.team_nudges at `path` (e.g. 'clockin.delay_min') — the SAME
  // value the runtime reads, so the card and the ops-manager panel never drift.
  delayConfig?: { path: string; default: number; min: number; max: number };
  source: string;            // file:line of the live send (provenance / audit)
}

const V = (token: string, label: string): NotifVar => ({ token, label });
const NAME = V('name', 'שם');
const BRAND = V('brand', 'שם העסק');
const FIRST = V('first', 'שם פרטי');
const LINK = V('link', 'קישור');

export const NOTIFICATIONS: NotifDef[] = [
  // ─────────────────────────── OWNER ───────────────────────────
  {
    key: 'daily_hours_report', audience: 'owner', kind: 'cron',
    label: 'דוח שעות יומי', description: 'סיכום שעות העובדים — נשלח אליך',
    defaultEnabled: true, scheduleShape: 'slots',
    defaultSchedule: { slots: { '0': '01:00', '1': '01:00', '2': '01:00', '3': '01:00', '4': '03:30', '5': '17:00', '6': '02:00' } },
    textEditability: 'none', source: 'dailyHoursReport.ts:247',
  },
  {
    key: 'morning_brief', audience: 'owner', kind: 'cron',
    label: 'בוקר טוב', description: 'תמונת מצב יומית של העסק — כל בוקר ב-08:00',
    defaultEnabled: true, scheduleShape: 'none',
    textEditability: 'none', note: 'שעת השליחה (08:00) נקבעת בשרת', source: 'morningBrief.ts:414',
  },
  {
    key: 'end_of_day_brief', audience: 'owner', kind: 'cron',
    label: 'סיכום יום', description: 'סיכום היום — כל ערב ב-23:30',
    defaultEnabled: true, scheduleShape: 'none',
    textEditability: 'none', note: 'שעת השליחה (23:30) נקבעת בשרת', source: 'morningBrief.ts:391',
  },
  {
    key: 'weekly_insights', audience: 'owner', kind: 'cron',
    label: 'סיכום שבועי', description: 'סיכום השבוע — כל יום ראשון ב-09:00',
    defaultEnabled: true, scheduleShape: 'none',
    textEditability: 'none', note: 'שעת השליחה (ראשון 09:00) נקבעת בשרת', source: 'weeklyInsights.ts:168',
  },
  {
    key: 'wake_alarm_brief', audience: 'owner', kind: 'cron',
    label: 'שעון מעורר — מיני בריף', description: 'אירועי היום + משימות פתוחות',
    defaultEnabled: true, scheduleShape: 'time', defaultSchedule: { time: '07:30' },
    textEditability: 'none', source: 'whatsappCalendar.ts:223',
  },
  {
    key: 'owner_reminder', audience: 'owner', kind: 'event',
    label: 'תזכורת שהגדרת', description: 'תזכורת אישית שקבעת — בזמן שקבעת',
    defaultEnabled: true, scheduleShape: 'none',
    textEditability: 'full', defaultText: '⏰ תזכורת: {text}',
    variables: [V('text', 'תוכן התזכורת')], source: 'reminders.ts:30',
  },
  {
    key: 'calendar_reminder_lead', audience: 'owner', kind: 'event',
    label: 'תזכורת יומן — לפני', description: 'X דקות לפני אירוע ביומן',
    defaultEnabled: true, scheduleShape: 'none',
    textEditability: 'full', defaultText: '⏰ בעוד {minutes} דקות: {title}',
    variables: [V('minutes', 'דקות עד האירוע'), V('title', 'כותרת האירוע')], source: 'whatsappCalendar.ts:162',
  },
  {
    key: 'calendar_reminder_now', audience: 'owner', kind: 'event',
    label: 'תזכורת יומן — עכשיו', description: 'בשעת האירוע ביומן',
    defaultEnabled: true, scheduleShape: 'none',
    textEditability: 'full', defaultText: '🔔 עכשיו: {title}',
    variables: [V('title', 'כותרת האירוע')], source: 'whatsappCalendar.ts:169',
  },
  {
    key: 'event_lead_alert', audience: 'owner', kind: 'event',
    label: 'ליד אירוע חדש', description: 'כשדנה מסיימת שיחה עם ליד אירוע',
    defaultEnabled: true, scheduleShape: 'none', textEditability: 'none', source: 'whatsappAlerts.ts:44',
  },
  {
    key: 'bad_review_alert', audience: 'owner', kind: 'event',
    label: 'ביקורת שלילית', description: 'כשמתקבל משוב נמוך (1–3 כוכבים)',
    defaultEnabled: true, scheduleShape: 'none', textEditability: 'none', source: 'whatsappAlerts.ts:61',
  },
  {
    key: 'critical_incident_alert', audience: 'owner', kind: 'event',
    label: 'אירוע קריטי/חמור', description: 'כשנפתח אירוע חמור',
    defaultEnabled: true, scheduleShape: 'none', textEditability: 'none', source: 'whatsappAlerts.ts:76',
  },
  {
    key: 'large_reservation_alert', audience: 'owner', kind: 'event',
    label: 'הזמנה גדולה', description: 'כשנכנסת הזמנה ל-20+ סועדים',
    defaultEnabled: true, scheduleShape: 'none', textEditability: 'none', source: 'whatsappAlerts.ts:94',
  },
  {
    key: 'cash_discrepancy_alert', audience: 'owner', kind: 'event',
    label: 'פער קופה', description: 'כשנסגר דוח משמרת עם פער משמעותי',
    defaultEnabled: true, scheduleShape: 'none', textEditability: 'none', source: 'whatsappAlerts.ts:110',
  },
  {
    key: 'invoices_imported_alert', audience: 'owner', kind: 'event',
    label: 'חשבוניות נקלטו מהמייל', description: 'כשנקלטות חשבוניות חדשות ממייל',
    defaultEnabled: true, scheduleShape: 'none',
    textEditability: 'full',
    defaultText: '📬 *נקלטו {count} חשבוניות חדשות מהמייל*\nממתינות לבדיקה ואישור בדף /Invoices.',
    variables: [V('count', 'מספר חשבוניות')], source: 'whatsappAlerts.ts:114',
  },
  {
    key: 'email_disconnected_alert', audience: 'owner', kind: 'event',
    label: 'תיבת מייל נותקה', description: 'כשחיבור המייל לחשבוניות נכשל',
    defaultEnabled: true, scheduleShape: 'none',
    textEditability: 'full',
    defaultText: '⚠️ *תיבת המייל {email} נותקה*\nסיסמת האפליקציה בוטלה או השתנתה. חבר מחדש בדף /EmailInvoiceSettings.',
    variables: [V('email', 'כתובת המייל')], source: 'whatsappAlerts.ts:121',
  },
  {
    key: 'cashflow_alert', audience: 'owner', kind: 'cron',
    label: 'התראת תזרים', description: 'כשהיתרה הצפויה צוללת — בבוקר',
    defaultEnabled: true, scheduleShape: 'time', defaultSchedule: { time: '09:00' },
    textEditability: 'full',
    defaultText: '💸 *התראת תזרים*\n\nהיתרה הצפויה צוללת ל-₪{balance} ב-{day}.\n\n🔗 פירוט: {url}/CashFlow',
    variables: [V('balance', 'יתרה צפויה'), V('day', 'תאריך הצניחה'), V('url', 'כתובת האפליקציה')],
    source: 'load.ts:13184',
  },
  {
    key: 'supplier_order_reminder', audience: 'owner', kind: 'cron',
    label: 'תזכורת הזמנת ספקים', description: 'בשעת הדדליין של כל ספק',
    defaultEnabled: true, scheduleShape: 'none', textEditability: 'none',
    note: 'הזמן נקבע פר-ספק בדף הספקים', source: 'load.ts:8049',
  },
  {
    key: 'late_employee_alert', audience: 'owner', kind: 'cron',
    label: 'עובד מאחר / לא הגיע', description: 'כשעובד מאחר להחתמת כניסה',
    defaultEnabled: true, scheduleShape: 'none', textEditability: 'none', source: 'load.ts:12654',
  },
  {
    key: 'weekly_schedule_ready', audience: 'owner', kind: 'cron',
    label: 'סידור עבודה נבנה', description: 'כשהסידור השבועי מוכן — שלישי 16:00',
    defaultEnabled: true, scheduleShape: 'none',
    textEditability: 'none', note: 'שעת בניית הסידור נקבעת בשרת', source: 'load.ts:12434',
  },
  {
    key: 'invoice_anomaly_alert', audience: 'owner', kind: 'cron',
    label: 'חשבוניות חריגות', description: 'חשבוניות חריגות מאתמול — בבוקר',
    defaultEnabled: true, scheduleShape: 'time', defaultSchedule: { time: '10:00' },
    textEditability: 'none', source: 'load.ts:12484',
  },
  {
    key: 'crisis_alert', audience: 'owner', kind: 'cron',
    label: 'התראת משבר', description: 'מקבץ חריג של אירועים חמורים',
    defaultEnabled: true, scheduleShape: 'none', textEditability: 'none',
    note: 'נבדק כל 10 דקות', source: 'load.ts:12520',
  },
  {
    key: 'content_for_approval', audience: 'owner', kind: 'cron',
    label: 'תוכן לאישור (סטורי/פוסט)', description: 'תוכן שיווקי מבוסס ביקורות 5⭐ — אחה"צ',
    defaultEnabled: true, scheduleShape: 'time', defaultSchedule: { time: '14:00' },
    textEditability: 'none', source: 'load.ts:12565',
  },
  {
    key: 'nudge_summary', audience: 'owner', kind: 'cron',
    label: 'סיכום תזכורות עובדים', description: 'אחרי כל מקבץ תזכורות לעובדים',
    defaultEnabled: true, scheduleShape: 'none', textEditability: 'none', source: 'teamNudges.ts:168',
  },

  // ─────────────────────────── STAFF ───────────────────────────
  {
    key: 'nudge_availability', audience: 'staff', kind: 'cron',
    label: 'תזכורת הגשת זמינות', description: 'לעובדים שלא הגישו — רביעי + חמישי',
    defaultEnabled: true, scheduleShape: 'none',
    textEditability: 'full',
    defaultText: 'היי {first} 👋\nתזכורת מההנהלה — עדיין לא הגשת זמינות לשבוע הבא ({range}).\nבלי הגשה אי אפשר לשבץ אותך 🙏\n🔗 {link}',
    variables: [FIRST, V('range', 'טווח תאריכים'), LINK],
    note: 'השעה נקבעת בהגדרות הצוות', source: 'teamNudges.ts:161',
  },
  {
    key: 'nudge_clockin', audience: 'staff', kind: 'cron',
    label: 'תזכורת החתמת כניסה', description: 'לעובד משובץ שלא החתים — כמה דקות אחרי תחילת המשמרת (ניתן לשינוי)',
    defaultEnabled: true, scheduleShape: 'none',
    delayConfig: { path: 'clockin.delay_min', default: 10, min: 1, max: 180 },
    textEditability: 'full',
    defaultText: 'היי {first} 👋\nשים/י לב — את/ה משובץ/ת למשמרת שהתחילה ב-{start} ועדיין אין החתמת כניסה.\nאם את/ה כבר פה — תחתום/י עכשיו 🙏 ואם יש בעיה, עדכנו את המנהל.\n🔗 {link}',
    variables: [FIRST, V('start', 'שעת תחילת משמרת'), LINK], source: 'teamNudges.ts:207',
  },
  {
    key: 'nudge_checklist', audience: 'staff', kind: 'cron',
    label: 'תזכורת צ׳קליסט', description: 'צ׳קליסטים שלא הושלמו — בוקר וערב',
    defaultEnabled: true, scheduleShape: 'none', textEditability: 'none',
    note: 'שעות: בוקר 11:00 / ערב 19:00', source: 'teamNudges.ts:276',
  },
  {
    key: 'schedule_open', audience: 'staff', kind: 'cron',
    label: 'סידור נפתח לזמינות', description: 'לכל העובדים — ראשון',
    defaultEnabled: true, scheduleShape: 'time', defaultSchedule: { time: '10:00' },
    textEditability: 'full',
    defaultText: '*היי {name}* 👋\n\nהסידור לשבוע הבא ({range}) נפתח להגשת זמינות.\n\nהיכנס/י לאפליקציה ומלא/י:\n{link}\n\nסגירה: יום שלישי 16:00.',
    variables: [NAME, V('range', 'טווח תאריכים'), LINK], source: 'load.ts:11904',
  },
  {
    key: 'schedule_reminder', audience: 'staff', kind: 'cron',
    label: 'תזכורת זמינות', description: 'למי שלא הגיש — שני',
    defaultEnabled: true, scheduleShape: 'time', defaultSchedule: { time: '10:00' },
    textEditability: 'full',
    defaultText: '⏰ *תזכורת — {name}*\n\nעוד לא הגשת זמינות לשבוע הבא. סגירה מחר (שלישי) ב-16:00.\n\n{link}',
    variables: [NAME, LINK], source: 'load.ts:11923',
  },
  {
    key: 'schedule_final_reminder', audience: 'staff', kind: 'cron',
    label: 'תזכורת זמינות אחרונה', description: 'שעתיים לפני הסגירה — שלישי',
    defaultEnabled: true, scheduleShape: 'time', defaultSchedule: { time: '14:00' },
    textEditability: 'full',
    defaultText: '🚨 *תזכורת אחרונה — {name}*\n\nנשארו ~2 שעות לסגירה (16:00 היום). אם לא תגיש — לא נוכל לשבץ אותך השבוע.\n\n{link}',
    variables: [NAME, LINK], source: 'load.ts:11942',
  },
  {
    key: 'schedule_published', audience: 'staff', kind: 'action',
    label: 'פרסום סידור', description: 'כשאתה מפרסם את הסידור השבועי',
    defaultEnabled: true, scheduleShape: 'none', textEditability: 'none',
    note: 'כולל את רשימת המשמרות האישית של כל עובד', source: 'whatsappActions.ts:1149',
  },
  {
    key: 'employee_approved_credentials', audience: 'staff', kind: 'event',
    label: 'פרטי כניסה לעובד מאושר', description: 'כשאתה מאשר עובד חדש',
    defaultEnabled: true, scheduleShape: 'none',
    textEditability: 'full',
    defaultText: 'אושרת לצוות {brand}! כניסה: {url} · מייל: {email} · סיסמה זמנית: {password} (שנה/י אחרי הכניסה הראשונה)',
    variables: [BRAND, V('url', 'כתובת כניסה'), V('email', 'מייל'), V('password', 'סיסמה זמנית')],
    source: 'load.ts:25210',
  },
  {
    key: 'team_broadcast', audience: 'staff', kind: 'action',
    label: 'הודעה מההנהלה (שידור)', description: 'כשאתה משדר הודעה לצוות',
    defaultEnabled: true, scheduleShape: 'none', textEditability: 'none',
    note: 'הטקסט מוקלד על-ידך בכל שידור', source: 'teamNudges.ts:312',
  },
  {
    key: 'employee_invite', audience: 'staff', kind: 'action',
    label: 'הזמנת עובד חדש', description: 'כשאתה מזמין עובד להצטרף',
    defaultEnabled: true, scheduleShape: 'none', textEditability: 'meta_reapproval',
    note: 'תבנית מאושרת של Meta — שינוי דורש אישור מחדש', source: 'whatsappActions.ts (employee_invite)',
  },

  // ─────────────────────────── CUSTOMER ───────────────────────────
  {
    key: 'club_welcome', audience: 'customer', kind: 'event',
    label: 'הצטרפות למועדון', description: 'כשלקוח נרשם למועדון ומאשר דיוור',
    defaultEnabled: true, scheduleShape: 'none', textEditability: 'meta_reapproval',
    note: 'התבנית מאושרת ב-Meta; הטקסט החופשי נערך בהגדרות המועדון', source: 'clubCore.ts:424',
  },
  {
    key: 'birthday_greeting', audience: 'customer', kind: 'cron',
    label: 'ברכת יום הולדת', description: 'ללקוח שיום ההולדת שלו היום',
    defaultEnabled: true, scheduleShape: 'time', defaultSchedule: { time: '09:00' },
    textEditability: 'full',
    defaultText: 'יום הולדת שמח, {name}! 🎉🎂\nאיזה יום מיוחד — אם תבוא היום, הקינוח על {brand} 🍰\nנשמח לחגוג איתך 🌿',
    variables: [NAME, BRAND], note: 'קישור להסרה מהדיוור מתווסף אוטומטית', source: 'load.ts:2004',
  },
  {
    key: 'anniversary_greeting', audience: 'customer', kind: 'cron',
    label: 'ברכת יום נישואין', description: 'ללקוח שיום הנישואין שלו היום',
    defaultEnabled: true, scheduleShape: 'none',
    note: 'נשלח בשעת ברכות יום ההולדת', textEditability: 'full',
    defaultText: 'מזל טוב, {name}! 🥂\nהיום יום מיוחד — בוא לחגוג אצלנו ויש לנו מתנה.\n{address} 🌿',
    variables: [NAME, V('address', 'כתובת המסעדה')], source: 'load.ts:2045',
  },
  {
    key: 'drip_welcome', audience: 'customer', kind: 'cron',
    label: 'ברוך הבא (אחרי ביקור ראשון)', description: '18–36 שעות אחרי ביקור ראשון',
    defaultEnabled: true, scheduleShape: 'none',
    textEditability: 'full',
    defaultText: 'תודה ששמת אותנו במפה שלך, {name} 🌿\nתקווה שנהניתם — לקראת הביקור הבא יש לך 10% הנחה.\nרק תגיד "ראיתי בוואטסאפ" למלצר.\n{brand}',
    variables: [NAME, BRAND], note: 'קישור לכרטיס + הסרה מתווספים אוטומטית', source: 'load.ts:2125',
  },
  {
    key: 'drip_nps_vip', audience: 'customer', kind: 'cron',
    label: 'בקשת ביקורת — לקוח VIP', description: '2–4 ימים אחרי ביקור (לקוח חוזר)',
    defaultEnabled: true, scheduleShape: 'none',
    textEditability: 'full',
    defaultText: 'היי {name}, איך היה אצלנו?\nאם נהנית — נשמח לביקורת קטנה ב-Google:\n{review_link}\nתודה רבה 🌿',
    variables: [NAME, V('review_link', 'קישור לביקורת Google (לפי הגדרת העסק)')], source: 'load.ts:2161',
  },
  {
    key: 'drip_nps_regular', audience: 'customer', kind: 'cron',
    label: 'בקשת משוב — לקוח רגיל', description: '2–4 ימים אחרי ביקור (לקוח חדש)',
    defaultEnabled: true, scheduleShape: 'none',
    textEditability: 'full',
    defaultText: 'היי {name},\nאיך היה אצלנו? תן לנו 1-5 בקצרה.\nכל משוב נכנס ישירות למנהל ועוזר לנו להשתפר 🌿',
    variables: [NAME], source: 'load.ts:2161',
  },
  {
    key: 'drip_pre_birthday', audience: 'customer', kind: 'cron',
    label: 'לפני יום הולדת', description: '7 ימים לפני יום ההולדת',
    defaultEnabled: true, scheduleShape: 'none',
    textEditability: 'full',
    defaultText: 'היי {name}! 🎂\nבעוד שבוע יש לך יום הולדת — נשמח לחגוג איתך!\nתזמין שולחן וקבל קינוח חינם.\nרוטשילד 104, ראשון לציון 🌿',
    variables: [NAME], source: 'load.ts:2205',
  },
  {
    key: 't24_survey', audience: 'customer', kind: 'cron',
    label: 'סקר יום אחרי הביקור', description: 'ללקוחות שביקרו אתמול — צהריים',
    defaultEnabled: true, scheduleShape: 'none',
    note: 'שעת השליחה (~12:00) נקבעת בשרת', textEditability: 'full',
    defaultText: 'שלום {name}!\n\nאיך הייתה הארוחה אתמול ב{brand}?\nנשמח לחוות דעתך — לוקח 30 שניות:\n{link}\n\nתודה ולהתראות 🌿',
    variables: [NAME, BRAND, LINK], source: 'load.ts:19928',
  },
  {
    key: 'club_broadcast', audience: 'customer', kind: 'action',
    label: 'שידור למועדון', description: 'כשאתה שולח הודעה לחברי המועדון',
    defaultEnabled: true, scheduleShape: 'none', textEditability: 'none',
    note: 'הטקסט מוקלד על-ידך בכל שידור', source: 'whatsappActions.ts:1255',
  },
  {
    key: 'marketing_blast', audience: 'customer', kind: 'action',
    label: 'קמפיין שיווקי ללקוחות', description: 'כשאתה שולח קמפיין לרשימת הלקוחות',
    defaultEnabled: true, scheduleShape: 'none', textEditability: 'none',
    note: 'הטקסט מוקלד על-ידך; קישור להסרה מתווסף אוטומטית', source: 'marketingBlast.ts:98',
  },
  {
    key: 'reservation_confirmed', audience: 'customer', kind: 'event',
    label: 'אישור הזמנה', description: 'כשהזמנה מאושרת / פיקדון נתפס',
    defaultEnabled: true, gateable: false, scheduleShape: 'none', textEditability: 'meta_reapproval',
    note: 'תבנית WhatsApp מאושרת + SMS; שינוי הנוסח דורש אישור Meta', source: 'load.ts:9420',
  },
  {
    key: 'reservation_day_reminder', audience: 'customer', kind: 'cron',
    label: 'תזכורת הזמנה ליום', description: '90 דק׳–6 שעות לפני הישיבה',
    defaultEnabled: true, gateable: false, scheduleShape: 'none', textEditability: 'meta_reapproval',
    note: 'זמן השליחה נגזר משעת ההזמנה', source: 'load.ts:9216',
  },
  {
    key: 'waitlist_added', audience: 'customer', kind: 'event',
    label: 'נרשמת לרשימת המתנה', description: 'כשנוצרת הזמנת המתנה',
    defaultEnabled: true, gateable: false, scheduleShape: 'none', textEditability: 'meta_reapproval',
    source: 'load.ts:9443',
  },
  {
    key: 'table_ready', audience: 'customer', kind: 'event',
    label: 'התפנה שולחן', description: 'כשמתפנה שולחן לאורח בהמתנה',
    defaultEnabled: true, gateable: false, scheduleShape: 'none', textEditability: 'meta_reapproval',
    source: 'load.ts:9692',
  },

  // ─────────────────────────── VENDOR ───────────────────────────
  {
    key: 'vendor_message', audience: 'vendor', kind: 'action',
    label: 'הודעה לספק', description: 'כשאתה שולח הודעה לספק בודד',
    defaultEnabled: true, scheduleShape: 'none', textEditability: 'none',
    note: 'הטקסט מוקלד על-ידך', source: 'load.ts:3733',
  },
  {
    key: 'vendor_campaign', audience: 'vendor', kind: 'action',
    label: 'קמפיין לספקים', description: 'כשאתה שולח קמפיין לכמה ספקים',
    defaultEnabled: true, scheduleShape: 'none', textEditability: 'none',
    note: 'הטקסט מוקלד על-ידך', source: 'load.ts:3824',
  },

  // ─────────────────────────── TENANT (Apollo) ───────────────────────────
  {
    key: 'new_tenant_ready', audience: 'tenant', kind: 'event',
    label: 'המערכת שלך מוכנה', description: 'כשמסעדה חדשה מוקמת במערכת',
    defaultEnabled: true, gateable: false, scheduleShape: 'none', textEditability: 'none',
    note: 'כולל פרטי כניסה — לא מומלץ לערוך', source: 'load.ts:18179',
  },
];

// ─────────────────────────── helpers ───────────────────────────

export const byKey = (k: string): NotifDef | undefined => NOTIFICATIONS.find((n) => n.key === k);

export const AUDIENCE_ORDER: NotifAudience[] = ['owner', 'staff', 'customer', 'vendor', 'tenant'];
export const AUDIENCE_LABEL: Record<NotifAudience, string> = {
  owner: 'לבעלים ולמנהלים',
  staff: 'לעובדים',
  customer: 'ללקוחות ואורחים',
  vendor: 'לספקים',
  tenant: 'למסעדה חדשה',
};

/** Fill {token} placeholders in an owner-edited template with runtime values.
 *  Unknown tokens are left intact; missing values render as empty string. */
export function applyTokens(tpl: string, vars: Record<string, string | number | null | undefined>): string {
  return String(tpl).replace(/\{(\w+)\}/g, (m, tok) => {
    if (Object.prototype.hasOwnProperty.call(vars, tok)) {
      const v = vars[tok];
      return v == null ? '' : String(v);
    }
    return m; // leave unrecognized placeholders as-is
  });
}
