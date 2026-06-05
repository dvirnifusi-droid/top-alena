import { Container } from "@/components/layout/Container";
import { pageMetadata } from "@/lib/seo";
import { env } from "@/lib/env";

export const metadata = pageMetadata({
  title: "הצהרת נגישות — עלינא",
  description:
    "אתר עלינא נגיש בכל הרמות הסבירות לפי תקנות שוויון זכויות לאנשים עם מוגבלות. דרכי התקשרות לדיווח על בעיית נגישות.",
  path: "/accessibility",
});

export default function AccessibilityStatement() {
  return (
    <Container className="max-w-3xl py-16">
      <header className="text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-brass">נגישות</p>
        <h1 className="mt-4 font-display text-4xl text-charcoal md:text-5xl">הצהרת נגישות</h1>
        <p className="mt-3 text-sm text-charcoal/60">עודכן לאחרונה: 5 ביוני 2026</p>
      </header>

      <article className="mt-12 space-y-6 text-lg leading-relaxed text-charcoal/85">
        <p>
          עלינא רואה בנגישות האתר חלק בלתי נפרד מהשירות. אנחנו פועלים להנגשת האתר בעמידה
          בתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע״ג-2013, על-פי תקן
          ישראלי 5568 ברמה AA, וברוח הנחיות ה-WCAG 2.1 הבינלאומיות.
        </p>

        <h2 className="mt-10 font-display text-2xl text-charcoal">מה הונגש באתר</h2>
        <ul className="space-y-2 ps-6">
          <li className="relative before:absolute before:-start-5 before:top-3 before:h-1.5 before:w-1.5 before:rounded-full before:bg-brass">
            רכיב נגישות צף בכל עמוד שמאפשר התאמה אישית של תצוגה
          </li>
          <li className="relative before:absolute before:-start-5 before:top-3 before:h-1.5 before:w-1.5 before:rounded-full before:bg-brass">
            הגדלת/הקטנת גודל טקסט בארבעה צעדים
          </li>
          <li className="relative before:absolute before:-start-5 before:top-3 before:h-1.5 before:w-1.5 before:rounded-full before:bg-brass">
            מצב ניגודיות גבוהה, מצב גווני אפור
          </li>
          <li className="relative before:absolute before:-start-5 before:top-3 before:h-1.5 before:w-1.5 before:rounded-full before:bg-brass">
            הדגשת קישורים והדגשת כותרות
          </li>
          <li className="relative before:absolute before:-start-5 before:top-3 before:h-1.5 before:w-1.5 before:rounded-full before:bg-brass">
            עצירת אנימציות מלאה (גם אוטומטית למשתמשי prefers-reduced-motion)
          </li>
          <li className="relative before:absolute before:-start-5 before:top-3 before:h-1.5 before:w-1.5 before:rounded-full before:bg-brass">
            סמן עכבר מוגדל
          </li>
          <li className="relative before:absolute before:-start-5 before:top-3 before:h-1.5 before:w-1.5 before:rounded-full before:bg-brass">
            קישור ״דלג לתוכן הראשי״ הנפתח בלחיצת Tab ראשונה
          </li>
          <li className="relative before:absolute before:-start-5 before:top-3 before:h-1.5 before:w-1.5 before:rounded-full before:bg-brass">
            ניווט מלא דרך מקלדת + סימני פוקוס בולטים
          </li>
          <li className="relative before:absolute before:-start-5 before:top-3 before:h-1.5 before:w-1.5 before:rounded-full before:bg-brass">
            תיאורי alt בעברית לכל התמונות
          </li>
          <li className="relative before:absolute before:-start-5 before:top-3 before:h-1.5 before:w-1.5 before:rounded-full before:bg-brass">
            תגיות ARIA נכונות לרכיבים אינטראקטיביים
          </li>
          <li className="relative before:absolute before:-start-5 before:top-3 before:h-1.5 before:w-1.5 before:rounded-full before:bg-brass">
            מבנה היררכי תקין של כותרות (H1, H2, H3)
          </li>
          <li className="relative before:absolute before:-start-5 before:top-3 before:h-1.5 before:w-1.5 before:rounded-full before:bg-brass">
            יעדי מגע מינימליים של 44×44 פיקסל בנייד
          </li>
        </ul>

        <h2 className="mt-10 font-display text-2xl text-charcoal">חלקים שעדיין דורשים שיפור</h2>
        <p>
          אנחנו ממשיכים לעבוד על הנגשת מלאה של המסעדה הפיזית ושל תכנים שהוטמעו ממקורות חיצוניים
          (כגון מערכת הזמנת השולחנות OnTopo או פיד אינסטגרם). אם נתקלתם בחלק שלא נגיש לכם —
          אנא דווחו לנו ונטפל בהקדם.
        </p>

        <h2 className="mt-10 font-display text-2xl text-charcoal">נגישות המסעדה הפיזית</h2>
        <ul className="space-y-2 ps-6">
          <li className="relative before:absolute before:-start-5 before:top-3 before:h-1.5 before:w-1.5 before:rounded-full before:bg-brass">
            כניסה מותאמת לכיסא גלגלים מהרחוב
          </li>
          <li className="relative before:absolute before:-start-5 before:top-3 before:h-1.5 before:w-1.5 before:rounded-full before:bg-brass">
            שירותים נגישים זמינים במקום
          </li>
          <li className="relative before:absolute before:-start-5 before:top-3 before:h-1.5 before:w-1.5 before:rounded-full before:bg-brass">
            תפריט בעל פה זמין לאנשים עם מוגבלות ראייה
          </li>
          <li className="relative before:absolute before:-start-5 before:top-3 before:h-1.5 before:w-1.5 before:rounded-full before:bg-brass">
            צוות מוכן לסייע בכל בקשה
          </li>
        </ul>

        <h2 className="mt-10 font-display text-2xl text-charcoal">פנייה ודיווח על בעיית נגישות</h2>
        <p>
          נתקלתם בבעיה? יש לכם רעיון לשיפור? נשמח לשמוע. דרכי התקשרות:
        </p>
        <div className="rounded-2xl bg-cream-soft p-6 ring-1 ring-brass/15">
          <p>
            <strong className="text-olive">רכז נגישות:</strong> דביר ניפוסי
          </p>
          <p className="mt-2">
            <strong className="text-olive">טלפון:</strong>{" "}
            <a href={`tel:${env.NEXT_PUBLIC_PHONE}`} className="text-terracotta underline">
              {env.NEXT_PUBLIC_PHONE}
            </a>
          </p>
          <p className="mt-2">
            <strong className="text-olive">דוא״ל:</strong>{" "}
            <a href="mailto:dvirnifusi@gmail.com" className="text-terracotta underline">
              dvirnifusi@gmail.com
            </a>
          </p>
          <p className="mt-2">
            <strong className="text-olive">WhatsApp:</strong>{" "}
            <a
              href={env.NEXT_PUBLIC_WHATSAPP_URL}
              target="_blank"
              rel="noopener"
              className="text-terracotta underline"
            >
              שליחת הודעה
            </a>
          </p>
          <p className="mt-2">
            <strong className="text-olive">כתובת:</strong> רוטשילד 104, ראשון לציון
          </p>
          <p className="mt-4 text-sm text-charcoal/70">
            אנחנו מתחייבים לחזור לכל פנייה בנושא נגישות תוך 5 ימי עבודה.
          </p>
        </div>
      </article>
    </Container>
  );
}
