// Slot-filling config — when a voice command lands with required params
// missing, the assistant ASKS for each one (in Hebrew), waits for the answer,
// parses it, merges back. Designed for natural conversation:
//   user: "תכניס הזמנה למחר על שם משה לארבע אנשים"
//   bot: "באיזו שעה?"   user: "תשע בערב"     → time: "21:00"
//   bot: "מה הטלפון של משה?"   user: "050 12 34 567" → phone: "0501234567"
//   bot: "בפנים או בחוץ?"   user: "בחוץ"        → pref: "outside"
//   bot: "בוצע ✓ הזמנה ל-משה ב-21:00 נוצרה"

// Slot definitions per intent. {name} is interpolated from cmd.name when asking.
export const INTENT_SLOTS = {
    reservation_add: [
        { key: 'name', prompt: 'על שם מי ההזמנה?' },
        { key: 'party_size', prompt: 'כמה אנשים?', type: 'number' },
        { key: 'when', prompt: 'מתי? היום, מחר, או יום אחר?', type: 'when' },
        { key: 'time', prompt: 'באיזו שעה?', type: 'time' },
        { key: 'phone', prompt: 'מה הטלפון של {name}?', type: 'phone' },
        { key: 'pref', prompt: 'הם רוצים לשבת בפנים, בחוץ, או לא משנה?', type: 'pref' },
    ],
    queue_add: [
        { key: 'name', prompt: 'איך קוראים ללקוח?' },
        { key: 'party_size', prompt: 'כמה אנשים?', type: 'number' },
        { key: 'pref', prompt: 'בפנים או בחוץ?', type: 'pref' },
    ],
    event_add: [
        { key: 'name', prompt: 'על שם מי האירוע?' },
        { key: 'date', prompt: 'באיזה תאריך?', type: 'date' },
        { key: 'guest_count', prompt: 'כמה סועדים?', type: 'number' },
        { key: 'phone', prompt: 'מה הטלפון של {name}?', type: 'phone' },
    ],
    customer_add: [
        { key: 'name', prompt: 'איך קוראים ללקוח?' },
        { key: 'phone', prompt: 'מה הטלפון של {name}?', type: 'phone' },
    ],
    customer_update_phone: [
        { key: 'name', prompt: 'של מי לעדכן את הטלפון?' },
        { key: 'phone', prompt: 'מה הטלפון החדש?', type: 'phone' },
    ],
    schedule_set_end_time: [
        { key: 'name', prompt: 'של מי לסדר יציאה?' },
        { key: 'time', prompt: 'באיזו שעה הוא יוצא?', type: 'time' },
    ],
    schedule_set_start_time: [
        { key: 'name', prompt: 'של מי לסדר כניסה?' },
        { key: 'time', prompt: 'באיזו שעה הוא נכנס?', type: 'time' },
    ],
    schedule_change_position: [
        { key: 'name', prompt: 'של מי להחליף תפקיד?' },
        { key: 'position', prompt: 'איזה תפקיד? מלצר, ברמן, מארחת, טבח?' },
    ],
    tips_set_total: [
        { key: 'amount', prompt: 'מה סכום הטיפים הכולל?', type: 'number' },
    ],
    tips_add_employee: [
        { key: 'name', prompt: 'את מי להוסיף לדוח הטיפים?' },
        { key: 'hours', prompt: 'כמה שעות הוא עבד?', type: 'number' },
    ],
    pay_bonus: [
        { key: 'name', prompt: 'למי לתת בונוס?' },
        { key: 'amount', prompt: 'כמה לתת?', type: 'number' },
    ],
    coins_give: [
        { key: 'name', prompt: 'למי לתת מטבעות?' },
        { key: 'amount', prompt: 'כמה מטבעות?', type: 'number' },
    ],
    send_team_message: [
        { key: 'message', prompt: 'מה להגיד לצוות?' },
    ],
    send_customer_message: [
        { key: 'name', prompt: 'לאיזה לקוח לשלוח?' },
        { key: 'message', prompt: 'מה ההודעה?' },
    ],
    delivery_assign_courier: [
        { key: 'name', prompt: 'משלוח של איזה לקוח?' },
        { key: 'courier', prompt: 'איזה שליח לוקח?' },
    ],
    inventory_set: [
        { key: 'item', prompt: 'איזה פריט?' },
        { key: 'quantity', prompt: 'מה הכמות החדשה?', type: 'number' },
    ],
    inventory_add: [
        { key: 'item', prompt: 'איזה פריט להוסיף?' },
        { key: 'quantity', prompt: 'כמה?', type: 'number' },
    ],
    inventory_remove: [
        { key: 'item', prompt: 'איזה פריט להוריד?' },
        { key: 'quantity', prompt: 'כמה להוריד?', type: 'number' },
    ],
    event_payment_received: [
        { key: 'name', prompt: 'מאיזה אירוע התקבל תשלום?' },
        { key: 'amount', prompt: 'כמה התקבל?', type: 'number' },
    ],
    event_update_guests: [
        { key: 'name', prompt: 'אירוע של מי?' },
        { key: 'guest_count', prompt: 'כמה סועדים?', type: 'number' },
    ],
    invoice_create: [
        { key: 'supplier', prompt: 'מאיזה ספק?' },
        { key: 'amount', prompt: 'מה סכום החשבונית?', type: 'number' },
    ],
    incident_open: [
        { key: 'description', prompt: 'מה התקרית? תאר במשפט.' },
    ],
    staff_meeting: [
        { key: 'time', prompt: 'מתי הפגישה?' },
        { key: 'message', prompt: 'מה הנושא?' },
    ],
};

// === Hebrew number words ===
const HE_NUMBERS = {
    'אפס': 0, 'אחד': 1, 'אחת': 1, 'שניים': 2, 'שתיים': 2, 'שני': 2, 'שתי': 2,
    'שלוש': 3, 'שלושה': 3, 'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5,
    'שש': 6, 'שישה': 6, 'שבע': 7, 'שבעה': 7, 'שמונה': 8, 'תשע': 9, 'תשעה': 9,
    'עשר': 10, 'עשרה': 10, 'אחת עשרה': 11, 'אחד עשר': 11,
    'שתים עשרה': 12, 'שניים עשר': 12, 'שלוש עשרה': 13, 'שלושה עשר': 13,
    'ארבע עשרה': 14, 'ארבעה עשר': 14, 'חמש עשרה': 15, 'חמישה עשר': 15,
    'שש עשרה': 16, 'שישה עשר': 16, 'שבע עשרה': 17, 'שבעה עשר': 17,
    'שמונה עשרה': 18, 'תשע עשרה': 19, 'תשעה עשר': 19, 'עשרים': 20,
    'שלושים': 30, 'ארבעים': 40, 'חמישים': 50, 'שישים': 60, 'שבעים': 70,
    'שמונים': 80, 'תשעים': 90, 'מאה': 100, 'מאתיים': 200, 'אלף': 1000,
};

function parseHebrewNumber(txt) {
    txt = String(txt || '').trim();
    const m = txt.match(/-?\d+/);
    if (m) return Number(m[0]);
    // Match longest first
    const sorted = Object.keys(HE_NUMBERS).sort((a, b) => b.length - a.length);
    let total = 0, matched = false;
    for (const word of sorted) {
        if (txt.includes(word)) { total += HE_NUMBERS[word]; matched = true; txt = txt.replace(word, ''); }
    }
    return matched ? total : null;
}

function parseTime(txt) {
    txt = String(txt || '').trim();
    // 21:30 / 21.30
    let m = txt.match(/(\d{1,2})[:.,](\d{2})/);
    if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
    // Bare hour or "9 בערב"
    const eveningTerms = ['בערב', 'בלילה', 'אחר הצהריים', 'אחה"צ'];
    const morningTerms = ['בבוקר', 'בצהריים', 'בצוהריים'];
    const isEvening = eveningTerms.some(t => txt.includes(t));
    const halfPast = /וחצי|חצי/.test(txt);
    const quarterPast = /ורבע|רבע/.test(txt) && !/רבע ל/.test(txt);
    const quarterTo = /רבע ל/.test(txt);
    // Extract a number (digits or Hebrew word)
    let hour = null;
    const numM = txt.match(/\d{1,2}/);
    if (numM) hour = Number(numM[0]);
    else hour = parseHebrewNumber(txt);
    if (hour === null) return null;
    if (isEvening && hour < 12) hour += 12;
    if (hour === 24) hour = 0;
    if (hour > 23) hour = hour % 24;
    let minutes = halfPast ? 30 : quarterPast ? 15 : 0;
    if (quarterTo) { hour = (hour - 1 + 24) % 24; minutes = 45; }
    return `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parsePhone(txt) {
    txt = String(txt || '').trim();
    // Direct digits
    let digits = txt.replace(/[^\d]/g, '');
    if (digits.length >= 7) return digits;
    // Hebrew digit words spoken one-by-one ("אפס חמש אפס...")
    const DIGIT_WORDS = {
        'אפס': '0', 'אחת': '1', 'אחד': '1', 'שתיים': '2', 'שניים': '2',
        'שלוש': '3', 'שלושה': '3', 'ארבע': '4', 'ארבעה': '4',
        'חמש': '5', 'חמישה': '5', 'שש': '6', 'שישה': '6',
        'שבע': '7', 'שבעה': '7', 'שמונה': '8', 'תשע': '9', 'תשעה': '9',
    };
    let collected = '';
    for (const part of txt.split(/\s+/)) {
        const w = DIGIT_WORDS[part];
        if (w) collected += w;
        else {
            const d = part.replace(/[^\d]/g, '');
            if (d) collected += d;
        }
    }
    return collected.length >= 7 ? collected : null;
}

function parsePref(txt) {
    txt = String(txt || '').trim();
    if (/בחוץ|חוץ|outside|מחוץ|גינה|חצר/i.test(txt)) return 'outside';
    if (/בפנים|פנימה|פנים|inside|פנימי/i.test(txt)) return 'inside';
    if (/לא משנה|לא חשוב|אין הבדל|לא אכפת|הכל/i.test(txt)) return 'no_preference';
    return null;
}

function parseWhen(txt) {
    txt = String(txt || '').trim();
    if (/מחרתיים|ביומיים/.test(txt)) return 'מחרתיים';
    if (/מחר/.test(txt)) return 'מחר';
    if (/היום|הערב|עכשיו|כרגע/.test(txt)) return 'היום';
    const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    for (const d of days) if (txt.includes(d)) return d;
    // dd/mm
    const m = txt.match(/(\d{1,2})\/(\d{1,2})/);
    if (m) return `${m[1]}/${m[2]}`;
    return txt || null;
}

function parseDate(txt) {
    txt = String(txt || '').trim();
    const m = txt.match(/(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/);
    if (m) return `${m[1]}/${m[2]}`;
    return parseWhen(txt);
}

// Cancel detection — user said "ביטול" / "עזוב" / "שכח מזה"
export function isCancelAnswer(txt) {
    return /^(ביטול|עזוב|שכח מזה|לא משנה כבר|בטל|תפסיק)/.test(String(txt || '').trim());
}

export function parseSlotAnswer(slot, txt) {
    if (!txt || !String(txt).trim()) return null;
    const t = String(txt).trim();
    switch (slot.type) {
        case 'number': return parseHebrewNumber(t);
        case 'time': return parseTime(t);
        case 'phone': return parsePhone(t);
        case 'pref': return parsePref(t);
        case 'when': return parseWhen(t);
        case 'date': return parseDate(t);
        default: return t;
    }
}

// Returns first missing slot in intent's slot list, or null if all filled.
export function findNextMissingSlot(cmd) {
    const slots = INTENT_SLOTS[cmd?.intent];
    if (!slots) return null;
    for (const slot of slots) {
        const v = cmd[slot.key];
        const empty = v === undefined || v === null || v === '' ||
            (slot.type === 'number' && (v === 0 || isNaN(v))) ||
            (Array.isArray(v) && v.length === 0);
        if (empty) return slot;
    }
    return null;
}

// Interpolate {name} / {item} placeholders in the prompt using cmd values.
export function buildPrompt(slot, cmd) {
    return String(slot.prompt || '').replace(/\{(\w+)\}/g, (_, k) => cmd?.[k] || '');
}
