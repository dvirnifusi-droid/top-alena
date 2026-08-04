/**
 * "ממתין" on its own is a question, not a status.
 *
 * A reservation is 'pending' for exactly one of two reasons, and they are
 * opposite kinds of waiting:
 *   - a deposit hold hasn't been placed yet → waiting on the GUEST, and the
 *     table is being held for them meanwhile;
 *   - it's a waitlist entry → waiting on the RESTAURANT to decide whether a
 *     table can be freed, and no table is held.
 * The server writes both as `status: 'pending'`
 * (`(isStandby || willCollectDeposit) ? 'pending' : 'confirmed'`), so the raw
 * status can't tell them apart — is_standby / deposit_required can.
 *
 * Anything else that is 'pending' has no reason at all: 'pending' is the column
 * default in the schema, so any path that forgets to set a status lands here.
 */

export const PENDING_DEPOSIT = 'deposit';
export const PENDING_STANDBY = 'standby';
export const PENDING_UNKNOWN = 'unknown';

export function pendingReason(reservation) {
    if (!reservation || reservation.status !== 'pending') return null;
    if (reservation.is_standby) return PENDING_STANDBY;
    if (reservation.deposit_required || reservation.deposit_status === 'pending') return PENDING_DEPOSIT;
    return PENDING_UNKNOWN;
}

/** Short label for a card or a chip. */
export function pendingLabel(reservation) {
    switch (pendingReason(reservation)) {
        case PENDING_STANDBY: return 'ממתין להחלטה';
        case PENDING_DEPOSIT: return 'ממתין לאשראי';
        case PENDING_UNKNOWN: return 'ממתין';
        default: return null;
    }
}

/** One sentence saying who is being waited on, and what happens next. */
export function pendingExplanation(reservation) {
    switch (pendingReason(reservation)) {
        case PENDING_STANDBY:
            return 'ברשימת המתנה — אין שולחן שמור. מחכה להחלטה שלכם אם אפשר לפנות מקום. קידום דרך לשונית "המתנה" ישבץ שולחן וישלח הודעה ללקוח.';
        case PENDING_DEPOSIT:
            return 'ממתין שהלקוח יזין כרטיס אשראי לפיקדון. השולחן שמור בינתיים, וההזמנה תאושר לבד ברגע שהכרטיס ייתפס.';
        case PENDING_UNKNOWN:
            return 'אין סיבה רשומה להמתנה — לא פיקדון ולא רשימת המתנה. כנראה נוצרה בייבוא או בכלי שלא קבע סטטוס. אפשר לסמן אותה כמאושרת.';
        default:
            return null;
    }
}
