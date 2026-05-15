import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { topic, tone, restaurant_name, cuisine_style, unique_points, menu_context } = await req.json();

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

    const prompt = `אתה מומחה שיווק דיגיטלי לעסקי מסעדנות. צור פוסט אינסטגרם מושלם.

מסעדה: ${name}
סגנון מטבח: ${cuisine}
יתרונות ייחודיים: ${usp}
נושא הפוסט: ${topic || 'קידום כללי'}
טון: ${tone || 'חמים ומזמין'}
${menuSummary ? `\nפריטי תפריט לדוגמה:\n${menuSummary}` : ''}

החזר JSON בלבד:
{
  "caption": "טקסט הפוסט עם אימוג'ים (עד 150 מילים), כולל שורת תיאור, 2-3 נקודות עיקריות, קריאה לפעולה, ו-10-15 האשטגים רלוונטיים",
  "image_prompt": "תיאור מפורט באנגלית לתמונה מקצועית שתלווה את הפוסט — אוכל, אווירה, מסעדה"
}`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          caption: { type: 'string' },
          image_prompt: { type: 'string' }
        }
      }
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});