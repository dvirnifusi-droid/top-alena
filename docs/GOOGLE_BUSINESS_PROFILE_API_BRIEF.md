# Google Business Profile API — מדריך הפעלה (מסלול "פרסום בקליק")

**מטרה:** לחבר את TOP ALENA ל-Google Business Profile API כדי ש-**קריאת הביקורות תהיה אוטומטית** ו-**פרסום תגובה יהיה בלחיצה** ישר מהאפליקציה (במקום ההדבקה הידנית של שלב ב׳). זה גם מבטל את הצורך בגירוד הדף הציבורי (שחסום 403).

## למה זה לא "מיידי"
ה-API הזה מאחורי בקשת גישה שגוגל מאשרת **ידנית**. התהליך: יוצרים פרויקט ב-Google Cloud, מבקשים גישה ל-Business Profile APIs, וממתינים לאישור (בד"כ כמה ימים עד שבועות). בלי האישור — קריאות ה-API יחזירו quota=0.

## מה צריך ממך (פעולות בחשבון שלך — אני לא יכול לעשות אותן בשמך)
1. **לוודא בעלות על הכרטיס** — החשבון גוגל שמנהל את "עלינא ראשון לציון" ב-[business.google.com](https://business.google.com). זה החשבון שיאשר את החיבור.
2. **Google Cloud project** — ב-[console.cloud.google.com](https://console.cloud.google.com): ליצור פרויקט (או להשתמש בקיים של TOP ALENA), ולהפעיל את ה-APIs:
   - `My Business Account Management API`
   - `My Business Business Information API`
   - `Google My Business API` (Reviews)
3. **בקשת גישה** — למלא את טופס [Business Profile API access request](https://developers.google.com/my-business/content/prerequisites) עם ה-Project number. **כאן ההמתנה.**
4. **OAuth Client** — ליצור OAuth 2.0 Client ID (Web application), עם redirect URI שאתן לך, ולהוסיף את ה-scope `https://www.googleapis.com/auth/business.manage`.
5. למסור לי: **Client ID + Client Secret** (דרך מקום מאובטח — הם ייכנסו ל-IntegrationSecret, לא לקוד). את הסיסמאות/הטוקנים אתה מזין, לא אני.

## מה אני מחבר ברגע שהגישה מאושרת (צד קוד, כבר מתוכנן)
- **OAuth flow** באפליקציה: כפתור "חבר את גוגל" → אתה מאשר → refresh token נשמר ב-IntegrationSecret.
- **קריאה אוטומטית**: cron יומי (`/google-reviews-pull`) שקורא `accounts.locations.reviews.list`, ממלא את טבלת `GoogleReview` הקיימת (אותו מודל של שלב ב׳ — אפס שינוי בממשק).
- **התראה** בוואטסאפ על ביקורת חדשה (במיוחד שלילית) — כי עכשיו הזיהוי אוטומטי.
- **פרסום בקליק**: כפתור "פרסם תגובה" יקרא `reviews.updateReply` — במקום "העתק + פתח בגוגל".
- **דירוג + כמות אמיתיים** בלוח המחוונים (מ-`locations.get`), במקום ההזנה הידנית.

## סטטוס
- שלב ב׳ (הדבקה ידנית + תגובות AI) **חי** ועובד עצמאית — לא תלוי באישור הזה.
- מסמך זה = מה שצריך כדי לשדרג לאוטומטי. פתחתי כדי שנוכל להתחיל את ההמתנה במקביל.
