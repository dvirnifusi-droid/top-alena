import React, { useState } from 'react';

export default function PrivacyAndAccessibility() {
  const [tab, setTab] = useState('privacy');

  return (
    <div className="min-h-screen bg-gray-50 p-4" dir="rtl">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 pt-6">
          <div className="text-4xl mb-3">⚖️</div>
          <h1 className="text-2xl font-black text-gray-800">מסעדת עלינא</h1>
          <p className="text-gray-500 text-sm mt-1">מידע משפטי ונגישות</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-white rounded-2xl p-1 shadow-sm mb-6 border border-gray-200">
          <button
            onClick={() => setTab('privacy')}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${
              tab === 'privacy' ? 'bg-slate-800 text-white shadow-md' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            🔒 מדיניות פרטיות
          </button>
          <button
            onClick={() => setTab('accessibility')}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${
              tab === 'accessibility' ? 'bg-slate-800 text-white shadow-md' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            ♿ הצהרת נגישות
          </button>
        </div>

        {/* Privacy Policy */}
        {tab === 'privacy' && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6 space-y-6">
            <div>
              <h2 className="text-xl font-black text-gray-800 mb-1">מדיניות פרטיות ואבטחת מידע</h2>
              <p className="text-gray-400 text-xs">עדכון אחרון: אפריל 2026</p>
            </div>

            <section>
              <h3 className="font-bold text-gray-800 mb-2">1. איזה מידע אנחנו אוספים?</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                במסגרת שירות ניהול התור הדיגיטלי, אנחנו אוספים את המידע הבא:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-gray-600">
                <li className="flex gap-2"><span>•</span><span><strong>שם מלא</strong> — לזיהוי בתור</span></li>
                <li className="flex gap-2"><span>•</span><span><strong>מספר טלפון</strong> — לשליחת עדכונים על התור</span></li>
                <li className="flex gap-2"><span>•</span><span><strong>גודל קבוצה והעדפת הושבה</strong> — לצורך שיבוץ</span></li>
                <li className="flex gap-2"><span>•</span><span><strong>נתוני מיקום</strong> — לאימות נוכחות ליד המסעדה בלבד (אם הופעלה אפשרות זו)</span></li>
                <li className="flex gap-2"><span>•</span><span><strong>היסטוריית ביקורים</strong> — לצורך שיפור השירות</span></li>
              </ul>
            </section>

            <section>
              <h3 className="font-bold text-gray-800 mb-2">2. לאיזה מטרה אנחנו משתמשים במידע?</h3>
              <ul className="space-y-1 text-sm text-gray-600">
                <li className="flex gap-2"><span>•</span><span>ניהול התור ושליחת עדכונים (SMS)</span></li>
                <li className="flex gap-2"><span>•</span><span>שיפור חווית השירות למבקרים חוזרים</span></li>
                <li className="flex gap-2"><span>•</span><span>מניעת הרשמה כפולה</span></li>
              </ul>
              <p className="text-gray-500 text-sm mt-2">
                <strong>אנחנו לא מוכרים, מעבירים או חולקים את המידע שלך עם צדדים שלישיים לצרכי פרסום.</strong>
              </p>
            </section>

            <section>
              <h3 className="font-bold text-gray-800 mb-2">3. שמירת המידע</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                המידע נשמר בשרתים מוצפנים (HTTPS) המנוהלים על ידי Base44 (ישראל/EU). 
                נתוני התור נשמרים למשך שנה לצורך ניתוח ושיפור שירות, ולאחר מכן נמחקים.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-gray-800 mb-2">4. הזכויות שלך לפי חוק הגנת הפרטיות (ישראל)</h3>
              <ul className="space-y-1 text-sm text-gray-600">
                <li className="flex gap-2"><span>✅</span><span>זכות לעיון — לקבל עותק של המידע שנשמר עליך</span></li>
                <li className="flex gap-2"><span>✅</span><span>זכות לתיקון — לבקש תיקון מידע שגוי</span></li>
                <li className="flex gap-2"><span>✅</span><span>זכות למחיקה — לבקש מחיקת כל המידע שלך מהמאגר</span></li>
              </ul>
              <p className="text-gray-500 text-sm mt-3">
                לממש זכויות אלו, ניתן ללחוץ על כפתור <strong>"מחק את המידע שלי"</strong> בדף התור, 
                או ליצור קשר: <a href="tel:+972500000000" className="text-blue-600 underline">050-0000000</a>
              </p>
            </section>

            <section>
              <h3 className="font-bold text-gray-800 mb-2">5. רישום מאגר מידע</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                המסעדה פועלת בהתאם לחוק הגנת הפרטיות, התשמ"א–1981 ותקנות הגנת הפרטיות 
                (אבטחת מידע), התשע"ז–2017.
              </p>
            </section>

            <div className="bg-gray-50 rounded-2xl p-4 text-center">
              <p className="text-gray-500 text-xs">שאלות? צרו קשר: <a href="mailto:info@alena.co.il" className="text-blue-600 underline">info@alena.co.il</a></p>
            </div>
          </div>
        )}

        {/* Accessibility Statement */}
        {tab === 'accessibility' && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6 space-y-6">
            <div>
              <h2 className="text-xl font-black text-gray-800 mb-1">הצהרת נגישות</h2>
              <p className="text-gray-400 text-xs">בהתאם לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג–2013</p>
            </div>

            <section>
              <h3 className="font-bold text-gray-800 mb-2">מחויבות לנגישות</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                מסעדת עלינא מחויבת לנגישות דיגיטלית לכלל לקוחותיה, לרבות אנשים עם מוגבלויות. 
                אנחנו שואפים לעמוד בתקן WCAG 2.1 ברמה AA.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-gray-800 mb-2">מה כלול בנגישות האתר?</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex gap-2 items-start"><span className="text-green-500 mt-0.5">✓</span><span>ניגודיות צבעים תואמת תקן AA</span></li>
                <li className="flex gap-2 items-start"><span className="text-green-500 mt-0.5">✓</span><span>תמיכה בניווט מקלדת</span></li>
                <li className="flex gap-2 items-start"><span className="text-green-500 mt-0.5">✓</span><span>תוויות ARIA לכפתורים ושדות קלט</span></li>
                <li className="flex gap-2 items-start"><span className="text-green-500 mt-0.5">✓</span><span>טקסט חלופי לאלמנטים ויזואליים</span></li>
                <li className="flex gap-2 items-start"><span className="text-green-500 mt-0.5">✓</span><span>גודל פונט מינימלי 14px לקריאות</span></li>
                <li className="flex gap-2 items-start"><span className="text-green-500 mt-0.5">✓</span><span>תמיכה בהגדלת טקסט עד 200% ללא פגיעה בתוכן</span></li>
                <li className="flex gap-2 items-start"><span className="text-yellow-500 mt-0.5">⚠</span><span>תמיכה מלאה בקוראי מסך — בתהליך שיפור</span></li>
              </ul>
            </section>

            <section>
              <h3 className="font-bold text-gray-800 mb-2">מגבלות ידועות</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                חלק מהאמוג'ים המשמשים בממשק עשויים שלא להיקרא כראוי על ידי כלי עזר. 
                אנחנו עובדים על שיפור זה בגרסאות הבאות.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-gray-800 mb-2">דיווח על בעיית נגישות</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                נתקלת בבעיית נגישות? אנחנו מבקשים שתיידע אותנו:
              </p>
              <div className="mt-3 space-y-2">
                <a href="tel:+972500000000" className="flex items-center gap-2 text-blue-600 text-sm font-bold">
                  📞 050-000-0000
                </a>
                <a href="mailto:accessibility@alena.co.il" className="flex items-center gap-2 text-blue-600 text-sm font-bold">
                  ✉️ accessibility@alena.co.il
                </a>
              </div>
              <p className="text-gray-400 text-xs mt-2">נטפל בפנייה תוך 5 ימי עסקים.</p>
            </section>

            <section>
              <h3 className="font-bold text-gray-800 mb-2">נגישות פיזית</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                המסעדה נגישה לכיסאות גלגלים. לסיוע בכניסה ובישיבה, אנא פנו לצוות.
              </p>
            </section>

            <div className="bg-blue-50 rounded-2xl p-4 text-center">
              <p className="text-blue-700 text-xs font-medium">
                הצהרה זו עודכנה לאחרונה: אפריל 2026
              </p>
            </div>
          </div>
        )}

        <div className="text-center mt-8 mb-4">
          <button
            onClick={() => window.history.back()}
            className="text-gray-400 text-sm hover:text-gray-600 transition-colors"
          >
            ← חזור לתור
          </button>
        </div>
      </div>
    </div>
  );
}