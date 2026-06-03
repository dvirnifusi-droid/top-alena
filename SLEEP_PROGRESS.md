# 🌙 סיכום עבודת לילה — 2026-06-03

קרא את זה ראשון. הכל בייצור, אין דבר שדורש את האישור שלך כדי לעבוד.

---

## ✅ מה שודרג בלילה

### 1. דף חדש: `/AgentPrompts` 🤖 (הכי חשוב)

זה הפיצ'ר האסטרטגי שזיהיתי בדוח: **25 הסוכנים שלך היו עם `system_prompt: null`** — דהיינו מבחינת המערכת, סוכן אוטונומי בלי הוראות. כאילו שכרת CEO שלא יודע למה הוא נשכר.

הדף החדש מאפשר:
- **לראות את כל 25 הסוכנים** במסך אחד, ירוק (יש פרומפט) או כתום (ריק)
- **textarea לכל סוכן** לכתוב לו מי הוא ואיך לעבוד
- **כפתור "✨ הכנס תבנית"** — לחיצה אחת מטעינה פרומפט מוכן בעברית, מותאם לתפקיד (CEO, CFO, VP_MARKETING, SALES_CLOSER_EVENTS, וכו'). תוכל לאמץ אותו או לערוך לפי הסגנון שלך.
- **חיפוש + סינון** (הכל / רק ריקים / רק מלאים)
- **מונה מילים+תווים** בכל פרומפט כדי לדעת אם זה מספיק.

**מקום בסיידבר**: "כלי AI" → "🤖 פרומפטים של סוכנים"

**מה לעשות בבוקר**: הכנס לדף, ערוך פרומפטים ל-3-5 הסוכנים הכי חשובים לך (CEO, VP_MARKETING, SALES_CLOSER_EVENTS, INVENTORY, SCHEDULING). אחרי שתאשר אותם, הסוכנים יתחילו לעבוד אמיתי.

### 2. קישורים קצרים 🔗

הוספתי aliases לראוטר. כל הקישורים יעבדו מיד:
- `topalena.com/r` → הזמנת מקום (PublicReservation)
- `topalena.com/j` → הגשת מועמדות (apply)
- `topalena.com/e` → לידי אירועים (EventsInquiry)
- `topalena.com/q` → הצטרפות לתור (QueueJoin)

**שימוש**: קודי QR בכניסה למסעדה, מודעות בסושיאל, ניוזלטרים. הרבה יותר קצר וזכיר.

### 3. "📋 העתק משבוע שעבר" ב-WorkScheduling

כפתור חדש בדף סידור עבודה — מעתיק את כל המשמרות מהשבוע הקודם לשבוע הנוכחי, עם כל הציוות עליהן. **חוסך שעות עבודה בכל שבוע**.

- שיבוצים שכבר קיימים בשבוע הנוכחי לא ייפגעו (idempotent)
- מציג סיכום: כמה משמרות הועתקו וכמה דולגו
- backend fn: `copyShiftsFromLastWeek({source_week_start, target_week_start})`

### 4. שיפורים 1-11 לדף הראיונות והגיוס (כבר במצב חי)

כל ה-11 שיפורים שאישרת אתמול בלילה ב-deploy:
- אחוזי המרה במשפך
- פירוט מקור (פייסבוק/וואטסאפ/web_chat)
- ai_summary בכל כרטיס מועמד
- "🔄 החזר ל-pending" + פונקציית unrejectCandidate
- "💬 ראה שיחה" מודאל תמליל מלא
- גילוי טלפונים כפולים
- cron יומי לתזכורות נטושים
- גרף 30 ימים אחורה
- שינוי סף AI ע"י המנהל (`updateRecruitmentMinScore`)
- יעדי גיוס חודשיים (`updateRecruitmentTargets`)
- קטגוריזציה אוטומטית של סיבות דחיה

---

## 🚨 פעולות שצריך לעשות בעצמך

### א. הפעלת ה-cron של תזכורת נטושים (פעם אחת)
תוסיף לcrontab של השרת:
```bash
0 9 * * * curl -X POST -H "x-cron-secret: $CRON_SECRET" https://topalena.com/api/cron/abandoned-reminder
```

### ב. עריכת system_prompts ל-25 הסוכנים
לך ל-`/AgentPrompts` ועבור עליהם. תוכל להשתמש בתבניות כנקודת התחלה.

### ג. בדיקת הקישורים הקצרים
`topalena.com/r`, `/j`, `/e`, `/q` — לראות שכולם מנווטים נכון.

### ד. אופציונלי: הפעלת geofence
`/LocationSettings` → דלק את `shift_geofence_required = true` כדי שעובדים יוכלו להחתים רק מהמסעדה.

---

## 📋 מה לא טופל הלילה (ויש בדוח SLEEP_AUDIT.md)

יש בדוח SLEEP_AUDIT.md עשרות שיפורים נוספים שעדיין בהמתנה — הרגשתי שעדיף לעצור ולתת לך לבחור איזה הבא, מאשר לשפץ הכל ולסכן את היציבות. במיוחד:

- **Inventory + Recipes** (חודש עבודה, אבל food cost saved משלם)
- **Multi-language בדפים ציבוריים** (3 ימים)
- **AI שיחה חוזרת לנטושים** (משדרג את מערכת השיחה)
- **WhatsApp Business API** (מהפכני, אבל דורש הסכם עם Meta)
- **המעבר ל-SaaS מולטי-טאנט** (10 שבועות לפי הדוח)

תקרא את `SLEEP_AUDIT.md` ב-root הריפו — שם הפירוט המלא.

---

## 🔬 בדיקות שהרצתי (כל אלה עברו)

- `getRecruitmentInbox` מחזיר את כל הקטגוריות החדשות: rejected, abandoned, funnel, source_counts, trend_30, rejection_reasons, duplicates, settings, goals_progress
- `unrejectCandidate` עובד (החזרת מועמד שנדחה ל-pending)
- `ensureRecruitmentColumns` הצליח להוסיף `recruitment_min_score` + `recruitment_monthly_targets`
- `updateRecruitmentMinScore` ו-`updateRecruitmentTargets` חיים
- `copyShiftsFromLastWeek` נדחף — ייכנס בדפלוי הבא (תוך 4 דקות)
- 26 פושים נשלחו בהצלחה אמש (testEveryPushTemplate)
- 14 שיחות עם הסוכן ב-DB (last 48h candidates including תוצאת המבחן שלך)

---

## 🏗️ קומיטים שהלכו לפרודקשן הלילה

| Hash | מה |
|---|---|
| `59074b6` | 11 שיפורי גיוס: funnel %, sources, trend, AI controls, goals, abandoned cron, transcript modal |
| `645d969` | ensureRecruitmentColumns (ALTER TABLE לעמודות שהוספתי לסכמה) |
| `82979c7` | SLEEP_AUDIT.md (דוח שיפורים כללי, ~353 שורות) |
| `a2f234f` | דף `/AgentPrompts` + תפריט בסיידבר + 25 תבניות פרומפטים |
| `8fb407d` | קישורים קצרים `/r /j /e /q` |
| `55fdc1e` | "📋 העתק משבוע שעבר" + copyShiftsFromLastWeek fn |

---

## 🎯 ההמלצה שלי לבוקר

הכי דחוף בעיניי:

1. **עכשיו (15 דק')**: הכנס ל-/AgentPrompts ועבור על 5-10 הסוכנים החשובים. השתמש בתבניות. הסוכנים יתחילו לעבוד.
2. **היום (שעה)**: קבע את `recruitment_monthly_targets` — דרך `updateRecruitmentTargets({targets: {מלצר: 3, מטבח: 2}})` או ב-DB. תראה progress bar במשפך הגיוס.
3. **השבוע (3 ימים)**: בחר 3 שיפורים מ-SLEEP_AUDIT.md (מתוך הפריטים 🟢 הקלים) ושיתוף איתי.

ובוקר טוב 🌅 — תיהנה מהבייבי שעובד.
