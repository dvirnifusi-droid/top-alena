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

ניתנות לניהול (הוספה/ניתוק) במסך הגדרות.

**שיטת חיבור — עדכון 2026-07-04 (החלטת תכנון):** IMAP עם סיסמת אפליקציה של Google במקום OAuth. סיבה: `gmail.readonly` הוא scope מוגבל (restricted) — במצב Testing טוקן הרענון פג כל 7 ימים (שובר את האוטומציה), ובמצב Production נדרש אימות אפליקציה מלא של Google (שבועות). סיסמת אפליקציה: הקמה חד-פעמית לכל תיבה, לא פגה, בלי Google Cloud. דורש אימות דו-שלבי פעיל בחשבון. הסיסמה נשמרת מוצפנת (AES-256-GCM); המערכת קוראת בלבד — לא משנה דגלים, לא מוחקת.

## ארכיטקטורה

### 1. מודלים חדשים (Prisma)

```prisma
model EmailAccount {
  id             String   @id @default(cuid())
  email          String   @unique
  app_password   String   // מוצפן (AES-256-GCM, מפתח EMAIL_TOKEN_ENC_KEY ב-ENV)
  status         String   @default("active") // active | disconnected | error
  last_checked_at DateTime?
  last_error     String?
  created_at     DateTime @default(now())
}

// בנוסף: EmailMessageLog — לוג לכל מייל שנבדק (message_id ייחודי, outcome:
// imported | not_invoice | blocked | duplicate | no_attachment | error) —
// משמש למניעת עיבוד כפול ולשקיפות/דיבוג.

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

### 3. חיבור Gmail (IMAP + סיסמת אפליקציה)

- Routes חדשים ב-`apps/api/src/routes/emailAccounts.ts`:
  - `GET /api/email-accounts` — רשימת תיבות + סטטוס (בלי הסיסמה).
  - `POST /api/email-accounts` — חיבור תיבה: מאמת את הסיסמה מול Gmail IMAP בזמן אמת, שומר מוצפן.
  - `DELETE /api/email-accounts/:id` — ניתוק (מחיקה).
  - `POST /api/email-accounts/scan-now` — סריקה ידנית מיידית ממסך ההגדרות.
- ספריות: `imapflow` + `mailparser`. חיבור ל-imap.gmail.com:993, קריאה בלבד מ-INBOX.
- הקמה חד-פעמית לכל תיבה: אימות דו-שלבי פעיל → יצירת סיסמת אפליקציה ב-myaccount.google.com/apppasswords → הדבקה במסך ההגדרות.

### 4. קרון סריקה — `POST /api/cron/email-invoice-scan`

רץ כל 10 דקות (שורה חדשה ב-crontab בשרת). לכל תיבה פעילה:

1. **שליפה אינקרמנטלית:** חיפוש IMAP `SINCE` מ-`last_checked_at` פחות יום חפיפה (SINCE ברזולוציית יום), עם מניעת כפילויות לפי Message-ID מול `EmailMessageLog`. בחיבור ראשון: backfill של 30 יום אחורה. עד 100 הודעות חדשות לריצה (הריצה הבאה ממשיכה מאיפה שעצרנו).
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

- **סיסמת אפליקציה בוטלה/שגויה:** `EmailAccount.status = disconnected` + הודעת WhatsApp למנהל "תיבת X נותקה — יש לחבר מחדש".
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

1. אימות דו-שלבי פעיל בשני חשבונות Google (דביר + ניב).
2. יצירת סיסמת אפליקציה לכל חשבון (myaccount.google.com/apppasswords) והדבקה במסך ההגדרות.
3. שורת crontab חדשה בשרת (VPS: 91.98.45.253, `/opt/top-alena`) — כל 10 דקות.
4. ENV חדש: `EMAIL_TOKEN_ENC_KEY` (הצפנת סיסמאות האפליקציה, `openssl rand -hex 32`).
