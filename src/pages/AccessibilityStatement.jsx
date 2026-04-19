import React from 'react';

export default function AccessibilityStatement() {
  return (
    <div
      className="min-h-screen p-6 max-w-3xl mx-auto"
      dir="rtl"
      lang="he"
      role="main"
      aria-label="הצהרת נגישות"
      style={{ background: '#fff', color: '#1a1a1a', fontFamily: 'Arial, sans-serif', lineHeight: 1.7 }}
    >
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:right-4 focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2 focus:rounded focus:z-50">
        דלג לתוכן הראשי
      </a>

      <header>
        <h1 id="main-content" tabIndex={-1} style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#1a1a1a' }}>
          הצהרת נגישות — מסעדת עלינא
        </h1>
        <p style={{ color: '#555', marginBottom: '2rem' }}>עדכון אחרון: אפריל 2026</p>
      </header>

      <main>
        <section aria-labelledby="intro-heading">
          <h2 id="intro-heading" style={{ fontSize: '1.3rem', fontWeight: 'bold', marginTop: '2rem', marginBottom: '0.5rem' }}>
            מחויבות לנגישות
          </h2>
          <p>
            מסעדת עלינא מחויבת לאפשר לכלל האוכלוסייה, לרבות אנשים עם מוגבלויות, לקבל שירות שוויוני ולגשת לתכניה הדיגיטליים בצורה נגישה ומכובדת.
            אנו פועלים בהתאם לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות) ולתקן הבינלאומי <strong>WCAG 2.1 ברמה AA</strong>.
          </p>
        </section>

        <section aria-labelledby="measures-heading">
          <h2 id="measures-heading" style={{ fontSize: '1.3rem', fontWeight: 'bold', marginTop: '2rem', marginBottom: '0.5rem' }}>
            אמצעי הנגישות שאנו מיישמים
          </h2>
          <ul style={{ paddingRight: '1.5rem', listStyleType: 'disc' }} role="list">
            <li>ניגודיות צבעים מתאימה (יחס ניגוד לפחות 4.5:1 לטקסט)</li>
            <li>אפשרות ניווט מלאה באמצעות מקלדת בלבד</li>
            <li>תמיכה בקוראי מסך (NVDA, JAWS, VoiceOver) באמצעות תגיות ARIA</li>
            <li>טקסט חלופי (alt text) לכל האלמנטים הוויזואליים</li>
            <li>הגדרת שפה ברמת הדף (lang="he")</li>
            <li>סדר תצוגה הגיוני לניווט לינארי</li>
            <li>אפשרות הגדלת גופן ללא פגיעה בפונקציונליות</li>
            <li>אינדיקטורי פוקוס ברורים על כל האלמנטים האינטראקטיביים</li>
          </ul>
        </section>

        <section aria-labelledby="status-heading">
          <h2 id="status-heading" style={{ fontSize: '1.3rem', fontWeight: 'bold', marginTop: '2rem', marginBottom: '0.5rem' }}>
            מצב הנגישות הנוכחי
          </h2>
          <p>
            אפליקציית ההרשמה לתור עומדת בדרישות תקן WCAG 2.1 ברמה AA. אנו עושים מאמצים מתמידים לשפר ולשמר רמת נגישות זו.
          </p>
        </section>

        <section aria-labelledby="limitations-heading">
          <h2 id="limitations-heading" style={{ fontSize: '1.3rem', fontWeight: 'bold', marginTop: '2rem', marginBottom: '0.5rem' }}>
            מגבלות ידועות
          </h2>
          <ul style={{ paddingRight: '1.5rem', listStyleType: 'disc' }} role="list">
            <li>תוכן שנוצר על ידי משתמשים עשוי שלא לעמוד תמיד בתקן הנגישות</li>
            <li>אנימציות מסוימות — ניתן לכבותן דרך הגדרות המערכת (Reduce Motion)</li>
          </ul>
        </section>

        <section aria-labelledby="contact-heading">
          <h2 id="contact-heading" style={{ fontSize: '1.3rem', fontWeight: 'bold', marginTop: '2rem', marginBottom: '0.5rem' }}>
            יצירת קשר בנושא נגישות
          </h2>
          <p>
            נתקלתם בבעיית נגישות? נשמח לשמוע ולסייע.
          </p>
          <address style={{ fontStyle: 'normal', marginTop: '0.5rem' }}>
            <p><strong>מסעדת עלינא</strong></p>
            <p>
              <a
                href="mailto:accessibility@alena.co.il"
                style={{ color: '#1a5fb4', textDecoration: 'underline' }}
                aria-label="שלח מייל בנושא נגישות"
              >
                accessibility@alena.co.il
              </a>
            </p>
            <p>זמן תגובה: עד 5 ימי עסקים</p>
          </address>
        </section>

        <section aria-labelledby="enforcement-heading">
          <h2 id="enforcement-heading" style={{ fontSize: '1.3rem', fontWeight: 'bold', marginTop: '2rem', marginBottom: '0.5rem' }}>
            אכיפה ותלונות
          </h2>
          <p>
            אם לא קיבלתם מענה מספק, תוכלו לפנות לנציבות שוויון זכויות לאנשים עם מוגבלות במשרד המשפטים.
          </p>
        </section>
      </main>

      <footer style={{ marginTop: '3rem', paddingTop: '1rem', borderTop: '1px solid #ddd', fontSize: '0.85rem', color: '#777' }}>
        <p>© 2026 מסעדת עלינא — כל הזכויות שמורות</p>
        <a href="/QueueJoin" style={{ color: '#1a5fb4', textDecoration: 'underline' }} aria-label="חזרה לדף ההרשמה לתור">
          ← חזרה לדף ההרשמה
        </a>
      </footer>
    </div>
  );
}