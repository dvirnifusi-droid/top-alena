import { Container } from "@/components/layout/Container";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "אודות עלינא — חמארה ים-תיכונית כשרה",
  description: "הסיפור של עלינא: בר רחוב שמח, חמארה ים-תיכונית כשרה ברוטשילד 104 ראשון לציון.",
  path: "/אודות",
});

export default function AboutPage() {
  return (
    <Container className="max-w-3xl py-16">
      <h1 className="font-display text-5xl">הסיפור של עלינא</h1>
      <div className="mt-6 space-y-4 text-lg leading-relaxed text-charcoal/85">
        <p>
          עלינא נולדה מאהבה לאוכל ים-תיכוני אמיתי. אנחנו לוקחים את הקלאסיקות של אוכל הרחוב — חומוס חם,
          סלטים טריים, פיתות ביתיות, בשרים על האש — ומגישים אותם בגרסה כשרה ואיכותית, באווירה של בר רחוב
          שמח.
        </p>
        <p>
          בלב רוטשילד 104 בראשון לציון, אנחנו פתוחים שישה ימים בשבוע (חוץ משישי), עם ערבי נושא קבועים:
          יום ראשון Burger Night, יום שני ערב יין, יום שלישי Butcher Night.
        </p>
        <p>
          יש לנו גם אולם פרטי שמתאים לאירועים עד 50 איש — ימי הולדת, אירועי חברה, אירוסים, ובר/בת מצווה.
        </p>
      </div>
    </Container>
  );
}
