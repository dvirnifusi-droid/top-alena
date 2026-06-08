// Official events catering menu — verbatim from "תפריט קבוצות לאורח.docx".
// Used to pre-fill the Sales Kit and as a contract menu snapshot.
//
// The agent and the customer-facing menu picker both reference this structure.
// To update the menu, edit this file (single source of truth).
export const OFFICIAL_EVENT_GROUP_MENU = {
  id: 'group_dinner_195',
  name: 'תפריט אירוח קבוצות',
  price_per_person_ils: 195,
  kids_discount_pct: 25,                  // children under 12 get 25% off
  kids_age_max: 12,
  kids_includes_label: 'מנת ילדים אישית הכוללת שניצל וצ׳יפס',
  min_guests: 10,
  max_guests: 60,
  // What's included in the base ₪195
  includes: [
    'קנקני מים לשולחן',
    'כוס יין הבית או בירה מהחבית לכל סועד',
    'פתיחת שולחן קבועה',
    '3 מנות פתיחה לבחירה',
    '2 מנות שיתוף לבחירה',
    '2 סלטים לבחירה',
    'פלטת בשרים למרכז השולחן (350 גרם בשר לסועד)',
    'קינוח לבחירה',
    'תה וקפה שחור',
  ],
  // Structured categories — agent uses these to walk the customer through
  // selections and validate (e.g. exactly 3 starters).
  categories: [
    {
      id: 'opener_table',
      label: 'פתיחת שולחן (קבוע)',
      pick: 'fixed',                       // not a choice
      items: ['פרנה', 'טחינה', 'חומוס', 'משוויה'],
    },
    {
      id: 'starters',
      label: 'מנות פתיחה',
      pick: 3,
      items: [
        'בטטה בורלה',
        'צ׳יפס מטובל',
        'כרוב שרוף',
        'חצילוני',
        'תפוח אדמה קריספי',
        'קוסקוס',
        'אורז לבן',
        'מבחר חמוצים',
      ],
    },
    {
      id: 'sharing',
      label: 'מנות שיתוף',
      pick: 2,
      items: [
        'ברוסקטה אסאדו',
        'סנייה קבב',
        'עראיס אסאדו',
        'לחוח קבב',
        'לחוח פרגית',
        'סיגר בשר',
        'קרפצ׳יו בקר',
      ],
    },
    {
      id: 'salads',
      label: 'סלטים',
      pick: 2,
      items: ['סלט שוק', 'סלט עלים', 'סלט ישראלי'],
    },
    {
      id: 'main',
      label: 'עיקרית — פלטת בשרים (קבוע)',
      pick: 'fixed',
      items: ['פרגית', 'קבב הבית', 'מרגז', 'ירקות שרופים'],
      note: '350 גרם בשר לסועד',
    },
    {
      id: 'dessert',
      label: 'קינוחים',
      pick: 1,
      items: ['עוגיות מרוקאיות', 'פירות העונה', 'סורבה שני טעמים'],
      extra_cost_per_person_ils: 12,
      extra_cost_label: 'קינוח נוסף — ₪12 לסועד',
    },
  ],
  // Per-person meat upgrades — additive to base price
  meat_upgrades: [
    { id: 'antrikot', name: 'אנטריקוט', surcharge_per_person_ils: 8 },
    { id: 'natach_katzavim', name: 'נתח קצבים', surcharge_per_person_ils: 12 },
    { id: 'kavad_avaz', name: 'כבד אווז', surcharge_per_person_ils: 15 },
  ],
  // Mutually-exclusive drink packages (customer picks one or none)
  drink_packages: [
    { id: 'juices', name: 'קנקני מיצים ללא הגבלה (לימונדה, תפוזים, אשכוליות)', price_per_person_ils: 12 },
    { id: 'soda', name: 'שתייה קלה מוגזת ללא הגבלה', price_per_person_ils: 24 },
    { id: 'wine_beer', name: 'יין הבית ובירה ללא הגבלה', price_per_person_ils: 32 },
    { id: 'full', name: 'חבילה מלאה (מיצים + שתייה קלה + יין/בירה)', price_per_person_ils: 48 },
  ],
  alcohol_bottles_discount_pct: 10,
  alcohol_bottles_note: 'בקבוקי אלכוהול מהתפריט — 10% הנחה ממחיר התפריט',
  // Allergies / dietary options that the customer can flag in the contract
  dietary_options: [
    'צמחוני',
    'טבעוני',
    'ללא גלוטן',
    'אלרגיה לאגוזים',
    'אלרגיה לבוטנים',
    'אלרגיה לחלב',
    'אחר',
  ],
};
