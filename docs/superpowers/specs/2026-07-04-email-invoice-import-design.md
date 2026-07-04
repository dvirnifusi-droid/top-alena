# אפיון: קליטת חשבוניות אוטומטית מהמייל (Email Invoice Import)

**תאריך:** 2026-07-04
**סטטוס:** מאושר ע"י דביר (שיחת אפיון 2026-07-04)
**ענף יעד:** `migration` (פרודקשן — apps/api + apps/web)

## מטרה

המערכת מושכת חשבוניות ספקים אוטומטית מתיבות Gmail מוגדרות, מכניסה אותן לארכיון החשבוניות בסטטוס "בהמתנה" (`pending_review`), ומציגה למנהל מסך אישור אחד: אישור/דחייה + עריכת שדות + עדכון מלאי. המנהל לא מקליד כלום — רק מאשר.

## רקע — מה קיים היום

- **סריקת חשבוניות מ-WhatsApp:** `apps/api/src/lib/whatsappInvoice.ts` — תמונה/PDF → MinIO → `invokeLLM()` (`apps/api/src/lib/llm.ts`, Gemini ברירת מחדל) עם JSON schema → יצירת `Invoice` + `InvoiceItem` בסטטוס `pending_review`.
- **מודלים:** `Invoice` (status, payment_status, supplier), `InvoiceItem` (product_name, quantity, unit_price), `Inventory` (item_name, current_stock, unit, cost_per_unit, supplier_id...) — schema.prisma ~שורות 1340–1372.
- **אין סנכרון חשבונית→מלאי** היום. נוסף כאן.
- **קרונים:** `apps/api/src/routes/cron.ts` — HTTP endpoints עם `CRON_SECRET`, מוזנקים מ-crontab בשרת.
- **Google OAuth:** `google-auth-library` קיים (`GOOGLE_CLIENT_ID`), service account לקלנדר. אין Gmail API עדיין.
- **WhatsApp יוצא:** Twilio — ערוץ ההתראות המועדף (דביר: "מעבירים הכל לשם", לא פוש).

## תיבות המייל

- dvirnifusi@gmail.com
- nivnin@gmail.com

ניתנות לניהול (הוספה/ניתוק) במסך הגדרות. חיבור OAuth חד-פעמי לכל תיבה, scope `gmail.readonly` בלבד (קריאה — בלי שליחה/מחיקה).

## ארכיטקטורה

### 1. מודלים חדשים (Prisma)

```prisma
model EmailAccount {
  id             String   @id @default(cuid())
  email          String   @unique
  refresh_token  String   // מוצפן (AES, מפתח ב-ENV)
  status         String   @default("active") // active | disconnected | error
  last_checked_at DateTime?
  last_history_id String?  // Gmail historyId לסריקה אינקרמנטלית
  created_at     DateTime @default(now())
}

model EmailSenderRule {
  id              String   @id @default(cuid())
  sender_email    String   @unique
  rule            String   @default("auto") // auto | allow | block
  reject_count    Int      @default(0)
  supplier_id     String?  // שיוך לספק מוכר
  updated_at      DateTime @updatedAt
}

model ProductAlias {
  id                String  @id @default(cuid())
  alias_name        String  @unique // השם כפי שמופיע בחשבוניות
  inventory_item_id String  // הפריט במלאי שאליו משויך
  supplier_id       String?
  created_at        DateTime @default(now())
}
```

### 2. הרחבות למודלים קיימים

`Invoice`: להוסיף `source String @default("manual")` (ערכים: manual | whatsapp | email), `email_message_id String? @unique` (Gmail message id — מניעת עיבוד כפול), `email_account String?`, `inventory_applied Boolean @default(false)`.

`InvoiceItem`: להוסיף `inventory_action String?` (add_existing | create_new | skip), `inventory_item_id String?` — נקבעים במסך האישור.

### 3. חיבור Gmail (OAuth)

- Routes חדשים ב-`apps/api/src/routes/emailAccounts.ts`:
  - `GET /api/email-accounts` — רשימת תיבות + סטטוס.
  - `GET /api/email-accounts/connect` — מפנה ל-Google consent (scope: gmail.readonly, access_type=offline, prompt=consent).
  - `GET /api/email-accounts/callback` — שומר refresh_token מוצפן.
  - `DELETE /api/email-accounts/:id` — ניתוק (revoke + מחיקה).
- דרישות חד-פעמיות ב-Google Cloud Console: הפעלת Gmail API, הוספת scope למסך ה-consent, redirect URI. משתמש ב-`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` הקיימים.

### 4. קרון סריקה — `POST /api/cron/email-invoice-scan`

רץ כל 10 דקות (שורה חדשה ב-crontab בשרת). לכל תיבה פעילה:

1. **שליפה אינקרמנטלית:** Gmail `history.list` מ-`last_history_id` (או `messages.list` עם `q="has:attachment newer_than:1d"` כ-fallback). בחיבור ראשון: backfill של 30 יום אחורה (`newer_than:30d has:attachment`).
2. **סינון:**
   - שולח עם rule=block → דילוג.
   - שולח עם rule=allow (ספק מוכר) + קובץ מצורף PDF/JPG/PNG → נכנס לעיבוד ישירות.
   - שולח לא מוכר + קובץ מצורף → שלב סיווג AI: prompt קצר ("האם זו חשבונית ספק לעסק מזון?") על שם הקובץ, נושא המייל וגוף המייל; רק אם confidence גבוה → עיבוד, עם דגל "ספק חדש — זוהה אוטומטית".
3. **עיבוד:** הורדת הקובץ המצורף → MinIO → אותו pipeline חילוץ כמו WhatsApp (refactor: לחלץ מ-`whatsappInvoice.ts` פונקציה משותפת `extractInvoiceFromFile(fileUrl)` לקובץ lib חדש `invoiceExtraction.ts`, כולל חילוץ שורות פריטים + fuzzy-match לספק).
4. **התאמת מלאי מוקדמת:** לכל שורת פריט — חיפוש ב-`ProductAlias` ואז fuzzy-match מול `Inventory.item_name`; שמירת ההצעה (`inventory_action`, `inventory_item_id`) על ה-InvoiceItem.
5. **מניעת כפילויות:** דילוג אם קיימת חשבונית עם אותו `email_message_id`, או אותו (ספק + מספר חשבונית) — כולל מול חשבוניות שנקלטו ב-WhatsApp.
6. **יצירה:** `Invoice` בסטטוס `pending_review`, source=email + `InvoiceItem`s. המלאי **לא** מתעדכן בשלב זה.
7. **התראה:** בסוף ריצה שקלטה חשבוניות חדשות — הודעת WhatsApp למנהלים דרך ערוץ ה-Twilio הקיים: "נקלטו X חשבוניות חדשות מהמייל — ממתינות לאישור" + קישור לעמוד החשבוניות.

### 5. מסך אישור (Frontend — עמוד Invoices)

- חשבוניות source=email מקבלות תג "נקלט ממייל" (+"ספק חדש" אם רלוונטי) בטבלת הארכיון.
- מודאל אישור חדש (`InvoiceReviewModal.jsx`):
  - תצוגת הקובץ המקורי (PDF/תמונה).
  - שדות החשבונית — כולם ניתנים לעריכה (ספק, מספר, תאריך, סכום, מע"מ, קטגוריה).
  - טבלת פריטים: שם, כמות, מחיר; לכל שורה — פעולת מלאי מוצעת ("→ מתווסף ל'ביסקוטי קלאסי'" / "→ פריט מלאי חדש") עם אפשרות לערוך, לשנות שיוך (בחירה מרשימת המלאי), או לבטל שורה (skip).
  - בחירת סטטוס תשלום (שולם / לא שולם).
  - כפתורים: **אישור** / **דחייה**.

### 6. אישור — `POST /api/invoices/:id/approve`

טרנזאקציה אחת:
1. עדכון שדות החשבונית לפי העריכות; status → `processed`.
2. לכל שורת פריט לפי `inventory_action`:
   - `add_existing`: `Inventory.current_stock += quantity`, עדכון `cost_per_unit` למחיר האחרון.
   - `create_new`: יצירת פריט `Inventory` חדש (שם, כמות, יחידה, עלות, supplier_id).
   - `skip`: כלום.
3. `inventory_applied = true` (מניעת החלה כפולה).
4. **למידה:** אם המשתמש שינה שיוך של שורה → upsert `ProductAlias`. אם הספק היה חדש → יצירת ספק + `EmailSenderRule(rule=allow)`.

### 7. דחייה — `POST /api/invoices/:id/reject`

1. status → `rejected` (החשבונית נשארת בארכיון לשקיפות, מסוננת כברירת מחדל).
2. **למידה:** `EmailSenderRule.reject_count += 1` לשולח; אם הגיע ל-2 → `rule = block` (המערכת מפסיקה להציע מיילים מהשולח). רשימת החסומים מוצגת במסך ההגדרות עם כפתור "החזר".

### 8. מסך הגדרות (Frontend)

עמוד/טאב "תיבות מייל לחשבוניות":
- רשימת תיבות מחוברות + סטטוס + "חבר תיבה" / "נתק".
- רשימת כללי שולחים (מותר/חסום/אוטומטי) עם עריכה.

## טיפול בשגיאות

- **Refresh token נשלל** (המשתמש הסיר הרשאה): `EmailAccount.status = disconnected` + הודעת WhatsApp למנהל "תיבת X נותקה — יש לחבר מחדש".
- **כשל חילוץ LLM:** retry אחד; בכשל שני — דילוג + לוג. המייל ייבדק שוב בריצה הבאה רק אם לא סומן כמעובד (מסמנים מעובד רק אחרי הצלחה או שני כשלונות).
- **קובץ לא נתמך / גדול מ-15MB:** דילוג בשקט.
- הקרון עוטף כל תיבה ב-try/catch — כשל בתיבה אחת לא מפיל את השנייה.

## בדיקות

- Unit: פונקציית הסינון (rules), dedupe, fuzzy-match פריטים→מלאי, לוגיקת reject→block.
- Integration: approve flow — טרנזאקציית חשבונית+מלאי+aliases; reject flow.
- ידני על פרוד: חיבור שתי התיבות, שליחת חשבונית אמיתית למייל, בדיקת קליטה→אישור→מלאי.

## מחוץ לסקופ (שלב זה)

- תיבות שאינן Gmail (IMAP/Outlook).
- כתובת ייעודית invoices@.
- הפחתת מלאי אוטומטית לפי מכירות.
- קליטת חשבוניות מגוף המייל בלבד (ללא קובץ מצורף) — HTML invoices; יתווסף בהמשך אם יתברר שספקים שולחים כך.

## תלות חיצונית (הקמה חד-פעמית)

1. הפעלת Gmail API בפרויקט Google Cloud הקיים + הוספת scope `gmail.readonly` ו-redirect URI.
2. דביר וניב מאשרים את חלון ה-consent של גוגל — פעם אחת לכל תיבה.
3. שורת crontab חדשה בשרת (VPS: root@91.98.45.253) — כל 10 דקות.
4. ENV חדשים: `GOOGLE_CLIENT_SECRET` (אם חסר), `EMAIL_TOKEN_ENC_KEY` (הצפנת refresh tokens).
