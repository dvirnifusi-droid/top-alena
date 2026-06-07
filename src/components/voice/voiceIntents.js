// Shared voice-intent module. Used by both VoiceControl (live mic) and
// VoiceTest (text harness) so the matching logic lives in one place.

const HEB_NUMBERS = {
    'אפס': 0, 'אחד': 1, 'אחת': 1, 'שניים': 2, 'שתיים': 2, 'שני': 2, 'שלוש': 3, 'שלושה': 3,
    'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5, 'שש': 6, 'שישה': 6, 'שבע': 7, 'שבעה': 7,
    'שמונה': 8, 'תשע': 9, 'תשעה': 9, 'עשר': 10, 'עשרה': 10,
    'עשרים': 20, 'שלושים': 30, 'ארבעים': 40, 'חמישים': 50, 'שישים': 60, 'שבעים': 70,
    'שמונים': 80, 'תשעים': 90, 'מאה': 100, 'מאתיים': 200,
};

export function cleanForMatch(text) {
    return String(text || '').replace(/[?!.,،؟]/g, '').replace(/\s+/g, ' ').trim();
}

export function normalizeHebrewNumbers(text) {
    let out = text;
    const entries = Object.entries(HEB_NUMBERS).sort((a, b) => b[0].length - a[0].length);
    for (const [word, digit] of entries) {
        out = out.replace(new RegExp(`(^|\\s)${word}(\\s|$)`, 'g'), `$1${digit}$2`);
    }
    // Hebrew time-of-day → 24h conversion.
    // '9 בערב' → '21:00', '11 בבוקר' → '11:00', '8 בלילה' → '20:00'.
    // Done BEFORE the matchers run so 'בשעה 9 בערב' looks the same as 'ב-21:00'.
    out = out.replace(/(\d{1,2})(?::(\d{2}))?\s+(בערב|בלילה)/g, (_, h, m) => {
        const hour = parseInt(h, 10);
        const adj = hour < 12 ? hour + 12 : hour;
        return `${String(adj).padStart(2, '0')}:${m || '00'}`;
    });
    out = out.replace(/(\d{1,2})(?::(\d{2}))?\s+(בבוקר|בצהריים)/g, (_, h, m) => {
        const hour = parseInt(h, 10);
        return `${String(hour === 12 && /בבוקר/.test(_) ? 0 : hour).padStart(2, '0')}:${m || '00'}`;
    });
    return out;
}

// === Pattern catalog ========================================================
// Order matters: most specific first. Each pattern is RE-tested against
// the cleaned + number-normalized transcript.
export const MATCHERS = [
    // ========== Q&A (questions — read out) ==========
    { re: /(מי|מיהו|מיהי)\s+(הבא|הבאה)\s+(בתור|לתור)/, intent: 'q_next_in_queue' },
    { re: /^(מי|מיהו|מיהי)\s+הבא/, intent: 'q_next_in_queue' },
    { re: /(מי|מיהי)\s+ההזמנה\s+הבאה/, intent: 'q_next_reservation' },
    { re: /ההזמנה\s+הבאה/, intent: 'q_next_reservation' },
    { re: /כמה\s+(אנשים|חבורות|לקוחות)?\s*(יש)?\s*בתור/, intent: 'q_queue_count' },
    { re: /^בתור\s+(יש)?/, intent: 'q_queue_count' },
    { re: /כמה\s+(מקומות|שולחנות)\s+פנויים/, intent: 'q_free_tables' },
    { re: /(מי|מיהו)\s+(על|יושב\s+על|נמצא\s+על)\s+שולחן\s+(\d+)/, intent: 'q_who_on_table', extract: m => ({ table: m[3] }) },
    { re: /כמה\s+הזמנות\s+(היום|הערב)/, intent: 'q_today_reservations' },
    { re: /כמה\s+הזמנות\s+מחר/, intent: 'q_tomorrow_reservations' },
    { re: /כמה\s+(אורחים|סועדים)\s+(היום|הערב)/, intent: 'q_today_guests' },
    { re: /כמה\s+הכנסה\s+(היום|הערב)/, intent: 'q_today_revenue' },
    { re: /מה\s+(המצב|הסטטוס)/, intent: 'q_status_summary' },
    { re: /מי\s+במשמרת/, intent: 'q_on_shift' },

    // ========== Seating ==========
    // Walk-in (no reservation) — must come before "תושיב את [name]"
    { re: /^תושיב(י)?\s+(walk-in|וווק[\s-]*אין|לקוח[\s-]*חדש)\s+(\d+)\s+על\s+(?:שולחן\s+)?(\d+)/, intent: 'seat_walkin', extract: m => ({ party_size: Number(m[3]), table: m[4] }) },
    { re: /^תושיב(י)?\s+(\d+)\s+(?:אנשים\s+)?על\s+(?:שולחן\s+)?(\d+)$/, intent: 'seat_walkin', extract: m => ({ party_size: Number(m[2]), table: m[3] }) },
    // Reservation seat (multi)
    { re: /^תושיב(י)?\s+את\s+(.+?)\s+על\s+(?:שולחן\s+)?(\d+)\s+ו(?:על\s+)?(\d+)/, intent: 'seat_reservation_multi', extract: m => ({ name: m[2].trim(), tables: [m[3], m[4]] }) },
    { re: /^תושיב(י)?\s+את\s+(.+?)\s+על\s+(?:שולחן\s+)?(\d+)/, intent: 'seat_reservation', extract: m => ({ name: m[2].trim(), table: m[3] }) },
    { re: /^תקבל(י)?\s+את\s+הבא\s+(?:בתור\s+)?על\s+(?:שולחן\s+)?(\d+)/, intent: 'seat_next_queue', extract: m => ({ table: m[2] }) },

    // ========== Reservation management ==========
    // Extractor helper for the catch-all: walks the cleaned text and pulls
    // out the components regardless of order.
    // {{insert later}} — handled inline below.
    // 1. Original ordering: תוסיף הזמנה ל-NAME N (אנשים) ל-TIME [WHEN]
    { re: /^תוסיף(י)?\s+הזמנה\s+ל(?!היום|מחר)(\S+?)\s+(\d+)\s+(?:אנשים\s+)?(?:ל|ב)?(\d{1,2}[:.]?\d{0,2})(?:\s+(היום|מחר|מחרתיים))?/,
        intent: 'reservation_add', extract: m => ({
            name: m[2].trim(), party_size: Number(m[3]),
            time: m[4].replace('.', ':').padEnd(5, '0'),
            when: m[5] || 'היום',
        }) },
    // 2. Catch-all (most flexible): captures any order of name/party/time/when
    //    Example: 'תוסיף הזמנה להיום בשעה 21:00 על שם רן ל8 אנשים'
    {
        re: /^תוסיף(?:י)?\s+הזמנה\b.*/, intent: 'reservation_add', extract: m => {
            const txt = m[0];
            // When: היום / מחר / מחרתיים
            const whenMatch = txt.match(/(?:^|\s)(היום|מחר|מחרתיים)(?:\s|$)/);
            const when = whenMatch?.[1] || 'היום';
            // Time: HH:MM (already normalized from בערב/בבוקר). Fallback: bare hour.
            const timeMatch = txt.match(/(\d{1,2}):(\d{2})/) || txt.match(/(?:בשעה|ב-?)\s*(\d{1,2})(?![:.\d])/);
            const time = timeMatch
                ? (timeMatch[2]
                    ? `${String(timeMatch[1]).padStart(2,'0')}:${timeMatch[2]}`
                    : `${String(timeMatch[1]).padStart(2,'0')}:00`)
                : '20:00';
            // Name: after 'על שם' or 'בשם' or 'של'
            const nameMatch = txt.match(/(?:על\s+שם|בשם|של)\s+([א-ת][א-ת\s]+?)(?:\s+ל\d|$|\s+בשעה|\s+ב-?\d)/);
            const name = nameMatch?.[1]?.trim() || 'לקוח';
            // Party: 'N אנשים' or 'לN אנשים' or 'לN'
            const partyMatch = txt.match(/(?:^|\s)ל?(\d+)\s+(?:אנשים|סועדים|איש)/) || txt.match(/(?:^|\s)ל(\d+)(?:\s|$)/);
            const party_size = partyMatch ? Number(partyMatch[1]) : 2;
            return { name, party_size, time, when };
        },
    },
    { re: /^(בטל|תבטל[יה]?)\s+(?:את\s+)?(?:ההזמנה\s+של\s+)?(.+)$/, intent: 'reservation_cancel', extract: m => ({ name: m[2].trim() }) },
    { re: /^תאשר(י)?\s+(?:את\s+)?(?:ההזמנה\s+של\s+)?(.+)$/, intent: 'reservation_confirm', extract: m => ({ name: m[2].trim() }) },
    // Reschedule (change time) of an existing reservation.
    // Examples: "תדחה את ההזמנה של רן ל21:30", "ההזמנה של רן ליום שני מאחרים לשעה 9:30 בערב"
    { re: /(?:תדחה|דחה|תזיז|העבר\s+שעה\s+של|מאחרים\s+(?:את\s+)?(?:ה?הזמנה\s+של\s+)?)(.+?)\s+(?:ל-?|לשעה\s+)?(\d{1,2}:\d{2})/, intent: 'reservation_reschedule', extract: m => ({ name: m[1].replace(/^(את\s+ההזמנה\s+של\s+|ההזמנה\s+של\s+)/, '').trim(), time: m[2] }) },
    // Update phone number of an existing reservation.
    // Examples: "תעדכן את הטלפון של רן ל-0501234567"
    { re: /(?:תעדכן|עדכן|שנה)\s+(?:את\s+)?(?:ה)?(?:מספר\s+)?טלפון\s+(?:בהזמנה\s+של\s+|של\s+|ל)?(.+?)\s+(?:ל-?|למספר\s+)([\d\-]{7,})/, intent: 'reservation_update_phone', extract: m => ({ name: m[1].trim(), phone: m[2].replace(/-/g, '') }) },
    // Mark reservation as arrived/seated by NAME (not by table number).
    // Examples: "תעשה שהזמנה של עדיה הגיעה", "ההזמנה של רן הגיעה"
    { re: /(?:תעשה\s+שה?הזמנה\s+(?:של\s+|על\s+שם\s+)?|הזמנה\s+(?:של\s+|על\s+שם\s+))(.+?)\s+(הגיע|הגיעה|הגיעו|בא|באה|באו)$/, intent: 'reservation_mark_arrived', extract: m => ({ name: m[1].trim() }) },
    // Move existing reservation to a different table (verb תעביר instead of תושיב).
    // Examples: "תעביר את ההזמנה של דביר לשולחן 8"
    { re: /^(תעביר|העבר)\s+(?:את\s+)?(?:ה)?הזמנה\s+(?:של\s+|על\s+שם\s+)(.+?)\s+ל(?:שולחן\s+)?(\d+)/, intent: 'seat_reservation', extract: m => ({ name: m[2].trim(), table: m[3] }) },
    // Move MULTI-table session: "תעביר את שולחנות 70 ו 71 לשולחן 8"
    { re: /^(תעביר|העבר)\s+(?:את\s+)?שולחנות\s+(\d+)\s+ו-?\s*(\d+)\s+ל(?:שולחן\s+)?(\d+)/, intent: 'session_move_multi', extract: m => ({ from_tables: [m[2], m[3]], to: m[4] }) },
    // AI seat suggestion ("ask the AI assistant to find a spot for X people now")
    { re: /(?:תמצא\s+לי|מצא\s+לי|איפה\s+אפשר\s+להושיב)\s+(?:בעזרת\s+(?:ה?עוזר|AI|בינה)\s+)?(?:מקום\s+)?(?:ל)?(\d+)\s+(?:אנשים|סועדים|איש)?\s*(?:עכשיו|מיד|לעכשיו)?/, intent: 'q_ai_seat_suggest', extract: m => ({ party_size: Number(m[1]) }) },

    // ========== Session extensions ==========
    { re: /שולחן\s+(\d+)\s+עוד\s+(\d+)\s+דק/, intent: 'session_extend', extract: m => ({ table: m[1], minutes: Number(m[2]) }) },
    { re: /שולחן\s+(\d+)\s+עוד\s+שעה/, intent: 'session_extend', extract: m => ({ table: m[1], minutes: 60 }) },
    { re: /שולחן\s+(\d+)\s+עוד\s+חצי\s+שעה/, intent: 'session_extend', extract: m => ({ table: m[1], minutes: 30 }) },

    // ========== Move table ==========
    { re: /(העבר|תעבר[יה]?)\s+(?:את\s+)?שולחן\s+(\d+)\s+ל(?:שולחן\s+)?(\d+)/, intent: 'session_move', extract: m => ({ from: m[2], to: m[3] }) },

    // ========== Queue ==========
    // 1. With explicit preference + "על שם": תוסיף [לתור] N חוץ/פנים על שם X
    { re: /^תוסיף(י)?\s+(?:לתור\s+)?(\d+)\s+(?:אנשים\s+)?(?:לתור\s+)?(חוץ|פנים)\s+על\s+שם\s+(.+)$/, intent: 'queue_add', extract: m => ({ party_size: Number(m[2]), pref: m[3] === 'חוץ' ? 'outside' : 'inside', name: m[4].trim() }) },
    // 2. Number THEN לתור: תוסיף N (אנשים) לתור על שם X
    { re: /^תוסיף(י)?\s+(\d+)\s+(?:אנשים\s+)?לתור\s+על\s+שם\s+(.+)$/, intent: 'queue_add', extract: m => ({ party_size: Number(m[2]), pref: 'no_preference', name: m[3].trim() }) },
    // 3. לתור THEN number: תוסיף לתור N (אנשים) על שם X
    { re: /^תוסיף(י)?\s+לתור\s+(\d+)\s+(?:אנשים\s+)?על\s+שם\s+(.+)$/, intent: 'queue_add', extract: m => ({ party_size: Number(m[2]), pref: 'no_preference', name: m[3].trim() }) },
    // 4. Name first variant: תוסיף לתור את X N (אנשים)
    { re: /^תוסיף(י)?\s+לתור\s+את\s+(.+?)\s+(\d+)\s+(?:אנשים)?/, intent: 'queue_add', extract: m => ({ name: m[2].trim(), party_size: Number(m[3]), pref: 'no_preference' }) },
    // 5. Very-flexible catch-all — captures any phrasing with תוסיף + N + לתור + name
    { re: /תוסיף(?:י)?.*?(\d+).*?לתור.*?(?:על\s+שם\s+|של\s+|בשם\s+)?([א-ת][א-ת\s]+)$/, intent: 'queue_add', extract: m => ({ party_size: Number(m[1]), pref: 'no_preference', name: m[2].trim() }) },
    { re: /^תקרא(י)?\s+ל(.+)$/, intent: 'queue_call', extract: m => ({ name: m[2].trim() }) },
    { re: /^(.+?)\s+(בא|הגיע|הגיעה)$/, intent: 'queue_arrived', extract: m => ({ name: m[1].trim() }) },
    { re: /^(.+?)\s+(עזב|עזבה|נטוש|נטושה)$/, intent: 'queue_abandoned', extract: m => ({ name: m[1].trim() }) },

    // ========== Table status ==========
    { re: /שולחן\s+(\d+)\s+(פנוי|התפנה|פנויה|נגמר|סיים|סיימו|נסגר)/, intent: 'table_free', extract: m => ({ table: m[1] }) },
    { re: /^תפנה\s+(?:את\s+)?שולחן\s+(\d+)/, intent: 'table_free', extract: m => ({ table: m[1] }) },
    { re: /שולחן\s+(\d+)\s+(קינוח|חשבון|סיום\s+קרוב|כמעט\s+סיימו)/, intent: 'table_finishing', extract: m => ({ table: m[1] }) },
    { re: /שולחן\s+(\d+)\s+(יושב|יושבים|התיישבו|התיישב)/, intent: 'table_seated', extract: m => ({ table: m[1] }) },
    { re: /שולחן\s+(\d+)\s+(הבריז|הבריזו|לא\s+הגיע|לא\s+הגיעו)/, intent: 'table_no_show', extract: m => ({ table: m[1] }) },

    // ========== Flags ==========
    { re: /שולחן\s+(\d+)\s+(ירוק|VIP|וי\s*איי\s*פי|חשוב)/, intent: 'table_flag', extract: m => ({ table: m[1], flag: 'green' }) },
    { re: /שולחן\s+(\d+)\s+(אדום|בעיה|בעיתי)/, intent: 'table_flag', extract: m => ({ table: m[1], flag: 'red' }) },
    { re: /שולחן\s+(\d+)\s+(כתום|לתת\s+תשומת\s+לב)/, intent: 'table_flag', extract: m => ({ table: m[1], flag: 'orange' }) },
    { re: /שולחן\s+(\d+)\s+שחור/, intent: 'table_flag', extract: m => ({ table: m[1], flag: 'black' }) },
    { re: /שולחן\s+(\d+)\s+(ללא\s+דגל|בלי\s+דגל|נקה\s+דגל)/, intent: 'table_flag', extract: m => ({ table: m[1], flag: '' }) },

    // ========== Communication ==========
    { re: /^תשלח(י)?\s+ל(.+?)\s+אישור/, intent: 'resend_confirmation', extract: m => ({ name: m[2].trim() }) },
    { re: /^תזכיר(י)?\s+ל(.+)$/, intent: 'send_reminder', extract: m => ({ name: m[2].trim() }) },

    // ========== Navigation ==========
    { re: /^תפתח(י)?\s+(?:את\s+)?(?:ה|העמוד\s+ה)?הגדרות\s+(פיקדון|הזמנות|מסעדה)/, intent: 'nav_open', extract: m => ({ target: 'settings_' + (m[2] === 'פיקדון' ? 'deposit' : m[2] === 'הזמנות' ? 'reservation' : 'general') }) },
    { re: /^תפתח(י)?\s+(?:את\s+)?(?:ה)?(סידור\s+עבודה|לוח\s+משמרות)/, intent: 'nav_open', extract: m => ({ target: 'work_scheduling' }) },
    { re: /^תפתח(י)?\s+(?:את\s+)?(?:ה)?דאשבורד/, intent: 'nav_open', extract: m => ({ target: 'dashboard' }) },
    { re: /^תפתח(י)?\s+(?:את\s+)?(?:ה)?(מפה|הושבה|מפת\s+הושבה)/, intent: 'nav_open', extract: m => ({ target: 'seating' }) },
    { re: /^תפתח(י)?\s+(?:את\s+)?(?:ה)?(תור|דאשבורד\s+מארחת)/, intent: 'nav_open', extract: m => ({ target: 'queue' }) },
    { re: /^תפתח(י)?\s+(?:את\s+)?(?:ה)?אירועים/, intent: 'nav_open', extract: m => ({ target: 'events' }) },

    // ========== Customers ==========
    { re: /(מי\s+חוגג|חוגגים|ימי\s+הולדת)\s+(היום|הערב)/, intent: 'q_birthdays_today' },
    { re: /(לקוחות\s+(חוזרים|מובילים|טובים|VIP)|מי\s+הלקוחות\s+הכי)/, intent: 'q_returning_customers' },
    { re: /^(תסמן|תגדיר|תהפוך)\s+(?:את\s+)?(.+?)\s+(?:כ|ל)?VIP/, intent: 'customer_set_vip', extract: m => ({ name: m[2].trim() }) },
    { re: /^(תשלח|שלח)\s+קופון\s+ל(.+)$/, intent: 'customer_send_coupon', extract: m => ({ name: m[2].trim() }) },
    { re: /^(תן|תשלח|תוסיף)\s+הטבה\s+ל(.+)$/, intent: 'benefit_give', extract: m => ({ name: m[2].trim() }) },
    { re: /כמה\s+הטבות\s+(ניתנו|פעילות)/, intent: 'q_benefits_given' },

    // ========== Employees extended ==========
    { re: /(עובדים\s+חדשים|מי\s+(נכנס|התקבל)\s+(החודש|מהחודש))/, intent: 'q_new_hires_month' },
    { re: /כמה\s+שעות\s+(עבד[ה]?|לקח[ה]?)\s+(.+)$/, intent: 'q_hours_worked', extract: m => ({ name: m[2].trim() }) },
    { re: /(מי\s+(בחופש|בחופשה)\s*(היום)?|עובדים\s+בחופש)/, intent: 'q_on_leave' },
    { re: /^(תאשר|אשר)\s+(?:את\s+)?(?:ה)?חופש(?:ה)?\s+של\s+(.+)$/, intent: 'leave_approve', extract: m => ({ name: m[2].trim() }) },
    { re: /(מי\s+(איחר|מאחר[ים]?)|איחורים\s+היום)/, intent: 'q_late_today' },
    { re: /^(תוסיף|שבץ)\s+את\s+(.+?)\s+ל(?:משמרת\s+)?(ערב|צהריים|לונץ׳)\s*(היום|מחר)?/, intent: 'schedule_add', extract: m => ({ name: m[2].trim(), shift_type: m[3].includes('צהר') || m[3].includes('לונ') ? 'lunch' : 'dinner', when: m[4] || 'היום' }) },
    { re: /^(תפתח|תיצור)\s+בקשת\s+החלפה\s+ל(.+)$/, intent: 'request_swap', extract: m => ({ name: m[2].trim() }) },

    // ========== Inventory ==========
    { re: /כמה\s+(.+?)\s+יש\s+(?:במלאי|בשטח|בארגז)?/, intent: 'q_stock', extract: m => ({ item: m[1].trim() }) },
    { re: /(מלאי\s+(?:נמוך|חסר|מתכלה)|פריטים\s+(?:חסרים|נגמרים))/, intent: 'q_low_stock' },
    { re: /^(תוסיף|הוסף)\s+(\d+)\s+(.+?)\s+ל?מלאי$/, intent: 'inventory_add', extract: m => ({ quantity: Number(m[2]), item: m[3].trim() }) },
    { re: /^(תזמין|הזמן)\s+(.+?)\s+(?:מהספק|לספק|מ-?ספק)?$/, intent: 'order_from_supplier', extract: m => ({ item: m[2].trim() }) },
    { re: /(?:איזה|מי)\s+ספק\s+(?:של|נותן)\s+(.+)$/, intent: 'q_supplier_of', extract: m => ({ item: m[1].trim() }) },

    // ========== Suppliers ==========
    { re: /(?:חשבונית\s+אחרונה|חשבונית\s+אחרון[הת])\s+(?:של\s+|מ-?)(.+)$/, intent: 'q_supplier_invoice', extract: m => ({ supplier: m[1].trim() }) },
    { re: /(?:יתרה|חוב|כמה\s+אני\s+חייב)\s+(?:ל|של\s+)(.+)$/, intent: 'q_supplier_balance', extract: m => ({ supplier: m[1].trim() }) },

    // ========== Menu ==========
    { re: /(?:הכי\s+(?:נמכר|מוביל|פופולרי)|מובילים\s+(?:בתפריט|במכירות))/, intent: 'q_top_seller' },
    { re: /(?:מה\s+נמכר|כמה\s+מכרנו)\s+(?:היום|הערב)/, intent: 'q_today_sold' },
    { re: /^(הסר|תוריד|תסיר)\s+(?:את\s+)?(.+?)\s+מהתפריט/, intent: 'menu_remove', extract: m => ({ name: m[2].trim() }) },
    { re: /^(תוסיף|הוסף)\s+(?:לתפריט\s+)?(.+?)\s+ב-?(\d+)\s*₪?/, intent: 'menu_add', extract: m => ({ name: m[2].trim(), price: Number(m[3]) }) },
    { re: /(?:מה\s+הרווח|כמה\s+(?:רווח|מרווח))\s+(?:על|ב)(.+)$/, intent: 'q_profit_on', extract: m => ({ name: m[1].trim() }) },

    // ========== Finance ==========
    { re: /(?:כמה\s+טיפים|טיפים\s+היום)/, intent: 'q_tips_today' },
    { re: /^(תן|שלח)\s+בונוס\s+ל(.+?)(?:\s+(\d+))?$/, intent: 'pay_bonus', extract: m => ({ name: m[2].trim(), amount: Number(m[3]) || 50 }) },
    { re: /^(תן|שלח|תוסיף)\s+(\d+)\s+מטבעות\s+ל(.+)$/, intent: 'coins_give', extract: m => ({ amount: Number(m[2]), name: m[3].trim() }) },
    { re: /(?:חשבוניות\s+(?:פתוחות|לתשלום)|כמה\s+אני\s+חייב)/, intent: 'q_open_invoices' },
    { re: /^(תיצור|תוסיף)\s+חשבונית\s+ל?(.+?)\s+(?:על\s+)?(\d+)/, intent: 'invoice_create', extract: m => ({ supplier: m[2].trim(), amount: Number(m[3]) }) },
    { re: /(?:הכנסה|הכנסות)\s+(השבוע|שבוע)/, intent: 'q_weekly_revenue' },

    // ========== Events ==========
    { re: /(?:אירועים\s+השבוע|כמה\s+אירועים\s+השבוע)/, intent: 'q_events_week' },
    { re: /(?:האירוע\s+הבא|אירוע\s+הבא|מתי\s+האירוע\s+הבא)/, intent: 'q_next_event' },
    { re: /^(תוסיף|תיצור)\s+אירוע\s+ל(.+?)\s+(?:ב-?)?(\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2})?\s*(?:ל-?)?(\d+)?\s*(?:אנשים)?/, intent: 'event_add', extract: m => ({ name: m[2].trim(), date: m[3] || '', guest_count: Number(m[4]) || 0 }) },
    { re: /^(תשלח|שלח)\s+חוזה\s+ל(.+)$/, intent: 'event_send_contract', extract: m => ({ name: m[2].trim() }) },
    { re: /(?:מה\s+סטטוס|סטטוס)\s+(?:האירוע\s+)?(?:של\s+)?(.+)$/, intent: 'q_event_status', extract: m => ({ name: m[1].trim() }) },

    // ========== Tasks / Checklists ==========
    { re: /(?:משימות\s+ל|מה\s+יש\s+ל)(.+?)(?:\s+היום)?$/, intent: 'q_tasks_for', extract: m => ({ name: m[1].trim() }) },
    { re: /(?:כמה\s+צ׳קליסטים|צ׳קליסטים\s+(?:הושלמו|נעשו))/, intent: 'q_checklist_done' },
    { re: /^(תסמן|סמן)\s+צ׳קליסט\s+(?:כ)?(?:הושלם|בוצע|גמור)/, intent: 'checklist_mark_done' },
    { re: /(?:איזה|מה)\s+צ׳קליסטים\s+(?:פתוחים|פעילים)/, intent: 'checklist_open' },

    // ========== Incidents ==========
    { re: /(?:תקריות\s+(?:פתוחות|פעילות)|כמה\s+תקריות)/, intent: 'q_open_incidents' },
    { re: /^(סגור|תסגור)\s+(?:את\s+)?(?:ה?תקרית\s*)?(.*)$/, intent: 'incident_close', extract: m => ({ description: m[2].trim() }) },

    // ========== Marketing ==========
    { re: /^(תשלח|שלח)\s+(?:הודעה\s+|קמפיין\s+)?לכל\s+הלקוחות\s+(.+)$/, intent: 'campaign_broadcast', extract: m => ({ message: m[2].trim() }) },
    { re: /(?:הצלחת\s+קמפיין|איך\s+(?:עבד|הלך)\s+הקמפיין)/, intent: 'q_campaign_success' },
    { re: /^(הפעל|תפעיל)\s+פופאפ\s+(.+)$/, intent: 'popup_activate', extract: m => ({ title: m[2].trim() }) },

    // ========== Gamification ==========
    { re: /(?:לוח\s+שיאים|מי\s+ה?מוביל|טופ\s+עובדים)/, intent: 'q_leaderboard' },
    { re: /כמה\s+(?:מטבעות|נקודות)\s+(?:יש\s+)?ל(.+)$/, intent: 'q_employee_score', extract: m => ({ name: m[1].trim() }) },

    // ========== Devices ==========
    { re: /(?:מי\s+לקח|מי\s+החזיק|אצל\s+מי)\s+(?:את\s+)?(?:ה)?(?:אייפד|טאבלט|iPad|מכשיר)/, intent: 'q_who_has_ipad' },
    { re: /^(תחזיר|החזר|קבל\s+חזרה)\s+(?:את\s+)?(?:ה)?(?:אייפד|מכשיר|טאבלט)\s+(\d+)/, intent: 'return_device', extract: m => ({ device_number: m[2] }) },
    { re: /כמה\s+(?:מכשירים|אייפדים|טאבלטים)/, intent: 'q_device_count' },

    // ========== POS Beecomm ==========
    { re: /(?:הזמנות\s+פתוחות|הזמנות\s+פעילות|כמה\s+הזמנות\s+בקופה)/, intent: 'q_open_orders' },
    { re: /(?:זמן\s+המתנה\s+(?:ממוצע|בקופה)|כמה\s+מחכים)/, intent: 'q_avg_wait' },

    // ========== Training ==========
    { re: /(?:מי\s+לא\s+סיים|מי\s+פתח[ות]?)\s+(?:את\s+)?(?:ה)?(?:קורס|הכשרה|הדרכה)/, intent: 'q_who_didnt_finish_course' },

    // ========== Couriers / Deliveries ==========
    { re: /(?:איזה\s+שליחים|מי\s+השליחים)\s+(?:פעילים|במשמרת)/, intent: 'q_active_courier' },
    { re: /(?:כמה\s+משלוחים|משלוחים\s+היום)/, intent: 'q_deliveries_today' },
    { re: /^(שבץ|תקצה)\s+(?:את\s+)?(.+?)\s+למשלוח/, intent: 'courier_assign', extract: m => ({ courier: m[2].trim() }) },

    // ========== Settings ==========
    { re: /(?:שנה|עדכן)\s+(?:חלון\s+)?ביטול\s+ל?(\d+)\s+שעות/, intent: 'settings_change_cancellation', extract: m => ({ hours: Number(m[1]) }) },
    { re: /(?:שנה|עדכן)\s+(?:אחוז\s+)?פיקדון\s+ל?(\d+)\s*%?/, intent: 'settings_change_deposit_pct', extract: m => ({ pct: Number(m[1]) }) },
    { re: /^(הוסף|תוסיף)\s+שולחן/, intent: 'table_add' },
    { re: /(?:הפעל|כבה|תפעיל|תכבה)\s+הזמנות\s+אונליין/, intent: 'online_reservations_toggle' },

    // ========== Reports ==========
    { re: /(?:תפיק|הפק)\s+דוח\s+(?:חודשי|חודש)/, intent: 'report_generate_monthly' },
    { re: /(?:תשלח|שלח)\s+דוח\s+שבועי/, intent: 'report_send_weekly_whatsapp' },
    { re: /(?:ייצא|תייצא)\s+(?:ל)?אקסל/, intent: 'report_export_excel' },

    // ========== ShiftChat ==========
    { re: /^(תשלח|שלח|תכתוב|כתוב)\s+ל(?:צ׳אט|משמרת)\s+(.+)$/, intent: 'chat_broadcast', extract: m => ({ message: m[2].trim() }) },
    { re: /(?:הודעות\s+היום|מה\s+(?:כתבו|נכתב)\s+בצ׳אט)/, intent: 'q_today_chat' },

    // ========== Restroom ==========
    { re: /(?:מתי\s+(?:ניקו|ניקיון\s+אחרון)|ניקיון\s+(?:אחרון|שירותים))/, intent: 'q_last_clean' },
    { re: /^(תסמן|סמן)\s+(?:את\s+ה)?ניקיון/, intent: 'mark_clean' },

    // ========== Sales gamification ==========
    { re: /^\+?\s*1?\s+(.+?)\s+ל(.+)$/, intent: 'sale_credit', extract: m => ({ dish: m[1].trim(), name: m[2].trim() }) },
    { re: /^(תוסיף|הוסף)\s+(.+?)\s+ל(.+)$/, intent: 'sale_credit', extract: m => ({ dish: m[2].trim(), name: m[3].trim() }) },
    { re: /^(תפעיל|הפעל|פתח)\s+יעד\s+(.+)$/, intent: 'sales_goal_activate', extract: m => ({ template: m[2].trim() }) },
    { re: /(?:כמה\s+(.+?)\s+(?:מכרנו|מכרו)|סטטוס\s+(?:ה?)מכירות)/, intent: 'q_sales_status', extract: m => ({ dish: (m[1] || '').trim() }) },
    { re: /(?:מי\s+המוביל|מי\s+מוביל\s+ב?מכירות)/, intent: 'q_sales_leader' },

    // ========== Help ==========
    { re: /^(מה\s+אפשר|איזה\s+פקודות|עזרה|מה\s+אתה\s+יודע)/, intent: 'help' },
];

export function parseIntent(text) {
    const clean = normalizeHebrewNumbers(cleanForMatch(text));
    try { console.log('[voice] parsing:', JSON.stringify(text), '→', JSON.stringify(clean)); } catch {}
    for (const m of MATCHERS) {
        const match = clean.match(m.re);
        if (match) {
            const extracted = m.extract ? m.extract(match) : {};
            return { intent: m.intent, raw: clean, ...extracted };
        }
    }
    return { intent: 'unknown', raw: clean };
}

// === Catalog for the VoiceTest page ==========================================
export const COMMAND_GROUPS = [
    {
        title: '🪑 ניהול שולחנות',
        cmds: [
            'שולחן 11 פנוי',
            'שולחן 11 התפנה',
            'שולחן 11 נגמר',
            'תפנה שולחן 11',
            'שולחן 11 קינוח',
            'שולחן 11 חשבון',
            'שולחן 11 סיום קרוב',
            'שולחן 11 יושב',
            'שולחן 11 התיישבו',
            'שולחן 11 הבריז',
            'שולחן 11 לא הגיע',
        ],
    },
    {
        title: '🚩 דגלים',
        cmds: [
            'שולחן 11 ירוק',
            'שולחן 11 VIP',
            'שולחן 11 חשוב',
            'שולחן 11 אדום',
            'שולחן 11 בעיה',
            'שולחן 11 כתום',
            'שולחן 11 שחור',
            'שולחן 11 ללא דגל',
        ],
    },
    {
        title: '🚶 תור',
        cmds: [
            'תוסיף לתור 4 על שם שירה',
            'תוסיף לתור 2 חוץ על שם רן',
            'תוסיף לתור 4 פנים על שם רן',
            'תוסיף לתור את שירה 4 אנשים',
            'תקרא לשירה',
            'שירה בא',
            'שירה הגיעה',
            'שירה עזב',
            'שירה נטוש',
        ],
    },
    {
        title: '🎯 הושבה',
        cmds: [
            'תושיב את שירה על 20',
            'תושיב את ניב על 200 ו-201',
            'תקבל את הבא בתור על 30',
            'תושיב 4 על שולחן 30',
            'תושיב 6 על שולחן 100',
        ],
    },
    {
        title: '📅 הזמנות',
        cmds: [
            'תוסיף הזמנה רן 4 אנשים 21:00 מחר',
            'תוסיף הזמנה ל-שירה 2 19:30 היום',
            'בטל את ההזמנה של רן',
            'תאשר את ההזמנה של שירה',
        ],
    },
    {
        title: '⏰ סשנים',
        cmds: [
            'שולחן 11 עוד 30 דקות',
            'שולחן 11 עוד שעה',
            'שולחן 11 עוד חצי שעה',
            'העבר את שולחן 11 לשולחן 30',
        ],
    },
    {
        title: '❓ שאלות (קוליות)',
        cmds: [
            'מי הבא בתור',
            'מי ההזמנה הבאה',
            'כמה אנשים בתור',
            'כמה מקומות פנויים',
            'מי על שולחן 11',
            'כמה הזמנות הערב',
            'כמה הזמנות מחר',
            'כמה אורחים הערב',
            'כמה הכנסה היום',
            'מה המצב',
            'מי במשמרת',
        ],
    },
    {
        title: '🧭 ניווט',
        cmds: [
            'תפתח את המפה',
            'תפתח את הדאשבורד',
            'תפתח את התור',
            'תפתח את האירועים',
            'תפתח את הגדרות פיקדון',
            'תפתח את הגדרות הזמנות',
            'תפתח סידור עבודה',
        ],
    },
    {
        title: '📩 תקשורת',
        cmds: [
            'תשלח לשירה אישור',
            'תזכיר לשירה',
        ],
    },
    {
        title: '👤 לקוחות',
        cmds: [
            'מי חוגג היום',
            'לקוחות חוזרים',
            'תסמן את דביר VIP',
            'תשלח קופון לרן',
            'תן הטבה לשירה',
        ],
    },
    {
        title: '👥 עובדים (מורחב)',
        cmds: [
            'עובדים חדשים החודש',
            'כמה שעות עבד דביר',
            'מי בחופש היום',
            'תאשר חופש של רן',
            'מי איחר היום',
            'תוסיף את שירה למשמרת ערב היום',
            'תפתח בקשת החלפה לדביר',
        ],
    },
    {
        title: '📦 מלאי',
        cmds: [
            'כמה חזה עוף יש',
            'מלאי נמוך',
            'תוסיף 10 חזה עוף למלאי',
            'תזמין חזה עוף',
            'איזה ספק של חזה עוף',
        ],
    },
    {
        title: '🚚 ספקים',
        cmds: [
            'חשבונית אחרונה של גלעם',
            'יתרה של גלעם',
        ],
    },
    {
        title: '🍽️ תפריט',
        cmds: [
            'הכי נמכר',
            'מה נמכר היום',
            'הסר ספגטי מהתפריט',
            'תוסיף לתפריט פיצה ב-65',
            'מה הרווח על המבורגר',
        ],
    },
    {
        title: '💰 כסף',
        cmds: [
            'כמה טיפים היום',
            'תן בונוס לרן 100',
            'תן 50 מטבעות לשירה',
            'חשבוניות פתוחות',
            'תיצור חשבונית גלעם 1200',
            'הכנסות השבוע',
        ],
    },
    {
        title: '🎉 אירועים',
        cmds: [
            'אירועים השבוע',
            'האירוע הבא',
            'תוסיף אירוע לרן 25/12 50 אנשים',
            'תשלח חוזה לרן',
            'סטטוס של רן',
        ],
    },
    {
        title: '✅ משימות ו-צ׳קליסטים',
        cmds: [
            'משימות לרן',
            'כמה צ׳קליסטים הושלמו',
            'תסמן צ׳קליסט כהושלם',
            'איזה צ׳קליסטים פתוחים',
        ],
    },
    {
        title: '🚨 תקריות',
        cmds: [
            'תקריות פתוחות',
            'סגור תקרית המקרר',
        ],
    },
    {
        title: '📣 שיווק',
        cmds: [
            'תשלח לכל הלקוחות אנחנו פתוחים שבת',
            'הצלחת קמפיין',
            'הפעל פופאפ מבצע יין',
        ],
    },
    {
        title: '🏆 גמיפיקציה',
        cmds: [
            'לוח שיאים',
            'כמה מטבעות יש לדביר',
        ],
    },
    {
        title: '📱 מכשירים',
        cmds: [
            'מי לקח אייפד',
            'תחזיר אייפד 3',
            'כמה מכשירים',
        ],
    },
    {
        title: '🛵 משלוחים',
        cmds: [
            'איזה שליחים פעילים',
            'כמה משלוחים היום',
            'שבץ את ישי למשלוח',
        ],
    },
    {
        title: '🎓 הכשרות',
        cmds: ['מי לא סיים את הקורס'],
    },
    {
        title: '⚙️ הגדרות',
        cmds: [
            'שנה ביטול ל-12 שעות',
            'שנה פיקדון ל-25%',
            'הוסף שולחן',
            'הפעל הזמנות אונליין',
            'תפיק דוח חודשי',
        ],
    },
    {
        title: '💬 צ׳אט משמרת + ניקיון',
        cmds: [
            'תשלח למשמרת קדימה',
            'הודעות היום',
            'מתי ניקיון אחרון',
            'תסמן ניקיון',
        ],
    },
    {
        title: '🎯 מכירות',
        cmds: [
            'תוסיף קינוח לרן',
            '+1 קינוח לרן',
            'תפעיל יעד מבצע קינוחים',
            'כמה קינוחים מכרנו',
            'מי המוביל',
        ],
    },
    {
        title: '🆘 עזרה',
        cmds: ['מה אפשר', 'איזה פקודות', 'עזרה'],
    },
];
