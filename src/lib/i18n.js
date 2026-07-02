import { useState, useEffect } from 'react';
import { useTenantBranding } from '@/hooks/useTenantBranding';

// Lightweight i18n for public-facing pages. No external deps; just nested
// objects + a t() helper + localStorage persistence.
//
// Supported: he (default, RTL), ar (RTL), en (LTR), ru (LTR).
// Chat-driven pages (job application, events) pass language to the LLM so it
// responds in the same language — no need to translate AI replies in code.

const STORAGE_KEY = 'topalena_lang';

export const SUPPORTED_LANGUAGES = [
  { code: 'he', label: 'עברית', flag: '🇮🇱', dir: 'rtl' },
  { code: 'en', label: 'English', flag: '🇬🇧', dir: 'ltr' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺', dir: 'ltr' },
];

export const LANG_NAMES_FOR_LLM = {
  he: 'Hebrew',
  en: 'English',
  ru: 'Russian',
};

const DICT = {
  // ─── Reservation ──────────────────────────────────────────────────
  reservation_title: {
    he: 'הזמנת מקום',
    ar: 'حجز طاولة',
    en: 'Book a Table',
    ru: 'Бронирование столика',
  },
  reservation_subtitle: {
    he: 'הזמנה למסעדת {brand}',
    ar: 'حجز في مطعم {brand}',
    en: 'Reservation at {brand} Restaurant',
    ru: 'Бронирование в ресторане {brand}',
  },
  customer_name: { he: 'שם מלא', ar: 'الاسم الكامل', en: 'Full Name', ru: 'Полное имя' },
  customer_phone: { he: 'טלפון', ar: 'الهاتف', en: 'Phone', ru: 'Телефон' },
  date_label: { he: 'תאריך', ar: 'التاريخ', en: 'Date', ru: 'Дата' },
  time_label: { he: 'שעה', ar: 'الساعة', en: 'Time', ru: 'Время' },
  party_size: { he: 'מספר סועדים', ar: 'عدد الأشخاص', en: 'Party Size', ru: 'Количество гостей' },
  special_occasion: { he: 'הזדמנות מיוחדת', ar: 'مناسبة خاصة', en: 'Special Occasion', ru: 'Особый случай' },
  special_requests: { he: 'בקשות מיוחדות', ar: 'طلبات خاصة', en: 'Special Requests', ru: 'Особые пожелания' },
  book_now: { he: 'הזמן עכשיו', ar: 'احجز الآن', en: 'Book Now', ru: 'Забронировать' },
  reservation_confirmed: {
    he: 'מצוין! ההזמנה נשמרה. נתראה בקרוב 🌿',
    ar: 'ممتاز! تم حفظ الحجز. نراكم قريباً 🌿',
    en: 'Great! Your reservation is confirmed. See you soon 🌿',
    ru: 'Отлично! Бронирование подтверждено. До скорой встречи 🌿',
  },

  // ─── Job Application ─────────────────────────────────────────────
  apply_title: {
    he: 'הצטרפו לצוות {brand}',
    ar: 'انضم إلى فريق {brand}',
    en: 'Join the {brand} Team',
    ru: 'Присоединяйтесь к команде {brand}',
  },
  apply_subtitle: {
    he: 'שיחה קצרה כדי לבדוק התאמה — 3-5 דקות',
    ar: 'محادثة قصيرة لفحص الملاءمة — 3-5 دقائق',
    en: 'A short chat to check fit — 3-5 minutes',
    ru: 'Короткая беседа для проверки соответствия — 3-5 минут',
  },
  type_message: {
    he: 'הקלד הודעה...',
    ar: 'اكتب رسالة...',
    en: 'Type a message...',
    ru: 'Введите сообщение...',
  },
  send: { he: 'שלח', ar: 'إرسال', en: 'Send', ru: 'Отправить' },
  thank_you_application: {
    he: 'תודה! בחר מועד לראיון:',
    ar: 'شكراً! اختر موعداً للمقابلة:',
    en: 'Thanks! Pick an interview slot:',
    ru: 'Спасибо! Выберите время собеседования:',
  },
  no_slots_available: {
    he: 'אין כרגע מועדים פנויים. נחזור אליך.',
    ar: 'لا توجد مواعيد متاحة حالياً. سنعود إليك.',
    en: 'No slots available right now. We\'ll get back to you.',
    ru: 'Сейчас нет свободных слотов. Мы свяжемся с вами.',
  },

  // ─── Events ──────────────────────────────────────────────────────
  events_title: {
    he: 'אירועים פרטיים ב{brand}',
    ar: 'فعاليات خاصة في {brand}',
    en: 'Private Events at {brand}',
    ru: 'Частные мероприятия в {brand}',
  },
  events_subtitle: {
    he: 'דנה, מנהלת האירועים, אוספת ממך פרטים — המנהל יחזור אליך אישית',
    ar: 'دانا، مديرة الفعاليات، تجمع منك التفاصيل — المدير سيعاود الاتصال شخصياً',
    en: 'Dana, our events manager, collects your details — the manager will get back personally',
    ru: 'Дана, менеджер мероприятий, соберёт детали — управляющий свяжется лично',
  },

  // ─── Queue ───────────────────────────────────────────────────────
  queue_title: {
    he: 'הצטרפו לתור',
    ar: 'انضم إلى قائمة الانتظار',
    en: 'Join the Queue',
    ru: 'Встать в очередь',
  },
  queue_subtitle: {
    he: 'אנחנו נשלח לך הודעה כשהשולחן מוכן',
    ar: 'سنرسل لك رسالة عندما تكون الطاولة جاهزة',
    en: 'We\'ll text you when your table is ready',
    ru: 'Мы напишем вам, когда столик будет готов',
  },
  join_queue: { he: 'הצטרף לתור', ar: 'انضم', en: 'Join Queue', ru: 'Встать в очередь' },

  // ─── Customer Survey ────────────────────────────────────────────
  survey_title: {
    he: 'איך הייתה החוויה?',
    ar: 'كيف كانت تجربتك؟',
    en: 'How was your experience?',
    ru: 'Как прошёл ваш визит?',
  },
  survey_subtitle: {
    he: 'דירוג של דקה יעזור לנו להשתפר',
    ar: 'تقييم سريع يساعدنا على التحسن',
    en: 'A one-minute rating helps us improve',
    ru: 'Минутная оценка помогает нам становиться лучше',
  },
  rating_overall: { he: 'דירוג כללי', ar: 'التقييم العام', en: 'Overall Rating', ru: 'Общая оценка' },
  rating_food: { he: 'אוכל', ar: 'الطعام', en: 'Food', ru: 'Еда' },
  rating_service: { he: 'שירות', ar: 'الخدمة', en: 'Service', ru: 'Сервис' },
  comments: { he: 'הערות (אופציונלי)', ar: 'ملاحظات (اختياري)', en: 'Comments (optional)', ru: 'Комментарии (необязательно)' },
  submit: { he: 'שלח', ar: 'إرسال', en: 'Submit', ru: 'Отправить' },
  thanks_for_feedback: {
    he: 'תודה על המשוב 🙏',
    ar: 'شكراً على ملاحظاتك 🙏',
    en: 'Thanks for your feedback 🙏',
    ru: 'Спасибо за отзыв 🙏',
  },

  // ─── Common ──────────────────────────────────────────────────────
  loading: { he: 'טוען...', ar: 'جاري التحميل...', en: 'Loading...', ru: 'Загрузка...' },
  error_generic: {
    he: 'אירעה תקלה. נסה/י שוב.',
    ar: 'حدث خطأ. حاول مرة أخرى.',
    en: 'Something went wrong. Please try again.',
    ru: 'Произошла ошибка. Попробуйте снова.',
  },
};

// Try in this order: ?lang= → localStorage → browser → he
function detectLanguage() {
  if (typeof window === 'undefined') return 'he';
  try {
    const p = new URLSearchParams(window.location.search);
    const fromUrl = p.get('lang');
    if (fromUrl && SUPPORTED_LANGUAGES.find((l) => l.code === fromUrl)) {
      localStorage.setItem(STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    const fromStorage = localStorage.getItem(STORAGE_KEY);
    if (fromStorage && SUPPORTED_LANGUAGES.find((l) => l.code === fromStorage)) return fromStorage;
    const browser = (navigator.language || 'he').slice(0, 2).toLowerCase();
    if (SUPPORTED_LANGUAGES.find((l) => l.code === browser)) return browser;
  } catch { /* ignore */ }
  return 'he';
}

export function getCurrentLanguage() {
  return detectLanguage();
}

export function setLanguage(code) {
  if (typeof window === 'undefined') return;
  if (!SUPPORTED_LANGUAGES.find((l) => l.code === code)) return;
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
  // Update document direction
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  if (lang) {
    document.documentElement.lang = code;
    document.documentElement.dir = lang.dir;
  }
}

// Bound to a specific language. Returns the translation, or the Hebrew
// fallback if missing, or the key itself as a last resort.
export function makeT(lang) {
  return (key, vars = {}) => {
    const entry = DICT[key];
    let txt = entry?.[lang] || entry?.he || key;
    for (const [k, v] of Object.entries(vars)) {
      txt = txt.replaceAll(`{${k}}`, String(v));
    }
    return txt;
  };
}

// React hook — returns [t, lang, setLang]. Subscribes to changes via a
// custom event so all components re-render together.
export function useI18n() {
  const [lang, setLangState] = useState(detectLanguage);
  const branding = useTenantBranding();
  const brand = branding?.name || 'המסעדה';
  useEffect(() => {
    setLanguage(lang);
    const handler = () => setLangState(detectLanguage());
    window.addEventListener('topalena_lang_change', handler);
    return () => window.removeEventListener('topalena_lang_change', handler);
  }, [lang]);
  const change = (code) => {
    setLanguage(code);
    setLangState(code);
    window.dispatchEvent(new Event('topalena_lang_change'));
  };
  // Wrap makeT so every t() call auto-injects {brand} — callers still can
  // override with an explicit vars object.
  const baseT = makeT(lang);
  const t = (key, vars = {}) => baseT(key, { brand, ...vars });
  return [t, lang, change];
}
