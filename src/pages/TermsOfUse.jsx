import React from 'react';

export default function TermsOfUse() {
  return (
    <div
      className="min-h-screen p-6 max-w-2xl mx-auto"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)', color: '#e2e8f0' }}
      dir="rtl"
      lang="he"
    >
      <a
        href="#terms-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:right-4 focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2 focus:rounded focus:z-50"
      >
        דלג לתוכן
      </a>

      <div className="bg-white/95 rounded-3xl shadow-2xl p-8 text-slate-800" id="terms-content">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📋</div>
          <h1 className="text-3xl font-black text-slate-800">תקנון שימוש</h1>
          <p className="text-slate-500 text-sm mt-2">מסעדת עלינא | עדכון אחרון: אפריל 2026</p>
        </div>

        <div className="space-y-7 text-sm leading-relaxed">

          <section aria-labelledby="t1">
            <h2 id="t1" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">1. מהות השירות</h2>
            <p>
              מערכת ניהול התור של מסעדת עלינא ("המערכת") מאפשרת ללקוחות להצטרף לרשימת המתנה דיגיטלית
              ולקבל עדכונים בזמן אמת לגבי מצב תורם. ההצטרפות לתור אינה מהווה הזמנת שולחן ואינה מבטיחה
              מקום ישיבה.
            </p>
          </section>

          <section aria-labelledby="t2">
            <h2 id="t2" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">2. התור על בסיס מקום פנוי</h2>
            <p>
              הצטרפות לתור <strong>אינה כרוכה בהתחייבות</strong> מצד המסעדה לזמן המתנה מדויק.
              זמן ההמתנה תלוי בתפוסה, בגודל הקבוצה ובהעדפת הישיבה שבחרת.
              המסעדה שומרת לעצמה את הזכות לנהל את סדר התור לפי שיקול דעתה התפעולי.
              לקוח שלא יגיב לקריאת המארחת תוך 3 דקות עשוי לאבד את מקומו בתור.
            </p>
          </section>

          <section aria-labelledby="t3">
            <h2 id="t3" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">3. שימוש במידע האישי</h2>
            <p className="mb-2">הפרטים שתמסור (שם, טלפון, גודל קבוצה) ישמשו אך ורק למטרות הבאות:</p>
            <ul className="list-disc list-inside space-y-1 pr-2">
              <li>ניהול תור ההמתנה ושיבוצך בשולחן.</li>
              <li>שליחת עדכוני SMS / WhatsApp לגבי מצב תורך.</li>
              <li>זיכוי מטבעות עלינא ותכנית הנאמנות הפנימית.</li>
              <li>שיפור השירות וניתוח סטטיסטי אנונימי.</li>
            </ul>
            <p className="mt-2">
              <strong>לא</strong> נמכור, נשכיר, או נעביר את פרטיך לצדדים שלישיים ללא הסכמתך המפורשת,
              למעט כנדרש על פי חוק.
            </p>
          </section>

          <section aria-labelledby="t4">
            <h2 id="t4" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">4. הסרת מידע</h2>
            <p>
              תוכל לבקש מחיקת פרטיך מהמערכת בכל עת על ידי פנייה אלינו בדוא"ל{' '}
              <a href="mailto:privacy@alena.co.il" className="text-blue-600 underline">privacy@alena.co.il</a>{' '}
              או בפנייה ישירה לצוות המסעדה. הבקשה תטופל תוך 14 ימי עסקים.
              מחיקת המידע תגרור אובדן יתרת המטבעות הצבורה.
            </p>
          </section>

          <section aria-labelledby="t5">
            <h2 id="t5" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">5. תקשורת שיווקית (אופציונלי)</h2>
            <p>
              ברישום לתור תוכל להסכים לקבל הודעות מיוחדות על מבצעים, אירועים ופינוקים ממסעדת עלינא.
              הסכמה זו <strong>אינה חובה</strong> לצורך הצטרפות לתור ותוכל לבטלה בכל עת.
            </p>
          </section>

          <section aria-labelledby="t6">
            <h2 id="t6" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">6. שמירת מידע</h2>
            <p>
              נתוני תור נשמרים עד 12 חודשים ממועד הביקור ולאחר מכן נמחקים או מאונימיזים.
              המידע מוגן בהצפנה ובגישה מוגבלת לצוות מורשה בלבד, בהתאם לתקנות הגנת הפרטיות (אבטחת מידע), התשע"ז–2017.
            </p>
          </section>

          <section aria-labelledby="t7">
            <h2 id="t7" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">7. שינויים בתקנון</h2>
            <p>
              המסעדה רשאית לעדכן תקנון זה מעת לעת. שימוש מתמשך במערכת לאחר פרסום עדכון מהווה הסכמה לתנאים המעודכנים.
            </p>
          </section>

          <section aria-labelledby="t8">
            <h2 id="t8" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">8. יצירת קשר</h2>
            <div className="bg-slate-50 rounded-2xl p-4 space-y-1">
              <p><strong>מסעדת עלינא</strong></p>
              <p>📧 <a href="mailto:privacy@alena.co.il" className="text-blue-600 underline">privacy@alena.co.il</a></p>
              <p>📍 רחוב הרצל 1, ראשון לציון</p>
            </div>
          </section>

        </div>

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