import React from 'react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }} dir="rtl">
      <div className="bg-white/95 rounded-3xl p-8 shadow-2xl">
        <h1 className="text-2xl font-black text-gray-800 mb-2">הצהרת נגישות ומדיניות פרטיות</h1>
        <p className="text-gray-500 text-sm mb-8">מסעדת עלינא — עדכון אחרון: אפריל 2026</p>

        <section className="mb-8">
          <h2 className="text-xl font-black text-gray-700 mb-3">🔐 פרטיות ואבטחת מידע</h2>
          <div className="space-y-3 text-gray-600 text-sm leading-relaxed">
            <p><strong>מה אנו אוספים:</strong> שם, מספר טלפון וגודל קבוצה — אך ורק לצורך ניהול התור ומתן שירות.</p>
            <p><strong>שימוש במידע:</strong> המידע משמש לניהול תור ההמתנה, שליחת עדכוני SMS על מצב התור, ובהסכמה בלבד — עדכונים ומבצעים.</p>
            <p><strong>אחסון:</strong> המידע מאוחסן בשרתים מוצפנים (HTTPS/TLS) בפלטפורמת Base44.</p>
            <p><strong>שמירת מידע:</strong> נתוני תור נשמרים עד 12 חודשים לצורכי ניתוח שיפור שירות, ולאחר מכן נמחקים.</p>
            <p><strong>זכות מחיקה:</strong> ניתן לפנות אלינו בכל עת לבקשת מחיקת המידע: <strong>עלינא</strong> | <a href="tel:+972" className="text-blue-600 underline">התקשרו אלינו</a></p>
            <p><strong>אין מכירת מידע:</strong> איננו מוכרים או מעבירים מידע לצד שלישי.</p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-black text-gray-700 mb-3">📋 תקנון שימוש</h2>
          <div className="space-y-3 text-gray-600 text-sm leading-relaxed">
            <p><strong>אופי השירות:</strong> שירות ניהול התור הוא שירות עזר בלבד. הרשמה לתור אינה מהווה הבטחה לשולחן או לזמן המתנה מוגדר.</p>
            <p><strong>זמן המתנה:</strong> זמן ההמתנה תלוי בתפוסת המסעדה ואינו מובטח. המסעדה רשאית לשנות את סדר התור לפי שיקול דעתה.</p>
            <p><strong>נוכחות פיזית:</strong> ההרשמה לתור מיועדת ללקוחות הנמצאים פיזית בקרבת המסעדה. הרשמה מרחוק עלולה להביא להסרה מהתור.</p>
            <p><strong>ביטול:</strong> לקוח רשאי לבטל את מקומו בתור בכל עת דרך הממשק.</p>
            <p><strong>פינוקים ומטבעות:</strong> מטבעות עלינא הם ערך וירטואלי למימוש בתוך המסעדה בלבד, ואין להם ערך כספי.</p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-black text-gray-700 mb-3">♿ הצהרת נגישות</h2>
          <div className="space-y-3 text-gray-600 text-sm leading-relaxed">
            <p>מסעדת עלינא מחויבת לנגישות דיגיטלית בהתאם לתקן <strong>WCAG 2.1 רמה AA</strong> ולחוק שוויון זכויות לאנשים עם מוגבלות.</p>
            <p><strong>מה יישמנו:</strong></p>
            <ul className="list-disc list-inside space-y-1 mr-4">
              <li>ניגודיות צבעים עומדת בתקן AA</li>
              <li>ניתן לנווט בממשק באמצעות מקלדת בלבד</li>
              <li>שדות הטופס מכילים תוויות (Labels) נגישות</li>
              <li>כפתורים כוללים תיאור מילולי לקוראי מסך</li>
              <li>הממשק תומך בכיוון RTL</li>
            </ul>
            <p><strong>נתקלתם בבעיית נגישות?</strong> פנו אלינו ונטפל בהקדם.</p>
            <p className="text-xs text-gray-400 mt-2">הצהרה זו עודכנה באפריל 2026. אנו פועלים לשיפור מתמיד.</p>
          </div>
        </section>

        <div className="border-t pt-4 text-center">
          <button
            onClick={() => window.history.back()}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors underline"
          >
            ← חזור
          </button>
        </div>
      </div>
    </div>
  );
}