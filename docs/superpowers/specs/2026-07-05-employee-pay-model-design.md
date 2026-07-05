# אפיון: מודל עלות עובד + פרטיות שכר (תת-פרויקט B)

**תאריך:** 2026-07-05
**סטטוס:** מאושר ע"י דביר (שיחת אפיון 2026-07-05)
**ענף יעד:** `migration`

## הקשר — חלק מחזון גדול יותר

זהו **תת-פרויקט B** מתוך 4 שנועדו להפוך את תזרים המזומנים לחי ולבנות ניתוח עלות שכר (Labor Cost):

- **A** — תזרים חי: הכנסות מ-`ShiftEndReport`, הוצאות מחשבוניות. (עצמאי)
- **B (זה)** — מודל עלות עובד + הזנת שכר עם פרטיות. הבסיס לניתוח העלות.
- **C** — תחזית עלות סידור מול בפועל + חריגות. (תלוי ב-B)
- **D** — אחוז עלות שכר מול הכנסות. (תלוי ב-A + C)

B הוא **רק**: להגדיר/להזין/לאחסן/להגן על נתוני שכר. חישוב עלות מהשעות, תחזית סידור וחריגות — שייכים ל-C ו-D ואינם בסקופ כאן.

## מטרה

לכל עובד יוגדר "מחיר אמיתי" (תעריף שעתי או משכורת חודשית + עלות מעביד), יוזן בכרטיס העובד, ויהיה מוגן: עובד רואה רק את עצמו, מנהל מחלקה רואה ועורך את מחלקתו בלבד, בעלים רואה ועורך הכל.

## החלטות עיצוב שסוכמו

1. **סוגי תשלום:** `hourly` (שעתי — מטבח/שטיפה), `monthly` (משכורת חודשית קבועה — מנהלים), `tips` (מלצרים — על טיפים). עובדי `tips` **מחוץ** לחישוב עלות השכר (שכרם מהטיפים, לא מכיס המסעדה) — מסומנים אבל לא נספרים ב-C/D.
2. **עלות מעביד:** מתחילים פונקציונלית עם ברוטו בלבד (מצב "ג'"), אבל המודל תומך מראש גם באחוז מעביד גלובלי וגם ברכיבים מפורטים — שניהם אופציונליים וריקים בהתחלה. מילוי מאוחר בלי שינוי קוד.
3. **פרטיות — צפייה:** בעלים=הכל; מנהל מורשה=מחלקתו; עובד=עצמו.
4. **פרטיות — עריכה:** בעלים=הכל; מנהל מורשה=מחלקתו; עובד=אין (גם לא על עצמו).
5. **מיקום הזנה:** אזור "שכר ועלות" בכרטיס העובד (`EmployeeDetails`).

## ארכיטקטורה

### 1. מודל נתונים חדש (Prisma) — `EmployeePay`

טבלה **נפרדת** מ-`Employee` (בידוד נתונים רגישים). רשומה אחת פר עובד (upsert).

```prisma
model EmployeePay {
  id                 String   @id @default(cuid())
  employee_id        String   @unique
  pay_type           String   @default("hourly") // hourly | monthly | tips
  hourly_rate        Float?   // כשעתי
  monthly_salary     Float?   // כחודשי
  employer_pct       Float?   // אחוז עלות מעביד על הברוטו (אופציונלי; מצב "א")
  employer_components Json?   // רכיבים מפורטים {bi7uah_leumi, pension, havraa, ...} (אופציונלי; מצב "ב")
  currency           String   @default("ILS")
  notes              String?
  updated_by         String?  // מזהה המשתמש ששינה לאחרונה (audit)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}
```

עלות מעביד אפקטיבית לחישובי C/D (נגזרת, לא נשמרת):
`employer_cost = components-sum אם קיימים, אחרת gross × (employer_pct/100) אם קיים, אחרת 0`.

### 2. הרשאה — היקף גישת שכר על העובד המנהל

שדה חדש על `Employee`:

```prisma
  pay_access_scope   String?  // null=עצמו בלבד | 'all' | '<שם מחלקה>' (למשל 'מטבח' / 'פלור')
```

- בעלים (`User.role === 'owner'`) → תמיד 'all', ללא תלות בשדה.
- מנהל מטבח → הבעלים מגדיר `pay_access_scope = 'מטבח'` בכרטיס העובד שלו.
- מנהל פלור → `pay_access_scope = 'פלור'`.
- ערך המחלקה חייב להתאים ל-`Employee.department` של עובדי היעד.

**קישור משתמש→עובד:** צופה (`User`) מזוהה לרשומת `Employee` לפי `email` (`User.email === Employee.email`), משם נקראים ה-`department` וה-`pay_access_scope` שלו.

### 3. לוגיקת הרשאות טהורה (נבדקת ב-unit tests)

קובץ `apps/api/src/lib/payAccess.ts`:

```ts
type Viewer = { isOwner: boolean; employeeId: string | null; department: string | null; payAccessScope: string | null };
type Target = { employeeId: string; department: string | null };

export function canEditPay(v: Viewer, t: Target): boolean {
  if (v.isOwner) return true;
  if (v.payAccessScope === 'all') return true;
  if (v.payAccessScope && t.department && v.payAccessScope === t.department) return true;
  return false;
}

export function canViewPay(v: Viewer, t: Target): boolean {
  if (canEditPay(v, t)) return true;
  return !!v.employeeId && v.employeeId === t.employeeId; // עובד רואה את עצמו
}
```

### 4. נקודות גישה מאובטחות (functions)

קובץ `apps/api/src/functions/employeePay.ts` — כל קריאה בונה את ה-`Viewer` מה-`user` ומאכיפה את הלוגיקה:

- `getEmployeePay({ employee_id })` → רשומת השכר, רק אם `canViewPay`; אחרת שגיאת `forbidden`.
- `listEmployeePay()` → כל רשומות השכר שהצופה מורשה לראות (בעלים=הכל; מנהל=מחלקתו; עובד=עצמו).
- `setEmployeePay({ employee_id, ...fields })` → upsert, רק אם `canEditPay`; רושם `updated_by`.

### 5. חסימת המסלול הגנרי (אבטחה קריטית)

המסלול `/api/entities/:model` מגיש כל מודל Prisma — כולל `EmployeePay` — לכל משתמש מאומת. חובה **לחסום** את `EmployeePay` שם (denylist ב-`apps/api/src/routes/entities.ts`), כך שנתוני שכר נגישים אך ורק דרך הפונקציות המאובטחות.

הגדרת היקף גישת מנהל (`Employee.pay_access_scope`) תתבצע דרך פונקציה ייעודית **`setPayAccessScope({ employee_id, scope })` — בעלים בלבד** (לא דרך עדכון Employee הגנרי, כדי שמנהל לא יוכל להעלות לעצמו הרשאה). ה-denylist יכלול גם עדכון השדה הזה אם יגיע דרך המסלול הגנרי.

### 6. פרונט — אזור "שכר ועלות" ב-`EmployeeDetails`

- טוען דרך `getEmployeePay`; אם מוחזר `forbidden` — האזור לא מוצג כלל.
- לצפייה: סוג תשלום, תעריף/משכורת, עלות מעביד (אם הוזנה), עלות כוללת מחושבת.
- לעריכה (אם `canEditPay`): טופס עם סוג תשלום, שדה תעריף שעתי *או* משכורת חודשית (לפי הסוג), אחוז מעביד אופציונלי, ורכיבים מפורטים בקטע מתקפל. שמירה דרך `setEmployeePay`.
- **הגדרת היקף גישת מנהל:** בכרטיס עובד, לבעלים בלבד, בורר "גישת שכר" (עצמו / כל המחלקות / מחלקה מסוימת) → `setPayAccessScope`.

## טיפול בשגיאות

- קריאה/עריכה ללא הרשאה → `forbidden` (403 בפונקציה), הפרונט מסתיר את האזור.
- עובד ללא רשומת `Employee` מקושרת (email לא תואם) → נחשב "בלי היקף", רואה כלום; לוג אזהרה.
- ערכי תעריף/משכורת שליליים או לא-מספריים → נדחים בוולידציה ב-`setEmployeePay`.

## בדיקות

- Unit: `canViewPay` / `canEditPay` — כל קומבינציה (בעלים, מנהל-מחלקה תואם/לא-תואם, 'all', עובד-עצמו, זר).
- Unit: חישוב `employer_cost` (רכיבים / אחוז / 0).
- Integration: `getEmployeePay`/`setEmployeePay` מכבדים הרשאות; `EmployeePay` חסום במסלול הגנרי.

## מחוץ לסקופ (שייך ל-C/D)

- חישוב עלות מהשעות בפועל (`ShiftTracking`), תחזית עלות סידור (`WorkShift`), חריגות מתוכנן-מול-בפועל, אחוז עלות שכר מול הכנסות. B רק מספק את התעריפים והפרטיות שעליהם C/D יתבססו.

## תלות / הערות פריסה

- שינויי סכמה מיושמים בפרוד כ-**SQL אדיטיבי** (לא `prisma db push` — drift). ראה [[db-drift-repair-toolkit]], [[email-invoice-import]].
- אין תלות ב-A. אפשר לבנות ולפרוס עצמאית.
