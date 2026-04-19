import React from 'react';

export default function PrivacyPolicy() {
  return (
    <div
      className="min-h-screen p-6 max-w-2xl mx-auto"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)', color: '#e2e8f0' }}
      dir="rtl"
      lang="he"
    >
      {/* Skip link */}
      <a
        href="#privacy-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:right-4 focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2 focus:rounded focus:z-50"
      >
        דלג לתוכן
      </a>

      <div className="bg-white/95 rounded-3xl shadow-2xl p-8 text-slate-800" id="privacy-content">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔒</div>
          <h1 className="text-3xl font-black text-slate-800">מדיניות פרטיות ואבטחת מידע</h1>
          <p className="text-slate-500 text-sm mt-2">מסעדת עלינא | עדכון אחרון: אפריל 2026</p>
        </div>

        <div className="space-y-7 text-sm leading-relaxed">

          {/* 1 */}
          <section aria-labelledby="sec1">
            <h2 id="sec1" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">1. כללי</h2>
            <p>
              מסעדת עלינא ("המסעדה", "אנחנו") מכבדת את פרטיותך ופועלת בהתאם לחוק הגנת הפרטיות, התשמ"א–1981,
              לתקנות הגנת הפרטיות (אבטחת מידע), התשע"ז–2017, ולהנחיות רשות הגנת הפרטיות בישראל.
              מסמך זה מסביר אילו נתונים אנו אוספים, כיצד הם משמשים ואיך הם מוגנים.
            </p>
          </section>

          {/* 2 */}
          <section aria-labelledby="sec2">
            <h2 id="sec2" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">2. מאגר מידע ורישום לפי החוק</h2>
            <p className="mb-2">
              המסעדה מנהלת מאגר מידע הכולל פרטי לקוחות שנמסרו במסגרת הצטרפות לרשימת ההמתנה.
              בהתאם לחוק הגנת הפרטיות, מאגרי מידע מעל הסף הקבוע בחוק (50,000 רשומות, או נתונים רגישים,
              או מאגר המשמש לדיוור ישיר) חייבים ברישום אצל <strong>רשם מאגרי המידע</strong>.
            </p>
            <p>
              המסעדה בוחנת את חובת הרישום בהתאם להיקף הנתונים ומקיימת את כל דרישות החוק הרלוונטיות.
              לשאלות בנוגע לרישום המאגר ניתן לפנות אלינו בפרטי הקשר בסעיף 8.
            </p>
          </section>

          {/* 3 */}
          <section aria-labelledby="sec3">
            <h2 id="sec3" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">3. איזה מידע אנו אוספים</h2>
            <ul className="list-disc list-inside space-y-1 pr-2">
              <li><strong>שם מלא</strong> — לזיהוי בתור ובתקשורת שירות.</li>
              <li><strong>מספר טלפון</strong> — לשליחת עדכוני תור ומשובים (SMS / WhatsApp).</li>
              <li><strong>גודל קבוצה והעדפת הושבה</strong> — לצרכי תפעול פנימי בלבד.</li>
              <li><strong>נתוני מיקום משוערים</strong> — אם אושרו על ידיך, לאימות שהנך בסביבת המסעדה בעת הרישום לתור (Geofencing). הנתונים אינם נשמרים לאחר סיום הביקור.</li>
              <li><strong>היסטוריית ביקורים ומטבעות</strong> — לצרכי תכנית נאמנות פנימית.</li>
            </ul>
          </section>

          {/* 4 */}
          <section aria-labelledby="sec4">
            <h2 id="sec4" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">4. כיצד המידע משמש</h2>
            <ul className="list-disc list-inside space-y-1 pr-2">
              <li>ניהול תור ממתינים בזמן אמת.</li>
              <li>שליחת הודעות SMS / WhatsApp בנוגע לסטטוס התור שלך.</li>
              <li>שיפור חוויית הביקור ותכנון תפעולי.</li>
              <li>תכנית נאמנות פנימית (מטבעות עלינא).</li>
              <li><strong>לא</strong> נעשה שימוש בפרטיך לצרכי שיווק ישיר מבלי לקבל הסכמתך המפורשת.</li>
            </ul>
          </section>

          {/* 5 */}
          <section aria-labelledby="sec5">
            <h2 id="sec5" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">5. אבטחת מידע</h2>
            <p className="mb-2">
              אנו נוקטים אמצעי אבטחה טכניים וארגוניים בהתאם לתקנות הגנת הפרטיות (אבטחת מידע), התשע"ז–2017, כולל:
            </p>
            <ul className="list-disc list-inside space-y-1 pr-2">
              <li>תקשורת מוצפנת (HTTPS/TLS) בין המשתמש לשרת.</li>
              <li>הגבלת גישה לנתונים אך ורק לצוות המורשה לכך.</li>
              <li>שמירת נתונים בשרתים מאובטחים בתוך גבולות האיחוד האירופי / ישראל.</li>
              <li>בדיקות אבטחה תקופתיות.</li>
            </ul>
          </section>

          {/* 6 */}
          <section aria-labelledby="sec6">
            <h2 id="sec6" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">6. שמירת מידע ומחיקה</h2>
            <p>
              נתוני תור נשמרים לתקופה של עד <strong>12 חודשים</strong> ממועד הביקור לצרכי תפעול ואיכות שירות,
              ולאחר מכן נמחקים או מאורגנים בצורה אנונימית לצרכי סטטיסטיקה בלבד.
              ניתן לבקש מחיקת מידע מוקדם יותר על ידי פנייה אלינו.
            </p>
          </section>

          {/* 7 */}
          <section aria-labelledby="sec7">
            <h2 id="sec7" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">7. זכויותיך</h2>
            <p className="mb-2">בהתאם לחוק הגנת הפרטיות, יש לך הזכות:</p>
            <ul className="list-disc list-inside space-y-1 pr-2">
              <li><strong>עיון</strong> — לבקש לראות את המידע השמור עליך.</li>
              <li><strong>תיקון</strong> — לבקש לתקן מידע שגוי.</li>
              <li><strong>מחיקה</strong> — לבקש למחוק את פרטיך מהמאגר, בכפוף לדרישות חוקיות.</li>
              <li><strong>התנגדות לדיוור</strong> — להסיר עצמך מרשימת תקשורת שיווקית בכל עת.</li>
            </ul>
          </section>

          {/* 8 */}
          <section aria-labelledby="sec8">
            <h2 id="sec8" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">8. יצירת קשר</h2>
            <p>
              לכל שאלה, פנייה בנוגע לפרטיותך, או מימוש זכויותיך — ניתן לפנות אלינו:
            </p>
            <div className="mt-3 bg-slate-50 rounded-2xl p-4 space-y-1">
              <p><strong>מסעדת עלינא</strong></p>
              <p>📧 דוא"ל: <a href="mailto:privacy@alena.co.il" className="text-blue-600 underline">privacy@alena.co.il</a></p>
              <p>📍 כתובת: רחוב הרצל 1, ראשון לציון</p>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              לפניות בנוגע להפרות פרטיות ניתן לפנות גם ל<a href="https://www.gov.il/he/departments/the_privacy_protection_authority" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">רשות הגנת הפרטיות</a>.
            </p>
          </section>

        </div>

        {/* Back */}
        <div className="mt-10 text-center">
          <a
            href="/QueueJoin"
            className="inline-block bg-slate-800 hover:bg-slate-900 text-white font-bold px-8 py-3 rounded-2xl transition-all focus:outline-none focus:ring-4 focus:ring-slate-400"
            aria-label="חזור לטופס הרישום לתור"
          >
            ← חזור לתור
          </a>
        </div>
      </div>

      <p className="text-center text-slate-400 text-xs mt-6">מסעדת עלינא © 2026</p>
    </div>
  );
}