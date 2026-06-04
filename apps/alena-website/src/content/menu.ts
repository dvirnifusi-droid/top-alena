// Real Alena menu, transcribed from owner-supplied PDFs (Feb 2026).
// Prices in ILS. Modifications (טבעוני / ללא גלוטן / ניתן להוריד) noted per item.

export type MenuTag = "חם" | "מומלץ" | "חריף" | "חדש" | "ללא גלוטן" | "טבעוני";

export type MenuItem = {
  name: string;
  description: string;
  price: number;
  tags?: MenuTag[];
  image?: string;
};

export type MenuSection = {
  id: string;
  title: string;
  subtitle?: string;
  items: MenuItem[];
};

export const menu: MenuSection[] = [
  {
    id: "openers",
    title: "פותחים שולחן",
    subtitle: "ראשונות יעני",
    items: [
      {
        name: "פרנה בפחמים",
        description: "מתובלת בשילוש הקדוש (מרווה, טימין, אורגנו), טחינה, שום קונפי",
        price: 28,
      },
      {
        name: "בטטה ברולה",
        description: "בטטה מקורמלת, טחינה, סילאן, מיקס עלים, פלפל צ'ילי ומלח גס",
        price: 45,
        tags: ["מומלץ"],
        image: "/gallery/spread.jpg",
      },
      {
        name: "ציפס מתובל",
        description: "צ'יפס בית בשילוש הקדוש",
        price: 37,
        image: "/gallery/fries-dip.jpg",
      },
      {
        name: "כרוב שרוף",
        description: "במרינדה שילוש קדוש, טחינה, סילאן, שקדים קלויים ופטרוזליה",
        price: 45,
      },
      {
        name: "חצילוני",
        description: "חציל שלם בפחמים, טחינה גולמית, סילאן, שום קונפי, צנוברים ופטרוזליה. מוגש עם 2 פרנות",
        price: 45,
      },
      {
        name: "תפוא קריספי",
        description: "תפו״א של 300 גרם בפחמים ואז מטוגן, מתובל בפסט שילוש קדוש לצד איולי פסט",
        price: 37,
        tags: ["מומלץ"],
      },
      {
        name: "לקט פטריות",
        description: "שמפיניון, פורטבלו, פסט שילוש קדוש",
        price: 45,
      },
    ],
  },
  {
    id: "in-between",
    title: "תחלקו",
    subtitle: "בין לבין",
    items: [
      {
        name: "גבט׳ה שרופה (סיגר בשר)",
        description: "מילוי בקר, חצילים וצנוברים. איולי פסט, בצל מקורמל, סחוג שבור ושום קונפי",
        price: 50,
      },
      {
        name: "סנייה קבב",
        description: "כ-120 גרם בשר קבב על חציל פחמים, טחינה, צנוברים, פטרוזליה וסומק. מוגש עם 2 פרנות",
        price: 58,
      },
      {
        name: "ברוסקטה אסאדו",
        description: "3 יחידות גבט׳ה שרופה עם אסאדו מפורק בבישול ארוך, מיקס עלים, עגבנייה שרופה, טחינה וקרם חציל שרוף. מתקתק.",
        price: 61,
        tags: ["מומלץ"],
        image: "/gallery/carpaccio.jpg",
      },
      {
        name: "לחוח מסאחן (קבב)",
        description: "קבב קצוץ, טחינה, בצל מקורמל, שום קונפי ופטרוזליה. 3 יחידות לחוח תימני של סבתא",
        price: 54,
      },
      {
        name: "סינטה מינוט",
        description: "100 גרם סינטה צרובה, טחינה, צימצורי, עגבנייה קצוצה, עגבניות שרי",
        price: 71,
        tags: ["מומלץ"],
      },
      {
        name: "קרפצ'יו סינטה",
        description: "בלסמי מצומצם, שמן זית, ריבת פלפלים, צנונית, מיקס עלים ושום קונפי. מוגש עם 3 ברוסקטות",
        price: 57,
        tags: ["חריף"],
        image: "/gallery/carpaccio-2.jpg",
      },
      {
        name: "לחוח מסאחן פרגית",
        description: "מסאחן של פרגית, פסט, כרוב שרוף קצוץ, בצל כבוש ופטרוזליה",
        price: 58,
      },
      {
        name: "עראייס אסאדו",
        description: "3 חצאים של מיני פיתה במילוי בקר, חציל, צנוברים. סלטון עשבים ואיולי פסט בצד",
        price: 51,
      },
    ],
  },
  {
    id: "salads",
    title: "סלטים",
    items: [
      {
        name: "סלט שוק",
        description: "קולורבי, מלפפון, עגבניות שרי, צנונית, מיקס עלים, בצל סגול, זיתים, שמן זית. מוגש על טחינה",
        price: 51,
      },
      {
        name: "סלט דודז",
        description: "עגבניות שרי, בצל סגול, נגיעת סחוג, בזילקום מטוגן, כוסברה קצוצה וצנוברים",
        price: 56,
        tags: ["חריף"],
      },
      {
        name: "סלט עלים",
        description: "חסה לאליק, תפוח ירוק, פקאן מסוכר, בצל סגול, וינגרט חומץ תפוחים ודבש",
        price: 58,
      },
    ],
  },
  {
    id: "mains",
    title: "עיקריות",
    subtitle: "על האש",
    items: [
      {
        name: "עלינאבורגר",
        description: "220 גרם בקר. איולי פסט. חסה. עגבנייה. חמוצים. בצל מקורמל",
        price: 64,
        tags: ["מומלץ"],
        image: "/gallery/burger-hero.jpg",
      },
      {
        name: "עלינא-בור-גר אסאדו",
        description: "220 גרם קציצת בקר עם אסאדו מפורק. חסה, חמוצים, בצל כבוש ומקורמל, שום קונפי, איולי פסט",
        price: 76,
        tags: ["חדש"],
        image: "/gallery/burger-1.jpg",
      },
      {
        name: "אנטריקוט רחוב",
        description: "200 גרם אנטריקוט בפחמים. שום קונפי. תפוא קריספי. צימצורי. הנתח מוגש פרוס",
        price: 134,
        tags: ["מומלץ"],
      },
      {
        name: "נתח קצבים",
        description: "200 גרם. סלט פרשי, עגבנייה שרופה, טחינה וקרם חציל שרוף. החל ממידת Medium",
        price: 122,
      },
      {
        name: "קבב של יהודית",
        description: "240 גרם. סלט פרשי, עגבנייה על האש. טחינה",
        price: 64,
      },
      {
        name: "תרנגולים על האש",
        description: "200 גרם. סלט פרשי, עגבנייה על האש. טחינה",
        price: 69,
      },
    ],
  },
  {
    id: "desserts",
    title: "קינוחים",
    items: [
      {
        name: "שוקולד חם",
        description: "עוגת שוקולד חמה, קרמל מלוח וקראמבל במבה",
        price: 43,
        tags: ["חם"],
      },
      {
        name: "רוטונדו שוקולד",
        description: "קראנצ' לואקר ונוגט, פחזנית במילוי קרם פטיסייר בקרם נוטלה ושוקולד לבן",
        price: 43,
      },
      {
        name: "פאי לימון",
        description: "קדאיף פיסטוק, רוטב פיסטוק ושוקולד לבן",
        price: 43,
      },
    ],
  },
];

// === Drinks ===

export type DrinkItem = {
  name: string;
  description?: string;
  price: number | { glass: number; bottle: number };
  tags?: ("מומלץ" | "ללא אלכוהול")[];
};

export type DrinkSection = {
  id: string;
  title: string;
  subtitle?: string;
  items: DrinkItem[];
};

export const drinks: DrinkSection[] = [
  {
    id: "cocktails",
    title: "קוקטיילים",
    items: [
      { name: "מוחות'ים", description: "ערק, אשכוליות, שקדים, סודה", price: 49 },
      { name: "שער ירושלים", description: "ערק אשקלון / אבסולוט (לימונדה / אשכוליות / אקסל)", price: 45 },
      { name: "פינק ליידי", description: "וודקה, תות, אשכוליות", price: 49 },
      { name: "ביפיטר ליצ'י", description: "גין, ליצ'י, קוקוס, סודה", price: 49 },
      { name: "חמסה עליך", description: "גין, תות, פסיפלורה, לימון, סודה", price: 54, tags: ["מומלץ"] },
      { name: "קארטיב אננס", description: "גין, ואן גוך אננס, תות", price: 51 },
      { name: "פלאייה פפאיה", description: "וויסקי, אננס, פסיפלורה, לימון, סודה", price: 54, tags: ["מומלץ"] },
      { name: "אפרול שפריץ", description: "אפרול, יין לבן, סודה", price: 46 },
    ],
  },
  {
    id: "mocktails",
    title: "קוקטיילים ללא אלכוהול",
    items: [
      { name: "לא נוגעת בוודקה", description: "אננס, פסיפלורה, לימון, ספרייט", price: 39, tags: ["ללא אלכוהול"] },
      { name: "לא עלינא", description: "תות, אבטיח, לימון, ספרייט", price: 39, tags: ["ללא אלכוהול"] },
    ],
  },
  {
    id: "beers",
    title: "בירות",
    items: [
      { name: "גולדסטאר חבית", price: { glass: 29, bottle: 61 } },
      { name: "שפירא חבית", price: { glass: 33, bottle: 71 } },
      { name: "פאולנר", price: 32 },
      { name: "קסטיל", price: 36 },
    ],
  },
  {
    id: "wines-red",
    title: "יינות אדום",
    items: [
      { name: "רזרב מרלו | ברקן", price: { glass: 38, bottle: 130 } },
      { name: "בטא ארגמן | ברקן", price: { glass: 47, bottle: 171 } },
      { name: "גי פולאק שיראז | דרום אפריקה", price: { glass: 47, bottle: 168 } },
      { name: "קברנה סוביניון | פסגות", price: { bottle: 238 } as never },
    ],
  },
  {
    id: "wines-white",
    title: "יינות לבן ורוזה",
    items: [
      { name: "גוורץ פסגות (חצי יבש)", price: { glass: 42, bottle: 182 } },
      { name: "רזרב גוורצטרמינר | ברקן", price: { glass: 38, bottle: 130 } },
      { name: "פינו גריזו | גלאם", price: { glass: 41, bottle: 142 } },
      { name: "שרדונה | גלאם", price: { glass: 39, bottle: 139 } },
      { name: "בטא שנין בלאן | ברקן", price: { glass: 51, bottle: 188 } },
      { name: "פטי שאבלי | צרפת", price: { bottle: 298 } as never },
      { name: "רוזה בלאש | ברקן", price: { glass: 42, bottle: 148 } },
    ],
  },
  {
    id: "spirits",
    title: "אלכוהול",
    subtitle: "3 צ'ייסרים ב-39 ₪ / 3 פרימיום ב-49 ₪",
    items: [
      { name: "אבסולוט", price: { glass: 17, bottle: 644 } as never },
      { name: "בלוגה (פרימיום)", price: { glass: 22, bottle: 814 } as never },
      { name: "ג'יימסון", price: 20 },
      { name: "בלק לאבל", price: { glass: 20, bottle: 460 } as never },
      { name: "ערק אשקלון", price: { glass: 15, bottle: 460 } as never },
      { name: "ערק עלית", price: 18 },
      { name: "פטרון", price: { glass: 26, bottle: 814 } as never },
      { name: "טקילה אולמקה", price: 18 },
    ],
  },
  {
    id: "alena-arak",
    title: "הערקייה של עלינא",
    subtitle: "ערקים מתובלים בית עלינא",
    items: [
      { name: "ערק שחור", description: "קינמון, ליקריץ, אניס", price: 17 },
      { name: "ערק אדום", description: "ליצ'י, חמוציות", price: 17 },
      { name: "ערק מתובל", description: "תפוח הבית ורוזטה", price: 17 },
    ],
  },
];

export const softDrinks = [
  { name: "סודה", price: 13 },
  { name: "מים", price: 10 },
  { name: "לימונדה", price: 10 },
  { name: "אקסל", price: 16 },
  { name: "קולה / קולה זירו / 7אפ / 7אפ זירו / פיוזטי", price: 14 },
];
