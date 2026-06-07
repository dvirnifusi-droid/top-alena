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
    { re: /^תוסיף(י)?\s+הזמנה\s+(?:ל)?(.+?)\s+(\d+)\s+(?:אנשים\s+)?(?:ל)?(\d{1,2}[:.]?\d{0,2})(?:\s+(היום|מחר|מחרתיים))?/,
        intent: 'reservation_add', extract: m => ({
            name: m[2].trim(),
            party_size: Number(m[3]),
            time: m[4].replace('.', ':').padEnd(5, '0'),
            when: m[5] || 'היום',
        }) },
    { re: /^(בטל|תבטל[יה]?)\s+(?:את\s+)?(?:ההזמנה\s+של\s+)?(.+)$/, intent: 'reservation_cancel', extract: m => ({ name: m[2].trim() }) },
    { re: /^תאשר(י)?\s+(?:את\s+)?(?:ההזמנה\s+של\s+)?(.+)$/, intent: 'reservation_confirm', extract: m => ({ name: m[2].trim() }) },

    // ========== Session extensions ==========
    { re: /שולחן\s+(\d+)\s+עוד\s+(\d+)\s+דק/, intent: 'session_extend', extract: m => ({ table: m[1], minutes: Number(m[2]) }) },
    { re: /שולחן\s+(\d+)\s+עוד\s+שעה/, intent: 'session_extend', extract: m => ({ table: m[1], minutes: 60 }) },
    { re: /שולחן\s+(\d+)\s+עוד\s+חצי\s+שעה/, intent: 'session_extend', extract: m => ({ table: m[1], minutes: 30 }) },

    // ========== Move table ==========
    { re: /(העבר|תעבר[יה]?)\s+(?:את\s+)?שולחן\s+(\d+)\s+ל(?:שולחן\s+)?(\d+)/, intent: 'session_move', extract: m => ({ from: m[2], to: m[3] }) },

    // ========== Queue ==========
    { re: /^תוסיף(י)?\s+(?:לתור\s+)?(\d+)\s+(חוץ|פנים)\s+על\s+שם\s+(.+)$/, intent: 'queue_add', extract: m => ({ party_size: Number(m[2]), pref: m[3] === 'חוץ' ? 'outside' : 'inside', name: m[4].trim() }) },
    { re: /^תוסיף(י)?\s+לתור\s+(\d+)\s+על\s+שם\s+(.+)$/, intent: 'queue_add', extract: m => ({ party_size: Number(m[2]), pref: 'no_preference', name: m[3].trim() }) },
    { re: /^תוסיף(י)?\s+לתור\s+את\s+(.+?)\s+(\d+)\s+(?:אנשים)?/, intent: 'queue_add', extract: m => ({ name: m[2].trim(), party_size: Number(m[3]), pref: 'no_preference' }) },
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
        title: '🆘 עזרה',
        cmds: ['מה אפשר', 'איזה פקודות', 'עזרה'],
    },
];
