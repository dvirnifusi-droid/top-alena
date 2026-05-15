import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { topic, tone, restaurant_name, cuisine_style, unique_points, menu_context, image_url } = await req.json();

    const [profile, menuItems] = await Promise.all([
      base44.asServiceRole.entities.RestaurantProfile.list(),
      base44.asServiceRole.entities.MenuItem.list('-created_date', 30)
    ]);
    const prof = profile[0] || {};

    const name = restaurant_name || prof.restaurant_name || 'המסעדה';
    const cuisine = cuisine_style || prof.cuisine_style || '';
    const usp = unique_points || (prof.unique_selling_points || []).join(', ') || '';

    // Build menu context
    const menuSummary = menu_context || (menuItems.length > 0
      ? menuItems.slice(0, 15).map(m => `${m.name}${m.price ? ` (₪${m.price})` : ''}${m.description ? ` - ${m.description}` : ''}`).join('\n')
      : '');

    const imageInstruction = image_url
      ? `\nלפניך תמונה של מנה/מוצר/אווירה מהמסעדה. נתח אותה בקפידה: מה רואים? אילו מנות/חומרים/צבעים בולטים? מה האווירה? השתמש בניתוח זה כבסיס ראשי לכתיבת הפוסט - הפוסט חייב להתייחס לתמונה ולמה שרואים בה.`
      : '';

    const prompt = `אתה מומחה שיווק דיגיטלי לעסקי מסעדנות. צור פוסט אינסטגרם מושלם שמניע לפעולה.${imageInstruction}

מסעדה: ${name}
סגנון מטבח: ${cuisine}
יתרונות ייחודיים: ${usp}
נושא הפוסט: ${topic || (image_url ? 'מבוסס על התמונה' : 'קידום כללי')}
טון: ${tone || 'חמים ומזמין'}
${menuSummary ? `\nפריטי תפריט לדוגמה:\n${menuSummary}` : ''}

הנחיות:
- אם יש תמונה — התחל מניתוח מה שרואים ובנה את הפוסט סביב זה
- כלול קריאה לפעולה חזקה (הזמן שולחן, בוא לטעום, השאר לייק)
- השתמש ב-10-15 האשטגים רלוונטיים בעברית ואנגלית
- הפוסט יהיה עד 150 מילים, עם אימוג'ים

החזר JSON בלבד:
{
  "caption": "טקסט הפוסט",
  "image_prompt": "תיאור מפורט באנגלית לתמונה מקצועית שתלווה את הפוסט — אוכל, אווירה, מסעדה",
  "image_analysis": "תיאור קצר של מה שראית בתמונה (רק אם סופקה תמונה, אחרת ריק)"
}`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      file_urls: image_url ? [image_url] : undefined,
      response_json_schema: {
        type: 'object',
        properties: {
          caption: { type: 'string' },
          image_prompt: { type: 'string' },
          image_analysis: { type: 'string' }
        }
      }
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});