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

          <section aria-labelledby="s1">
            <h2 id="s1" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">1. כללי</h2>
            <p>
              השימוש במערכת הצטרפות לרשימת ההמתנה של מסעדת עלינא ("המסעדה", "השירות") כפוף לתנאים המפורטים
              במסמך זה. הרשמה לתור מהווה הסכמה מלאה לתקנון זה.
            </p>
          </section>

          <section aria-labelledby="s2">
            <h2 id="s2" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">2. אופי השירות — אין התחייבות לזמן המתנה</h2>
            <p className="mb-2">
              רשימת ההמתנה מנוהלת על בסיס <strong>מקומות פנויים בפועל</strong>. המסעדה אינה מתחייבת:
            </p>
            <ul className="list-disc list-inside space-y-1 pr-2">
              <li>לזמן המתנה מדויק או מקסימלי.</li>
              <li>לשמירת מקום מסוים (שולחן / פנים / חוץ) בכפוף לזמינות.</li>
              <li>לקבלת הלקוח בסדר רישום מחייב — יתכנו שיקולים תפעוליים.</li>
            </ul>
            <p className="mt-2">
              הרישום לתור אינו מהווה הזמנת שולחן ואינו יוצר חוזה מחייב בין הלקוח למסעדה.
            </p>
          </section>

          <section aria-labelledby="s3">
            <h2 id="s3" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">3. המידע שנאסף ושימושו</h2>
            <p className="mb-2">במסגרת ההרשמה לתור, אנו אוספים:</p>
            <ul className="list-disc list-inside space-y-1 pr-2">
              <li><strong>שם מלא ומספר טלפון</strong> — לניהול התור ולתקשורת שירות (SMS / WhatsApp).</li>
              <li><strong>גודל קבוצה והעדפת הושבה</strong> — לתפעול פנימי בלבד.</li>
              <li><strong>מיקום משוער</strong> — לאימות נוכחות בסביבת המסעדה בלבד; אינו נשמר לאחר הביקור.</li>
            </ul>
            <p className="mt-2">
              המידע משמש <strong>אך ורק</strong> לניהול התור, לשליחת עדכונים על מצב ההמתנה ולמתן
              פינוקים ותגמולים כחלק מתכנית הנאמנות הפנימית של המסעדה.
            </p>
          </section>

          <section aria-labelledby="s4">
            <h2 id="s4" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">4. תקשורת שיווקית</h2>
            <p>
              בהסכמתך (על בסיס "אופציונלי" בטופס), המסעדה רשאית לשלוח לך הודעות על מבצעים, אירועים
              ועדכונים. ניתן לבטל הסכמה זו בכל עת על ידי פנייה אלינו (ראה סעיף 7).
              אי-מתן הסכמה לדיוור <strong>לא תפגע</strong> ביכולתך להצטרף לתור.
            </p>
          </section>

          <section aria-labelledby="s5">
            <h2 id="s5" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">5. שמירת מידע ומחיקה</h2>
            <p>
              נתוני ביקורים נשמרים עד <strong>12 חודשים</strong> ממועד הביקור האחרון, ולאחר מכן נמחקים
              או מאורגנים בצורה אנונימית לצרכי סטטיסטיקה בלבד.
              בהתאם לחוק הגנת הפרטיות, תשמ"א–1981, ניתן לבקש בכל עת:
            </p>
            <ul className="list-disc list-inside space-y-1 pr-2 mt-2">
              <li><strong>עיון</strong> במידע השמור עליך.</li>
              <li><strong>תיקון</strong> מידע שגוי.</li>
              <li><strong>מחיקה</strong> של פרטיך מהמערכת.</li>
            </ul>
          </section>

          <section aria-labelledby="s6">
            <h2 id="s6" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">6. אבטחת מידע</h2>
            <p>
              המסעדה פועלת בהתאם לתקנות הגנת הפרטיות (אבטחת מידע), התשע"ז–2017,
              ומיישמת אמצעי הגנה טכניים ומנהלתיים כנדרש. ראה <a href="/PrivacyPolicy" className="text-blue-600 underline">מדיניות הפרטיות</a> לפרטים נוספים.
            </p>
          </section>

          <section aria-labelledby="s7">
            <h2 id="s7" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">7. יצירת קשר והסרה</h2>
            <div className="bg-slate-50 rounded-2xl p-4 space-y-1">
              <p><strong>מסעדת עלינא</strong></p>
              <p>📧 <a href="mailto:privacy@alena.co.il" className="text-blue-600 underline">privacy@alena.co.il</a></p>
              <p>📍 רחוב הרצל 1, ראשון לציון</p>
            </div>
          </section>

          <section aria-labelledby="s8">
            <h2 id="s8" className="text-lg font-black text-slate-800 mb-2 border-b border-slate-200 pb-1">8. דין חל וסמכות שיפוט</h2>
            <p>
              תקנון זה כפוף לחוקי מדינת ישראל. כל מחלוקת תידון בבתי המשפט המוסמכים במחוז תל אביב–יפו.
            </p>
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