import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const questions = [
      // ארוחת חברים (friends)
      { question: '[שם], מי כאן הכי סביר שימצא את עצמו רוקד על השולחן בסוף הערב?', category: 'friends' },
      { question: '[שם], מה הדבר הכי דבילי שעשית כדי להרשים מישהו/י שנדלקת עליו/ה?', category: 'friends' },
      { question: '[שם], אם היית חייב/ת למחוק איש קשר אחד מהשולחן לנצח – מי זה היה?', category: 'friends' },
      { question: '[שם], מה הסטורי הכי מביך שהעלית ומחקת אחרי דקה?', category: 'friends' },
      { question: '[שם], מי מהחברים כאן הכי "קמצן" כשמגיע החשבון?', category: 'friends' },
      { question: '[שם], מה הדבר הכי לא חוקי שעשית ואף אחד בחדר לא יודע?', category: 'friends' },
      { question: '[שם], אם היית דמות ב"קופה ראשית", מי היית?', category: 'friends' },
      { question: '[שם], מה השקר הכי גדול שסיפרת ב"דייט ראשון"?', category: 'friends' },
      { question: '[שם], מי כאן הכי סביר שיעבור לגור בתאילנד ויפתח דוכן שייקים?', category: 'friends' },
      { question: '[שם], מה המנה הכי מגעילה שאכלת רק כי זה היה יקר?', category: 'friends' },
      { question: '[שם], מי כאן "חופר" בוואטסאפ יותר מדי?', category: 'friends' },
      { question: '[שם], מה הכינוי הכי דפוק שנתנו לך בבית ספר?', category: 'friends' },
      { question: '[שם], אם היית חייב/ת להתחתן עם מישהו מהשולחן – במי היית בוחר/ת?', category: 'friends' },
      { question: '[שם], מה הדבר הכי מגעיל שעשית בבית של חבר?', category: 'friends' },
      { question: '[שם], מי כאן הכי סביר שיהיה ראש הממשלה הבא?', category: 'friends' },
      { question: '[שם], אם היית צריך/ה לחלוק את החשבון בשווה עם 3 אנשים אחרים – מי היו?', category: 'friends' },
      { question: '[שם], מה הדבר הכי מבזה שאחד מהחברים יודע עליך?', category: 'friends' },
      { question: '[שם], מי מהקבוצה הכי סביר שיקלוט מסר זה בטעות לחברים שלו?', category: 'friends' },
      { question: '[שם], מה הדבר שאתה הכי צפוי להטביע בחברים?', category: 'friends' },
      { question: '[שם], אם כל אחד מכם היה צבע – איזה צבע היית?', category: 'friends' },

      // דייט רומנטי (date)
      { question: '[שם], מה הדבר הראשון ששמת לב אליו בחיצוניות של הפרטנר/ית?', category: 'date' },
      { question: '[שם], אם היית יכול/ה לשנות הרגל אחד של הפרטנר/ית – מה זה היה?', category: 'date' },
      { question: '[שם], מה הרגע שבו הבנת שאת/ה מאוהב/ת?', category: 'date' },
      { question: '[שם], מה הקנייה הכי מטופשת שעשיתם יחד?', category: 'date' },
      { question: '[שם], איפה את/ה רואה אתכם בעוד 5 שנים מהיום?', category: 'date' },
      { question: '[שם], מה השיר שאת/ה הכי אוהב/ת שהפרטנר/ית שר/ה (גם אם זה גרוע)?', category: 'date' },
      { question: '[שם], מה הדבר הכי "קיטשי" שעשית עבור הפרטנר/ית?', category: 'date' },
      { question: '[שם], מי לדעתך השפיע יותר על הטעם של השני באוכל?', category: 'date' },
      { question: '[שם], מה הפחד הכי גדול שלך בקשר הזה?', category: 'date' },
      { question: '[שם], אם הייתם צריכים לברוח לאי בודד, איזה חפץ אחד היית לוקח/ת עבור הפרטנר/ית?', category: 'date' },
      { question: '[שם], מה הדבר הראשון שאתה/ת עושה בבוקר כשהפרטנר/ית לא שם?', category: 'date' },
      { question: '[שם], אם היית חייב/ת לתאר את הקשר בשלוש מילים בלבד – מה הן?', category: 'date' },
      { question: '[שם], מה הסירוב הכי קשה שנתקלת בו?', category: 'date' },
      { question: '[שם], מי מכם שלשניים מבילה יותר כסף?', category: 'date' },
      { question: '[שם], מה הדבר שהפרטנר/ית עושה שמכעיס/ה אותך הכי הרבה?', category: 'date' },
      { question: '[שם], אם היית יכול/ה לשחזר רגע אחד מהקשר שלכם – איזה זה היה?', category: 'date' },
      { question: '[שם], מה המתנה הכי בלתי צפויה שקיבלת אי פעם?', category: 'date' },
      { question: '[שם], מי בקשר מת יותר מפחד ממה שחושב השני?', category: 'date' },
      { question: '[שם], אם היית צריך/ה להוריד אפליקציה אחת מהטלפון – מה זו הייתה?', category: 'date' },
      { question: '[שם], מה המצב הכי מביך שנתקלת בו עם הפרטנר/ית?', category: 'date' },

      // משפחה (family)
      { question: '[שם], מה הזיכרון הכי מוקדם שיש לך מארוחות שבת?', category: 'family' },
      { question: '[שם], מי מהמשפחה כאן הכי "דרמה קווין"?', category: 'family' },
      { question: '[שם], מה המנה שאמא/אבא מכינים שאף פעם לא נמאס לך ממנה?', category: 'family' },
      { question: '[שם], מה השקר הכי גדול שסיפרת להורים כשהיית נער/ה?', category: 'family' },
      { question: '[שם], מי כאן הכי דומה לסבא או לסבתא באופי?', category: 'family' },
      { question: '[שם], מה המסורת המשפחתית שאת/ה הכי אוהב/ת?', category: 'family' },
      { question: '[שם], אם היית צריך/ה לתאר את המשפחה שלנו בשלוש מילים – מה הן היו?', category: 'family' },
      { question: '[שם], מי כאן הולך להיות "הדוד המביך" בעתיד?', category: 'family' },
      { question: '[שם], מה הדבר הכי מצחיק שקרה לנו בטיול משפחתי בחו"ל?', category: 'family' },
      { question: '[שם], מה הערך הכי חשוב שקיבלת מהבית?', category: 'family' },
      { question: '[שם], מי בבית הכי חולק בדעות איתך?', category: 'family' },
      { question: '[שם], מה הדבר שהוריך עושים שהכי מעצבן אותך?', category: 'family' },
      { question: '[שם], אם היית צריך/ה להעביר סוד משפחתי בלבד – מה זה היה?', category: 'family' },
      { question: '[שם], מי בעיסקת בית הכי קרוב/ה אליך?', category: 'family' },
      { question: '[שם], מה הדבר הכי גנוב שעשית מהמקרר?', category: 'family' },
      { question: '[שם], אם היית בוחר/ת מחדש – היית בוחר/ת אחים/אחיות אחרים/אחרות?', category: 'family' },
      { question: '[שם], מה ההלוץ המשפחתי שאף אחד בדיוק לא רוצה להזכיר?', category: 'family' },
      { question: '[שם], מי בבית הכי דומה לך בסגנון הלבוש?', category: 'family' },
      { question: '[שם], מה הדבר השמורה שעד היום בעפ"י לא סיפרת להורים?', category: 'family' },
      { question: '[שם], אם היית צריך/ה לתאר את הבית שלך בניחוח – איזה ריח זה היה?', category: 'family' },

      // יום הולדת (bday)
      { question: '[שם], מה המתנה הכי גרועה שקיבלת אי פעם?', category: 'bday' },
      { question: '[שם], אם היית יכול/ה להזמין כל סלב בעולם למסיבה שלך – מי זה היה?', category: 'bday' },
      { question: '[שם], מה היעד שבו היית רוצה לחגוג את יום ההולדת הבא?', category: 'bday' },
      { question: '[שם], מה הדבר הכי "משוגע" שעשית ביום הולדת?', category: 'bday' },
      { question: '[שם], מה את/ה מאחל/ת לעצמך לשנה הקרובה?', category: 'bday' },
      { question: '[שם], מי מהנוכחים כאן יביא את המתנה הכי שווה?', category: 'bday' },
      { question: '[שם], מה הגיל שהכי נהנית בו עד עכשיו?', category: 'bday' },
      { question: '[שם], אם היית צריך/ה לבחור עוגה אחת לכל החיים – איזו זו הייתה?', category: 'bday' },
      { question: '[שם], מה הזיכרון הכי יפה שיש לך מיום הולדת בילדות?', category: 'bday' },
      { question: '[שם], אם היית יכול/ה לחזור לגיל אחד – איזה גיל היית בוחר/ת?', category: 'bday' },
      { question: '[שם], מה הדבר שתמיד חייב להיות בחגיגת יום ההולדת שלך?', category: 'bday' },
      { question: '[שם], מי האדם שהכי אתה/ת רוצה שיהיה שם ביום ההולדת שלך?', category: 'bday' },
      { question: '[שם], מה הדבר הכי נדיב שעשית עבור חברה/ו ביום הולדתם?', category: 'bday' },
      { question: '[שם], אם היית מאיר/ה בהשקעה על דבר אחד ביום ההולדת – מה זה?', category: 'bday' },
      { question: '[שם], מה הדבר הכי טוב שקיבלת למתנה בגיל 18?', category: 'bday' },
      { question: '[שם], אם תוכל/י להקדיש את יום ההולדת שלך לדבר אחד בלבד – מה זה היה?', category: 'bday' },
      { question: '[שם], מה הדבר שתמיד אתה/ת שוכח/ת לקנות בעת יום הולדת?', category: 'bday' },
      { question: '[שם], אם היית מקים קבוצת וואצ"ס – מה שם לה היה?', category: 'bday' },
      { question: '[שם], מה הנושא שאתה/ת הכי רוצה שיהיה בחגיגה?', category: 'bday' },
      { question: '[שם], מי מהקבוצה הכי סביר שיזכור את יום ההולדת שלך ללא אתה/ת חייב/ת להזכיר?', category: 'bday' },

      // ערב בנות (girls)
      { question: '[שם], מה הדבר הראשון שאת מסתכלת עליו בגבר?', category: 'girls' },
      { question: '[שם], מה המקום הכי מוזר שעשית בו סקס?', category: 'girls' },
      { question: '[שם], מה ה-Turn-off הכי גדול שלך?', category: 'girls' },
      { question: '[שם], מי מהבנות כאן הכי סביר שתחזור הביתה עם מישהו שהיא הכירה לפני דקה?', category: 'girls' },
      { question: '[שם], מה הפנטזיה שאתה/ת עדיין מקווה/ת להגשים?', category: 'girls' },
      { question: '[שם], איזה דבר "מעניין" יש לך שאף אחד לא יודע?', category: 'girls' },
      { question: '[שם], מה היה הטעות הכי גרועה/מצחיקה שלך בבחורה?', category: 'girls' },
      { question: '[שם], אם היית חייבת להתנשק עם אחת הבנות כאן – במי היית בוחרת?', category: 'girls' },
      { question: '[שם], מה הדבר הכי נועז ששלחת ב-DM?', category: 'girls' },
      { question: '[שם], מי כאן הכי "שובבה"?', category: 'girls' },
      { question: '[שם], מה הפרופיל שעדיין מעקיבה אחריו?', category: 'girls' },
      { question: '[שם], אם היית יכול/ה לשנות מושג אחד בחברה – מה זה היה?', category: 'girls' },
      { question: '[שם], מה הדבר שתמיד עושה לך יותר ביטחון?', category: 'girls' },
      { question: '[שם], מי מהנשים כאן אתה/ת הכי מחסנה?', category: 'girls' },
      { question: '[שם], אם היית צריך/ה לתאר את הסקס בשלוש מילים – מה?', category: 'girls' },
      { question: '[שם], מה הדבר שתמיד עושה לך למישהו אחר?', category: 'girls' },
      { question: '[שם], מה האפליקציה שאתה/ת משתמש/ת בה הכי הרבה?', category: 'girls' },
      { question: '[שם], מי מהחברות כאן תהיה הראשונה שתהיה מאשמת בחוק?', category: 'girls' },
      { question: '[שם], אם היית צריך/ה להעביר סוד אחד – מה זה היה?', category: 'girls' },
      { question: '[שם], מה המקום הכי אופר שחשבת עליו?', category: 'girls' },

      // פגישת עסקים (business)
      { question: '[שם], מה הייתה העבודה הראשונה שלך אי פעם?', category: 'business' },
      { question: '[שם], מה הטעות הכי גדולה שעשית בקריירה ומה למדת ממנה?', category: 'business' },
      { question: '[שם], מה היעד המקצועי הבא שאת/ה רוצה לכבוש?', category: 'business' },
      { question: '[שם], אם לא היית במקצוע הנוכחי – מה היית עושה?', category: 'business' },
      { question: '[שם], מה התכונה הכי חשובה לדעתך אצל שותף עסקי?', category: 'business' },
      { question: '[שם], מה הספר או הפודקאסט ששינה לך את הדרך שבה את/ה עובד/ת?', category: 'business' },
      { question: '[שם], איך את/ה משחרר/ת לחץ אחרי יום עבודה מטורף?', category: 'business' },
      { question: '[שם], מה העצה הכי טובה שקיבלת מהבוס הראשון שלך?', category: 'business' },
      { question: '[שם], אם היית יכול/ה להשקיע במיזם אחד של מישהו כאן – מי וכמה?', category: 'business' },
      { question: '[שם], מה המשקה שבלעדיו אי אפשר להתחיל את יום העבודה?', category: 'business' },
      { question: '[שם], מה הדבר הכי גרוע שעשה בוס?', category: 'business' },
      { question: '[שם], אם היית צריך/ה להחליף עבודה – למה היית עושה?', category: 'business' },
      { question: '[שם], מה ההנאה הכי גדולה שלך בעבודה?', category: 'business' },
      { question: '[שם], מי מהעובדים כאן הכי חכם מבחינת עסקים?', category: 'business' },
      { question: '[שם], מה הסיבה הכי אמיתית שלך לעבודה בתפקיד זה?', category: 'business' },
      { question: '[שם], אם היית בוחר/ת מחדש – היית קורא/ת אחר בקולג"ע?', category: 'business' },
      { question: '[שם], מה הדבר הכי משוגע שעשית בעבודה?', category: 'business' },
      { question: '[שם], מי המנהל שפחדת ממנו הכי הרבה?', category: 'business' },
      { question: '[שם], מה הדבר שאתה/ת הכי גאה בו בקריירה?', category: 'business' },
      { question: '[שם], אם היית בוחר/ת סטארטאפ – מה הייתה הרעיון?', category: 'business' },
    ];

    // בדוק אם השאלות כבר קיימות
    const existing = await base44.asServiceRole.entities.GameQuestion.list();
    const existingQuestions = new Set(existing.map(q => q.question));

    // הוסף רק שאלות חדשות
    const newQuestions = questions.filter(q => !existingQuestions.has(q.question));

    if (newQuestions.length === 0) {
      return Response.json({ message: 'All questions already exist', count: 0 });
    }

    // הוסף שאלות בחבילות של 50
    let created = 0;
    for (let i = 0; i < newQuestions.length; i += 50) {
      const batch = newQuestions.slice(i, i + 50);
      const withDefaults = batch.map(q => ({
        ...q,
        game_type: 'question_game',
        is_active: true,
      }));
      await base44.asServiceRole.entities.GameQuestion.bulkCreate(withDefaults);
      created += batch.length;
    }

    return Response.json({ message: 'Questions added successfully', count: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});