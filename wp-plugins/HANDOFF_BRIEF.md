# עלינא בפיתה — בריף המשך סשן

**עודכן:** 2026-06-20 · **גרסת פלאגין חיה:** 0.24.6 · **גרסה הבאה לבנייה:** 0.24.7+

---

## ההקשר ב-30 שניות

**Dvir** הוא הבעלים של **עלינא בפיתה** (ראשון לציון, רוטשילד 104, סניף יחיד). מנהל 3 דומיינים:

| דומיין | מה זה | סטטוס |
|---|---|---|
| **alenabepita.co.il** | אתר משלוחים (WordPress 6.8.3, WC 9.9.5, PHP 7.4) | בעבודה — לפני השקה |
| **alena.topalena.com** | אתר תדמית (React SPA) | חי, פעיל |
| **topalena.com** | אפליקציית ניהול (Express+Prisma על VPS Hetzner) | חי, יש בו API מועדון |

הפלאגין שכתבתי: `alena-delivery-zones` ב-`C:\Users\97253\TOP ALENA\wp-plugins\alena-delivery-zones\`. **Repo == חי** (אותם קבצים בדיוק, אין branch מקומי לעומת prod).

## ⚠️ קרא קודם — נושאים פתוחים בעדיפות גבוהה

### 1. **PayPlus iframe תקוע על "iframe" — להעביר ל-Redirect** ⏳
- PayPlus מותקן (פלאגין רשמי). כל המפתחות + Page UID מולאו.
- iframe נדבק בראש דף הקופה, לא בתוך section תשלום. ניסיתי לפתור עם CSS + JS (`checkout-payplus-fix.js`) — לא הסתדר.
- **הפתרון הפשוט:** wp-admin → WC → הגדרות → תשלומים → PayPlus → "אפשרויות דף התשלום" → "תצוגת דף הסליקה" = **Redirect** (במקום iframe). אז הלקוח מועבר לדף PayPlus הנקי (אותו שראינו בתצוגה מקדימה) שיש בו אשראי/Bit/Apple Pay/Google Pay.
- **לעשות זה הצעד הבא — לפני שעוברים לכל דבר אחר.**

### 2. **בדיקת תשלום end-to-end** ⏳
- אחרי שעוברים ל-Redirect: לבצע הזמנת בדיקה אמיתית של ₪10-15. לבחור משלוח לכתובת בראשון/בית דגן/משמר השבעה (אזורי המשלוח).
- לאחר תשלום: לוודא שההזמנה מסומנת "בעיבוד" ב-wp-admin → WC → הזמנות, ושהתראת הטלגרם הגיעה (אם הוגדר).

### 3. **"לא נבחרה שיטת משלוח" Bug** ⏳
- בקופה לפעמים מופיע הודעה הזאת כי הכתובת לא ממופה לפוליגון. צריך לוודא שהפוליגונים מכסים את כל האזורים.
- wp-admin → אזורי חלוקה → המפה.

## ✅ מה כבר עובד (לא לגעת אלא אם נדרש)

### זרימת לקוח קצה-לקצה
1. **alenabepita.co.il** → landing דארק עם כפתור "לאתר הראשי" → alena.topalena.com
2. **/shop** → welcome 2-שלבים: (א) משלוח/איסוף + כתובת, (ב) התחבר/הרשמה/אורח
3. **תפריט** → "🔥 המוזמנים ביותר" + horizontal cards + stepper על מוצרים פשוטים + מודאל עם תוספים
4. **סל צף בתחתית** + **side drawer** (Wolt-style) עם cross-sell + chips הערה
5. **/checkout** → PayPlus + מצב Redirect (אחרי שתשנה) → /thank-you
6. **/my-account** → דאשבורד ממותג + widget מועדון + הזמנות אחרונות + כרטיס דירוג ⭐
7. **התראה לבעלים** → צליל + toast + Telegram/Pushover

### צד שרת TOPALENA API
ב-`apps/api/src/routes/club.ts` יש: lookup / register / orders / **redeem** / benefits / ping. כל endpoint תחת `requireClubKey` middleware.
- **CLUB_API_KEY:** `42Ga0yY9IzRAVR679LQLdsLnQCRa8ZYAaWOInZIt9pg`
- **כתובת:** `https://topalena.com/api/club/*`
- **טופס register קולט:** phone, name, email, city, birthday, anniversary (ב-tags JSON), marketing_consent
- **rate צבירה:** 100₪ הזמנה = 1 נקודה
- **rate פדיון:** 1 נקודה = ₪4 הנחה בקופה (פדיון אוטומטי בעמוד הסל)

### גישת VPS
- **IP:** `91.98.45.253` · `root@91.98.45.253` · **SSH מורשה** (המפתח של niv@alina-bot ב-authorized_keys)
- אפשר לדפלוי בלי לעבור דרך Dvir: `ssh root@91.98.45.253 'cd /opt/top-alena && git pull && docker compose up -d --build api'`
- **Auto-deploy CI שבור** — VPS_HOST/USER/SSH_KEY secrets לא קיימים ב-GitHub. כל push למיגריישן נכשל ב-GH Actions. עוקפים ב-SSH ישיר.

### Plugin classes (כולן ב-`includes/`)
| מחלקה | מה | מצב |
|---|---|---|
| `Alena_DZ_Polygon_Store` | אחסון פוליגונים | ✅ |
| `Alena_DZ_Geocoder` | Google Maps API | ✅ (key רגיש בצ'אט — לסבב) |
| `Alena_DZ_Admin` | דף הגדרות ראשי | ✅ |
| `Alena_DZ_Checkout_Fields` | שדות כתובת מותאמים | ✅ |
| `Alena_DZ_Checkout_Map` | מפה אינטראקטיבית בקופה | ✅ |
| `Alena_DZ_Hours_*` | מנוע שעות (Hebcal) | ✅ |
| `Alena_DZ_Wolt_Importer` | ייבוא 56 מוצרים מ-Wolt API | ✅ |
| `Alena_DZ_Shop_Styling` | חנות Wolt-style + horizontal cards | ✅ |
| `Alena_DZ_Modifiers` | תוספים: dynamic gating, free-first pricing | ✅ |
| `Alena_DZ_Cart_Enhancements` | מיני-סל + clear-cart endpoint | ✅ |
| `Alena_DZ_Cart_Drawer` | Side drawer (Wolt-style) | ✅ — חדש ב-0.23.0 |
| `Alena_DZ_Cart_Redesign` | סל מותאם | ✅ |
| `Alena_DZ_Checkout_Redesign` | קופה מותאמת | ✅ |
| `Alena_DZ_Order_Scheduling` | הזמנה לזמן עתידי | ✅ |
| `Alena_DZ_Order_Alerts` | התראות לבעלים (sound + Telegram/Pushover/Webhook) | ✅ |
| `Alena_DZ_Order_Rating` | דירוג כוכבים | ✅ |
| `Alena_DZ_PWA` | manifest + SW (network-first) | ✅ |
| `Alena_DZ_Top_Nav` | סרגל ניווט עליון קבוע | ✅ |
| `Alena_DZ_Welcome` | landing 2-שלבים | ✅ |
| `Alena_DZ_Recent_Orders` | "הזמן שוב" | ✅ |
| `Alena_DZ_Club` | אינטגרציה TOPALENA | ✅ |
| `Alena_DZ_Phone_Auth` | OTP בטלפון | ✅ Console mode |
| `Alena_DZ_Manager` | `/manage` page (לבעלים) | ✅ |

### עיצוב מודרני
- `assets/modern-design.css` נטען אחרון, יוצר את ה-Wolt-vibe (gradients, glassmorphism, animations, hover lifts). 8 CSS variables מוגדרים (`--alena-green/coral/cream/gold`).

## ⏳ עדיין לא בנוי — לעבוד עליהם אחרי PayPlus

| משימה | תיאור | קושי |
|---|---|---|
| **WhatsApp Cloud OTP** | במקום Console mode — שליחת קוד בוואטסאפ | תלוי בחשבון Meta Business (Dvir צריך לפתוח, יומיים) |
| **דירוג כוכבים סופי על iframe** | סוגרים אם עוברים ל-Redirect | פשוט |
| **מעקב שליחים live** | UI לראות איפה השליח | החליטו לדחות |
| **SMS אישור הזמנה לקוח** | החליטו לדחות (לא חיוני) | לא נדרש |

## 🔑 ערכים קריטיים

| ערך | תוכן | איפה |
|---|---|---|
| **CLUB_API_KEY** | `42Ga0yY9IzRAVR679LQLdsLnQCRa8ZYAaWOInZIt9pg` | TOPALENA `.env` + WP פלאגין (hardcoded ב-class-club.php) |
| **VPS IP** | `91.98.45.253` | Hetzner Cloud |
| **PayPlus Page UID** | `7ee30427-ab15-4d21-8aa8-e1c3eb9759b8` | WC PayPlus settings |
| **WP admin** | `admin / admin_macbz0ws` | wp-admin (פרטי-עוטה בצ'אט — לסבב) |

## 🎨 הרגלי עבודה של Dvir (חשוב!)

1. **דובר עברית.** רוצה תשובות קצרות וישירות. לא לבזבז מילים על "אאשר" / "סבבה".
2. **לא טכני.** "תעשה לבד" / "תקדם הכל" = הוא מעדיף שאדפלוי בעצמי דרך SSH במקום להוריד עליו פקודות.
3. **משתמש ב-Hetzner web console** במקום SSH מקומי. המקלדת שם מקלקלת `&&` ל-`77`, `:` ל-`;`, `+` ל-`=`, `@` ל-`2`. אם נדרשת ידנית — להשתמש ב-nano עם תווים פשוטים.
4. **בודק בגלישה בסתר.** כשמשהו לא משתנה — תמיד SW caching. הניחוי: F12 → Application → SW → Unregister + Storage → Clear site data + חלון גלישה בסתר חדש.
5. **רוצה עיצוב כמו Wolt.** מסעדה דליברי. הסקאלה: "המוזמנים ביותר", horizontal cards, side drawer, sticky CTA.

## 🚀 הצעד הבא ברגע שתתחיל סשן

```
1. תקרא את הבריף הזה (אתה עושה את זה עכשיו)
2. תשאל את Dvir: "האם שינית את PayPlus ל-Redirect וביצעת הזמנת בדיקה?"
3. אם כן → עוברים ל-WhatsApp Cloud / שיפורים בעיצוב / מה שצריך
4. אם לא → תזכיר לו 3 הצעדים: WC → תשלומים → PayPlus → "תצוגת דף הסליקה" = Redirect → שמור → בצע הזמנת ₪10
```

## 📚 מקורות

- **זיכרון:** [project_alena_wp_delivery_site.md](C:\Users\97253\.claude\projects\C--Users-97253-TOP-ALENA\memory\project_alena_wp_delivery_site.md) — מעודכן מקביל לקובץ הזה
- **Repo TOPALENA:** [top-alena-migration](C:\Users\97253\top-alena-migration) (branch: `migration`, push יוזם auto-deploy אבל הוא שבור, צריך SSH ידני)
- **Repo plugin:** הקובץ הזה תחת ה-repo הראשי (`TOP ALENA` git)
- **Builds:** `wp-plugins\alena-dz-vXXXX.zip` — אחרון `alena-dz-v0246.zip` (PayPlus iframe relocator JS)

---

**אם הסשן יוצא דרך — תקרא את הקובץ הזה ראשון, אל תשאל את Dvir שאלות שכבר ענה עליהן.**
