# איפיון: איחוד מרכז השיווק (Marketing Consolidation)

תאריך: 2026-07-26 · סטטוס: ממתין לאישור בעלים

## הבעיה
שני מרכזי שיווק חופפים: **MarketingHub** (10 טאבים ישנים) ו-**MarketingAdvisor / ⚡ פעולות** (המכונה החדשה). זה יוצר בלבול + 3 כפילויות אמיתיות שאותרו במיפוי לעומק.

## עיקרון מנחה
לארגן **לפי ערוץ**, לא בלוב אחד. יש שני צינורות נפרדים לחלוטין שאסור לבלבל:
- **📱 מועדון (CLUB):** WhatsApp/SMS/Email ל-~20K הלקוחות — נוגע ברשימה.
- **💰 ממומן (META):** מודעות פייסבוק/אינסטגרם בתשלום — קהל של מטא, לא נוגע ברשימה.
ובנוסף **מנועים משותפים** ששני הערוצים משתמשים בהם: 🎨 עיצוב, 📢 אורגני, 🧠 אסטרטגיה.

## הכפילויות לניקוי (עובדתי מהמיפוי)
1. **3 מסלולי שליחה למועדון** שעושים אותו דבר בפועל: `sendCustomerCampaign`, `sendSegmentBlast`, `sendMarketingBlast`.
2. **3 מסלולי פרסום אורגני:** InstagramStudio (`publishInstagramPost`), Playbook (`postToSocial`), ProposedActions (`runMarketingAgent`).
3. **3 מנועי עיצוב:** StoryStudio (canvas), Playbook (`assistTactic`+composeDesign), CampaignBuilder (creative).
4. **אסטרטגיה כפולה:** MarketingAdvisor (profile→תוכנית) ↔ MarketingPlaybook (`generateMarketingPlaybook`).
5. **אנליטיקה כפולה:** MarketingDashboard ↔ PerformanceReview ↔ Campaigns History.

## מבנה יעד — מסך שיווק אחד עם 5 חלקים + עצמאיים
| חלק | בולע / מכיל | ערוץ |
|---|---|---|
| 🧠 **אסטרטגיה** | MarketingAdvisor + MarketingPlaybook (מאוחד) | STRATEGY |
| 📱 **מועדון** | MarketingCampaigns (המנוע) + CustomerClub (הרשימה) + MessageTemplates | CLUB |
| 💰 **ממומן** | CampaignBuilder (יוצר) + LiveCampaigns (שולט) + PerformanceReview (סוקר) + MarketingLinks | META |
| 🎨 **עיצוב** | מנוע עיצוב אחד משותף (StoryStudio canvas + assistTactic) | SHARED |
| 📢 **אורגני** | מסלול פרסום IG/FB אחד (בסיס InstagramStudio: publish+schedule) | SHARED |
| **עצמאיים** | בוחן-סושיאל (QA), סקרי לקוחות + QR (משוב) | STANDALONE |

## מה נשאר ייחודי ואסור לגעת (הפונקציונליות נשמרת במלואה)
- **CustomerClub** — המקום היחיד ליצור/לייבא לקוחות, consent, שביעות-רצון. הרשימה עצמה.
- **MarketingCampaigns** — מנוע המועדון העשיר (16 סגמנטים, החרגה, A/B, תבניות חג, drill-down).
- **CampaignBuilder + LiveCampaigns** — היחיד שיוצר ושולט במודעות מטא בתשלום.
- **SocialReviewer** — היחיד שנותן ציון/QA לפוסט.
- **CustomerSurveys + SurveyQRCodes** — היחיד שאוסף/מציג משוב.

## ⚠️ ממצא מהצלילה (2026-07-26) — הבקאנד כבר תקין, ויש מלכודת
קריאה לעומק של שלושת מסלולי-השליחה גילתה:
- **`sendSegmentBlast` כבר קורא ל-`sendMarketingBlast`** (הליבה). זה כבר wrapper דק. אין כפילות.
- **`sendCustomerCampaign` הוא לא כפיל אלא מנוע עשיר יותר** (CampaignSend/CampaignRecipient לכל נמען + Twilio status webhooks + פרסונליזציה). לכווץ אותו לליבה = **לאבד פיצ'רים**.
- **כולם אוכפים consent** (`buildSegmentWhere` baseGate: `marketing_consent:true, unsubscribed:null` ; `mayReceiveMarketing` בליבה). אין דליפה.
- **🚨 מלכודת מסירה:** הליבה (`sendMarketingBlast`) שולחת WhatsApp דרך **`sendClubMessage` = תבנית מאושרת** → מגיע גם מחוץ לחלון 24ש'. המנוע העשיר (`sendCustomerCampaign`) שולח דרך **`sendWhatsApp` = הודעת session רגילה** → **נכשל בשקט מחוץ לחלון** (בעיית 47% הידועה). כלומר איחוד נאיבי **יזיק למסירה**.

**מסקנה:** אין לגעת בבקאנד של השליחה כרגע — הוא בטוח, וכל מנוע נכון להקשר שלו. הכפילות האמיתית היא **ב-UI** (3 כפתורי שליחה) — נטפל בה בשלב 3. שדרוג עתידי אמיתי: לתת למנוע העשיר גם מסירת-תבנית (לפתור את ה-47%) — פרויקט נפרד בזהירות.

## תוכנית עבודה מדורגת (בטוח, בלי לשבור כלום)
- **שלב 1 — Backend בלבד, בלי שינוי UI (סיכון אפס):** לאחד את 3 מסלולי-השליחה למועדון מאחורי מנוע אחד; שלושת השמות הישנים נשארים כ-wrappers דקים. אימות מול נתונים אמיתיים.
- **שלב 2 — מנועים משותפים:** מסלול אורגני אחד (InstagramStudio כקנוני; Playbook/ProposedActions קוראים לו) + מנוע עיצוב אחד.
- **שלב 3 — ארגון UI:** מסך השיווק מסודר ל-5 החלקים לפי ערוץ. כל כפתורי "שלח למועדון" מובילים למנוע המועדון האחד.
- **שלב 4 — פרישה של הכפולים:** MarketingHQ (רשימת-פעולות) ו-MarketingDashboard נבלעים; משאירים KPI-strip קטן. שום מסך לא נמחק לפני שהמחליף אומת.

## גבולות ובטיחות
- שום פונקציונליות לא הולכת לאיבוד; אכיפת consent + חלון 24ש' נשמרת.
- שום מחיקה עד שהמחליף עובד ואומת בפרודקשן.
- כל שלב נפרס ומאומת בנפרד (batching, בגלל רגישות fail2ban).
