# אפיון: צ'קליסט עם ייחוס + מאמן AI (Checklist AI Coach)

**תאריך:** 2026-07-06
**סטטוס:** מאושר ע"י דביר (שיחת אפיון 2026-07-06)
**ענף יעד:** `migration`

## מטרה

מנהל מגדיר לכל משימה בצ'קליסט "איך זה אמור להיות" (תמונות-ייחוס ו/או קריטריונים בטקסט). עובד מבצע ומצלם, ומקבל **משוב AI בזמן אמת** לכל משימה (מייעץ, לא חוסם) עם תמונות הייחוס לצד; בסיום מופק **דוח סיכום** שהמנהל רואה לפני חתימה ויכול לתקן. כל תיקון מנהל הופך לדוגמה במאגר לומד, כך שה-AI משתפר ומתרכך עם הזמן.

## עקרונות מנחים (סוכמו)

1. **מייעץ, לא חוסם.** ה-AI אף פעם לא מונע המשך/סיום; הוא כותב הערכה + רמת ביטחון. המנהל והעובד הם הסמכות.
2. **טווח דוגמאות, לא ייחוס נוקשה אחד.** ה-AI שופט מול מספר תמונות "תקין"/"לא תקין" מצטברות, לא מול אידיאל בודד.
3. **למידה מתיקוני המנהל.** תיקון מנהל (👍/👎 + הערה) נשמר כדוגמה חדשה ומשפיע על בדיקות הבאות.
4. **הקשר מלא.** ה-AI מקבל את כל הקשר המשימה (אזור, תיאור, טקסט-עזר, קריטריונים, דוגמאות).

## רקע — מה קיים (מהמיפוי)

- **`Checklist`** (schema.prisma:462): `items` (Json array). כל item: `order, area, task, description, help_text, require_photo, evidence_type, critical, points, assigned_to_employee_id...`.
- **`ChecklistExecution`** (schema.prisma:486): `checklist_id, executed_by, execution_date, status, approving_manager_name, overall_score`, ו-`results` (Json array) — לכל item: `item_id/order, checked, notes, performed_by, photo_urls[]`.
- **`ChecklistExecutionArchive`** (schema.prisma:508): תמונת-מצב קבועה, `detailed_results[]`.
- פרונט: עורך `src/components/checklists/ChecklistEditDialog.jsx` (טאבים details/items), ביצוע `ChecklistExecution.jsx` (צ'ק + תמונה לכל item), ארכיון `ChecklistArchive.jsx`.
- תשתית AI: `apps/api/src/lib/llm.ts` `invokeLLM({ prompt, fileUrls[], responseSchema, model })` — תומך Gemini-vision. תמונות ל-MinIO דרך `uploadStreamToS3` / `UploadFile`, מוגשות כ-`/api/files/<key>`.

## ארכיטקטורה

### 1. הרחבות למבנה קיים (ללא מיגרציה — שדות Json)

**`Checklist.items[]`** — לכל משימה נוסיף (אופציונלי):
- `reference_photo_urls: string[]` — תמונות ייחוס שהמנהל העלה.
- `expected_criteria: string` — קריטריונים בטקסט ("משטח נוקה, גז כבוי, רצפה שטופה").
- `ai_review: boolean` — האם בדיקת AI פעילה למשימה (ברירת מחדל false).

**`ChecklistExecution.results[]`** — לכל משימה נוסיף (אופציונלי):
- `ai_review: { verdict: 'ok' | 'attention' | 'unknown', confidence: number, feedback: string, reviewed_at: string }` — חוות-דעת ה-AI.
- `manager_override: 'approved' | 'rejected' | null`, `manager_note: string` — תיקון המנהל (אות הלמידה).

### 2. מודל חדש (Prisma) — `ChecklistItemExample` (מאגר הלמידה)

```prisma
model ChecklistItemExample {
  id           String   @id @default(cuid())
  checklist_id String
  item_order   Int      // which task in the checklist
  photo_url    String
  label        String   // 'good' | 'bad'
  note         String?  // manager's note (why good/bad)
  source       String   @default("override") // manager_reference | approved_execution | override
  created_by   String?
  createdAt    DateTime @default(now())
  @@index([checklist_id, item_order])
}
```

### 3. שדה חדש על `ChecklistExecution`

```prisma
  ai_summary   String?  // end-of-run summary report shown to the manager before sign-off
```

### 4. פונקציות שרת (functions, `apps/api/src/functions/checklistAi.ts`)

- **`reviewChecklistItem({ checklist_id, item_order, photo_url })`** — בדיקה בזמן אמת. בונה prompt ל-Gemini-vision:
  - הקשר: `area, task, description, help_text, expected_criteria` מה-item.
  - תמונות: `item.reference_photo_urls` (ייחוס) + עד 5 דוגמאות `label='good'` ועד 5 `label='bad'` מ-`ChecklistItemExample` (cap לגודל/עלות) + תמונת העובד `photo_url` (אחרונה).
  - `responseSchema`: `{ verdict: 'ok'|'attention'|'unknown', confidence: number (0-100), feedback: string (עברית, קצר, ידידותי) }`.
  - הנחיה מפורשת בפרומפט: **מייעץ ולא פוסל; בהיעדר ייחוס/דוגמאות או ספק — verdict='unknown' עם הסבר; קבל וריאציות סבירות בזווית/תאורה.**
  - מודל: `gemini-2.5-flash` (זול). מחזיר את חוות-הדעת (הפרונט שומר אותה ב-`results[order].ai_review`).
- **`summarizeChecklistExecution({ execution_id })`** — קריאת טקסט אחת שמרכזת את כל `results[].ai_review` לדוח עברית קצר ("3 מצוינות, 2 להערה: ..."). נשמר ב-`ChecklistExecution.ai_summary`. נקרא בלחיצת "סיום" לפני חתימת המנהל.
- **`overrideChecklistItemReview({ execution_id, item_order, decision: 'approved'|'rejected', note })`** — המנהל מתקן. מעדכן את `results[order].manager_override/manager_note`, **ויוצר `ChecklistItemExample`** (`source='override'`, `label='good'` אם approved אחרת `'bad'`, `photo_url` = התמונה של אותה משימה). זה סוגר את לולאת הלמידה.
- **`addChecklistItemExample({ checklist_id, item_order, photo_url, label, note })`** — הוספת דוגמה ידנית (למשל מהעורך או מאישור ביצוע מצטיין).

כל הפונקציות דרך `registerFn` ב-`apps/api/src/functions/load.ts`, מוגנות `requireAuth`. הערה על הרשאות: מערכת התפקידים היום דקה (owner/user בלבד) ואין תפקיד "מנהל" נפרד. לכן `overrideChecklistItemReview` ו-`addChecklistItemExample` מוגנים ב-`requireAuth` (הפעולה מתבצעת בהקשר סקירת/חתימת המנהל); בעלים תמיד מורשה. אם בעתיד נרצה שער-מנהל ייעודי — נשתמש באותה גישה כמו במודול השכר (סימון עובד כמנהל). לא חוסם את הפיצ'ר.

### 5. פרונט

- **עורך `ChecklistEditDialog.jsx` (טאב משימות):** לכל משימה — מתג "בדיקת AI", שדה טקסט "קריטריונים", והעלאת/הצגת תמונות-ייחוס.
- **ביצוע `ChecklistExecution.jsx`:** למשימה עם `ai_review` — הצגת תמונות הייחוס + הקריטריונים לצד; אחרי העלאת תמונה → קריאת `reviewChecklistItem` → הצגת המשוב (✓ ירוק / ⚠️ הערה כתומה / "לא בטוח" אפור) + ביטחון. **אינדיקציה שזו המלצה בלבד.** ניתן לצלם שוב (בדיקה מחדש). בלחיצת "סיום" → קריאת `summarizeChecklistExecution` → הצגת הדוח מעל שדה חתימת המנהל.
- **ארכיון/סקירה `ChecklistArchive.jsx`:** למנהל — הצגת חוות-דעת ה-AI לכל משימה + כפתורי 👍/👎 (עם הערה) → `overrideChecklistItemReview` (למידה).

## טיפול בשגיאות

- כשל LLM / timeout → `verdict='unknown'`, `feedback='לא הצלחתי לבדוק את התמונה'`; **לא חוסם** את הביצוע.
- משימה בלי ייחוס ובלי קריטריונים אבל עם `ai_review=true` → `verdict='unknown'` עם הסבר שאין מול מה להשוות.
- תמונה חסרה/לא נגישה → דילוג עם הודעה ידידותית.
- כל קריאות ה-AI רצות אסינכרונית עם ספינר; כשל בבדיקה אחת לא מפיל את הצ'קליסט.

## בדיקות

- Unit (טהור): בניית קלט ה-review (בחירת עד 5 good/5 bad, קיצוץ, הרכבת ה-prompt-context), מיפוי verdict→תצוגה, לוגיקת override→example (label נכון לפי decision).
- Integration: `overrideChecklistItemReview` יוצר `ChecklistItemExample` נכון; `reviewChecklistItem` מכבד cap הדוגמאות; הרשאות (override = מנהל בלבד).
- ידני: מחזור מלא — הגדרת ייחוס בעורך → ביצוע עם משוב בזמן אמת → דוח סיום → תיקון מנהל → הדוגמה משפיעה על בדיקה הבאה.

## מחוץ לסקופ (שלב זה)

- חסימת המשך/סיום לפי ה-AI (מפורשות מייעץ בלבד).
- ניקוד אוטומטי של הצ'קליסט לפי ה-AI (ה-`overall_score` נשאר לפי סימון ידני; ה-AI מייעץ בלבד).
- זיהוי אוטומטי איזו דוגמה "מיושנת" (ניהול מחזור חיים של דוגמאות מעבר ל-cap פשוט של אחרונות).

## תלות / הערות פריסה

- שינויי סכמה: **SQL אדיטיבי** בלבד — טבלת `ChecklistItemExample` + עמודת `ChecklistExecution.ai_summary`. השדות בתוך `items[]`/`results[]` הם Json (ללא מיגרציה). מוחל על עלינא + כל הדיירים. `prisma db push` אסור (drift). ראה [[email-invoice-import]], [[db-drift-repair-toolkit]], `DEPLOY_BRIEF.md`.
- מנצל תשתית קיימת: `invokeLLM` (Gemini-vision), `uploadStreamToS3`/`UploadFile` (MinIO), מבני execution/archive קיימים.
