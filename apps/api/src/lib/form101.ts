// Digital טופס 101 — the official Israeli Tax Authority employee card.
// Spec: docs/SPEC_FORM101.md · official form 0101/130, parts א–י.
//
// This module is the single source of truth for the form's SHAPE and its RULES.
// The frontend renders the wizard from FORM101_SECTIONS rather than hardcoding
// the fields again — a form this size drifts the moment it lives in two places.
// The one thing deliberately duplicated on the client is the ID check digit, so
// a typo is caught while the employee is still looking at the field.

export type Issue = { field: string; message: string };

/**
 * Israeli ID check digit (Luhn over 9 digits, alternating weights 1,2).
 * Short input is left-padded — people habitually drop leading zeros, and a
 * legitimate ID like 039999990 is typed as "39999990" more often than not.
 */
export function isValidIsraeliId(value: string): boolean {
  const raw = String(value ?? '').replace(/[\s-]/g, '');
  if (!/^\d{1,9}$/.test(raw)) return false;
  const id = raw.padStart(9, '0');
  // All-zeros satisfies the checksum but is not an identity number.
  if (id === '000000000') return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const step = Number(id[i]) * ((i % 2) + 1);
    sum += step > 9 ? step - 9 : step;
  }
  return sum % 10 === 0;
}

export type CreditClause = {
  n: number;
  label: string;
  /** The form itself says an approval must be attached; the rules make a missing one a blocker. */
  requires_document?: boolean;
  /** Extra inputs the clause carries beyond the checkbox. */
  fields?: { key: string; label: string; type?: string }[];
};

/** חלק ח — the 15 clauses that grant credit points or an exemption. */
const CREDIT_CLAUSES: CreditClause[] = [
  { n: 1, label: 'אני תושב/ת ישראל' },
  {
    n: 2,
    label: 'אני נכה 100% / עיוור/ת לצמיתות',
    requires_document: true,
  },
  {
    n: 3,
    label: 'אני עולה חדש/ה / תושב/ת חוזר/ת',
    requires_document: true,
    fields: [
      { key: 'kind', label: 'סוג', type: 'select:עולה חדש/ה,תושב/ת חוזר/ת' },
      { key: 'from_date', label: 'מתאריך', type: 'date' },
    ],
  },
  {
    n: 4,
    label: 'אני חייל/ת משוחרר/ת / שירות לאומי',
    requires_document: true,
    fields: [
      { key: 'service_start', label: 'תאריך תחילת השירות', type: 'date' },
      { key: 'service_end', label: 'תאריך סיום השירות', type: 'date' },
    ],
  },
  { n: 5, label: 'בגין בן/בת זוגי המתגורר/ת עימי ואין לו/לה הכנסות (רק בגיל פרישה / נכה / עיוור)' },
  { n: 6, label: 'אני הורה במשפחה חד הורית החי בנפרד' },
  {
    n: 7,
    label: 'בגין ילדיי שבחזקתי המפורטים בחלק ג',
    fields: [
      { key: 'born_this_year', label: 'ילדים שנולדו בשנת המס', type: 'number' },
      { key: 'age_1_to_5', label: 'ילדים שימלאו להם שנה עד 5', type: 'number' },
      { key: 'age_6_to_17', label: 'ילדים שימלאו להם 6 עד 17', type: 'number' },
      { key: 'age_18', label: 'ילדים שימלאו להם 18', type: 'number' },
    ],
  },
  {
    n: 8,
    label: 'בגין ילדיי הפעוטים',
    fields: [
      { key: 'born_this_year', label: 'ילדים שנולדו בשנת המס', type: 'number' },
      { key: 'age_1_to_5', label: 'ילדים שימלאו להם שנה עד 5', type: 'number' },
    ],
  },
  { n: 9, label: 'אני הורה יחיד לילדיי שבחזקתי (המפורטים בסעיפים 7 ו-8)' },
  { n: 10, label: 'בגין ילדיי שאינם בחזקתי המפורטים בחלק ג ואני משתתף/ת בכלכלתם' },
  {
    n: 11,
    label: 'אני הורה לילד נטול יכולת שטרם מלאו לו 19',
    requires_document: true,
  },
  {
    n: 12,
    label: 'נישאתי בשנית — מזונות לבן/בת זוגי לשעבר',
    requires_document: true,
  },
  { n: 13, label: 'מלאו לי או לבן/בת זוגי 16 וטרם מלאו 18 בשנת המס' },
  {
    n: 14,
    label: 'אני תושב/ת קבוע/ה ביישוב מזכה',
    requires_document: true,
    fields: [
      { key: 'from_date', label: 'מתאריך', type: 'date' },
      { key: 'town', label: 'שם היישוב' },
    ],
  },
  {
    n: 15,
    label: 'סיום לימודים לתואר אקדמי / התמחות / לימודי מקצוע',
    requires_document: true,
  },
];

export type Section = {
  key: string;
  part: string;
  title: string;
  /** false = the business fills it, not the employee (part א). */
  employee_fills: boolean;
  fields?: { key: string; label: string; type?: string; required?: boolean }[];
  clauses?: CreditClause[];
  /** Carried over from last year's form per the electronic-101 rules. */
  carries_over?: boolean;
};

export const FORM101_SECTIONS: Section[] = [
  {
    key: 'employer', part: 'א', title: 'פרטי המעביד', employee_fills: false,
    fields: [
      { key: 'deductions_file', label: 'מספר תיק ניכויים' },
      { key: 'name', label: 'שם המעביד' },
      { key: 'address', label: 'כתובת' },
      { key: 'phone', label: 'טלפון' },
    ],
  },
  {
    key: 'personal', part: 'ב', title: 'פרטי העובד/ת', employee_fills: true, carries_over: true,
    fields: [
      { key: 'first_name', label: 'שם פרטי', required: true },
      { key: 'last_name', label: 'שם משפחה', required: true },
      { key: 'id_number', label: 'מספר זהות', required: true },
      { key: 'birth_date', label: 'תאריך לידה', type: 'date', required: true },
      { key: 'immigration_date', label: 'תאריך עליה', type: 'date' },
      { key: 'gender', label: 'מין', type: 'select:זכר,נקבה', required: true },
      { key: 'city', label: 'עיר/יישוב', required: true },
      { key: 'street', label: 'רחוב/שכונה', required: true },
      { key: 'house_no', label: 'מספר', required: true },
      { key: 'zip', label: 'מיקוד' },
      { key: 'email', label: 'דואר אלקטרוני', type: 'email' },
      { key: 'phone_mobile', label: 'טלפון נייד', required: true },
      { key: 'phone', label: 'טלפון' },
      { key: 'hmo', label: 'חבר בקופת חולים', type: 'select:כן,לא' },
      { key: 'hmo_name', label: 'שם הקופה' },
      { key: 'kibbutz_member', label: 'חבר קיבוץ/מושב שיתופי', type: 'bool' },
      { key: 'is_resident', label: 'תושב/ת ישראל', type: 'bool', required: true },
      { key: 'marital_status', label: 'מצב משפחתי', type: 'select:רווק/ה,נשוי/אה,גרוש/ה,אלמן/ה,פרוד/ה', required: true },
      { key: 'separated_approval', label: 'אישור פקיד שומה (פרוד/ה)', type: 'file' },
    ],
  },
  {
    key: 'children', part: 'ג', title: 'ילדים שטרם מלאו להם 19', employee_fills: true, carries_over: true,
    fields: [
      { key: 'name', label: 'שם הילד/ה', required: true },
      { key: 'id_number', label: 'מספר זהות', required: true },
      { key: 'birth_date', label: 'תאריך לידה', type: 'date', required: true },
      { key: 'in_custody', label: 'הילד/ה בחזקתי', type: 'bool' },
      { key: 'child_allowance', label: 'מקבל/ת בגינו קצבת ילדים מב"ל', type: 'bool' },
    ],
  },
  {
    key: 'income_this', part: 'ד', title: 'פרטים על הכנסותיי ממעביד זה', employee_fills: true,
    fields: [
      { key: 'start_date', label: 'תאריך תחילת העבודה בשנת המס', type: 'date', required: true },
      {
        key: 'type', label: 'סוג ההכנסה', required: true,
        type: 'select:משכורת חודש,משכורת בעד משרה נוספת,משכורת חלקית,שכר עבודה (עובד יומי),קצבה,מלגה',
      },
    ],
  },
  {
    key: 'other_income', part: 'ה', title: 'פרטים על הכנסות אחרות', employee_fills: true,
    fields: [
      { key: 'none', label: 'אין לי הכנסות אחרות לרבות מלגות', type: 'bool' },
      { key: 'types', label: 'סוגי ההכנסה האחרת', type: 'multi' },
      { key: 'credit_here', label: 'אבקש נקודות זיכוי ומדרגות מס כנגד הכנסה זו', type: 'bool' },
      { key: 'credit_elsewhere', label: 'אני מקבל/ת נקודות זיכוי בהכנסה אחרת', type: 'bool' },
      { key: 'study_fund', label: 'אין מפרישים עבורי לקרן השתלמות בגין ההכנסה האחרת', type: 'bool' },
      { key: 'pension_ins', label: 'אין מפרישים עבורי לקצבה/אכ"ע/פיצויים בגין ההכנסה האחרת', type: 'bool' },
    ],
  },
  {
    key: 'spouse', part: 'ו', title: 'פרטים על בן/בת הזוג', employee_fills: true, carries_over: true,
    fields: [
      { key: 'first_name', label: 'שם פרטי' },
      { key: 'last_name', label: 'שם משפחה' },
      { key: 'id_number', label: 'מספר זהות' },
      { key: 'birth_date', label: 'תאריך לידה', type: 'date' },
      { key: 'immigration_date', label: 'תאריך עליה', type: 'date' },
      { key: 'income', label: 'הכנסת בן/בת הזוג', type: 'select:אין הכנסה,עבודה/קצבה/עסק,הכנסה אחרת' },
    ],
  },
  {
    key: 'changes', part: 'ז', title: 'שינויים במהלך השנה', employee_fills: true,
    fields: [
      { key: 'notice_date', label: 'תאריך ההודעה', type: 'date' },
      { key: 'change_date', label: 'תאריך השינוי', type: 'date' },
      { key: 'details', label: 'פרטי השינוי' },
    ],
  },
  {
    key: 'credits', part: 'ח', title: 'בקשה לפטור או זיכוי ממס', employee_fills: true,
    clauses: CREDIT_CLAUSES,
  },
  {
    key: 'coordination', part: 'ט', title: 'בקשה לתיאום מס', employee_fills: true,
    fields: [
      { key: 'no_prior_income', label: 'לא היתה לי הכנסה מתחילת שנת המס עד תחילת עבודתי אצל מעביד זה', type: 'bool' },
      { key: 'sources', label: 'הכנסות נוספות ממשכורת', type: 'table' },
      { key: 'approved_by_assessor', label: 'פקיד השומה אישר תיאום לפי אישור מצורף', type: 'bool' },
    ],
  },
  {
    key: 'declaration', part: 'י', title: 'הצהרה וחתימה', employee_fills: true,
    fields: [
      { key: 'accepted', label: 'אני מצהיר/ה כי הפרטים שמסרתי בטופס זה הינם מלאים ונכונים', type: 'bool', required: true },
      { key: 'signature_data_url', label: 'חתימה', type: 'signature', required: true },
    ],
  },
];

/** The declaration as printed on the official form — shown verbatim above the signature. */
export const FORM101_DECLARATION =
  'אני מצהיר/ה כי הפרטים שמסרתי בטופס זה הינם מלאים ונכונים. ידוע לי שהשמטה או מסירת ' +
  'פרטים לא נכונים הינה עבירה על פקודת מס הכנסה. אני מתחייב/ת להודיע למעביד על כל שינוי ' +
  'שיחול בפרטיי האישיים ובפרטים דלעיל תוך שבוע ימים מתאריך השינוי.';

const sectionByKey = (key: string) => FORM101_SECTIONS.find((s) => s.key === key)!;

const isBlank = (v: any) => v === undefined || v === null || (typeof v === 'string' && !v.trim());

const yearOf = (d: any): number | null => {
  const m = /^(\d{4})/.exec(String(d ?? ''));
  return m ? Number(m[1]) : null;
};

/**
 * Validates a filled form.
 *
 * `draft: true` runs only the checks that make sense mid-fill — a half-empty
 * draft is normal and must save, but a malformed ID is wrong the moment it's
 * typed and there is no point carrying it to the end of the wizard.
 */
export function validateForm101(
  data: any,
  opts: { draft?: boolean; tax_year?: number } = {},
): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const d = data || {};
  const draft = !!opts.draft;
  const personal = d.personal || {};
  const children: any[] = Array.isArray(d.children) ? d.children : [];

  const require = (field: string, value: any, message: string) => {
    if (draft) return;
    if (isBlank(value)) errors.push({ field, message });
  };

  // ── חלק ב ─────────────────────────────────────────────────────────────────
  for (const f of sectionByKey('personal').fields!) {
    if (f.required) require(`personal.${f.key}`, personal[f.key], `${f.label} — שדה חובה`);
  }
  if (!isBlank(personal.id_number) && !isValidIsraeliId(personal.id_number)) {
    errors.push({ field: 'personal.id_number', message: 'מספר זהות אינו תקין (ספרת ביקורת)' });
  }
  // The form is explicit that פרוד/ה is only accepted with an assessing officer's approval.
  if (personal.marital_status === 'פרוד/ה') {
    require('personal.separated_approval', personal.separated_approval, 'סטטוס פרוד/ה מחייב אישור פקיד שומה');
  }

  // ── חלק ג — a count is not enough; every child needs name, ID and DOB ──────
  children.forEach((c, i) => {
    const child = c || {};
    require(`children.${i}.name`, child.name, 'שם הילד/ה — שדה חובה');
    require(`children.${i}.id_number`, child.id_number, 'מספר זהות של הילד/ה — שדה חובה');
    require(`children.${i}.birth_date`, child.birth_date, 'תאריך לידה של הילד/ה — שדה חובה');
    if (!isBlank(child.id_number) && !isValidIsraeliId(child.id_number)) {
      errors.push({ field: `children.${i}.id_number`, message: 'מספר זהות של הילד/ה אינו תקין' });
    }
  });

  // ── חלק ד ─────────────────────────────────────────────────────────────────
  const incomeThis = d.income_this || {};
  for (const f of sectionByKey('income_this').fields!) {
    if (f.required) require(`income_this.${f.key}`, incomeThis[f.key], `${f.label} — שדה חובה`);
  }

  // ── חלק ה — leaving it blank is itself an answer the form doesn't allow ────
  if (!draft) {
    const other = d.other_income || {};
    const types: any[] = Array.isArray(other.types) ? other.types : [];
    if (other.none !== true && other.none !== false && !types.length) {
      errors.push({ field: 'other_income', message: 'יש לסמן אם יש הכנסות אחרות או לא' });
    } else if (other.none === false && !types.length) {
      errors.push({ field: 'other_income.types', message: 'סימנת שיש הכנסות אחרות — יש לפרט' });
    }
  }

  // ── חלק ו ─────────────────────────────────────────────────────────────────
  const spouse = d.spouse || {};
  if (personal.marital_status === 'נשוי/אה') {
    require('spouse.id_number', spouse.id_number, 'מספר זהות של בן/בת הזוג — שדה חובה');
  }
  if (!isBlank(spouse.id_number) && !isValidIsraeliId(spouse.id_number)) {
    errors.push({ field: 'spouse.id_number', message: 'מספר זהות של בן/בת הזוג אינו תקין' });
  }

  // ── חלק ח ─────────────────────────────────────────────────────────────────
  const clauses = (d.credits || {}).clauses || {};
  for (const clause of CREDIT_CLAUSES) {
    const filled = clauses[clause.n] || clauses[String(clause.n)];
    if (!filled?.checked) continue;
    if (clause.requires_document) {
      require(`credits.${clause.n}.document`, filled.document_url, `${clause.label} — חובה לצרף אישור`);
    }
    for (const f of clause.fields || []) {
      // Counts are optional per clause; only the dated/named inputs are needed
      // to make the clause meaningful at all.
      if (f.type === 'number') continue;
      require(`credits.${clause.n}.${f.key}`, filled[f.key], `${clause.label} — ${f.label} חסר`);
    }
    // Cross-check the age-bracket counts against the actual children. This is a
    // warning on purpose: the brackets depend on birthdays falling inside the
    // tax year, and blocking an employee over our own arithmetic is worse than
    // flagging it for the manager.
    const taxYear = opts.tax_year;
    if (taxYear && (clause.n === 7 || clause.n === 8)) {
      const bornThisYear = children.filter((c) => yearOf(c?.birth_date) === taxYear).length;
      if (Number(filled.born_this_year || 0) > bornThisYear) {
        warnings.push({
          field: `credits.${clause.n}.born_this_year`,
          message: `סימנת ${filled.born_this_year} ילדים שנולדו בשנת המס, אך בחלק ג׳ מופיעים ${bornThisYear}`,
        });
      }
    }
  }

  // ── חלק י ─────────────────────────────────────────────────────────────────
  const dec = d.declaration || {};
  if (!draft && dec.accepted !== true) {
    errors.push({ field: 'declaration.accepted', message: 'יש לאשר את ההצהרה' });
  }
  const sig = String(dec.signature_data_url || '');
  if (!sig) {
    require('declaration.signature_data_url', null, 'חסרה חתימה');
  } else if (!sig.startsWith('data:image/')) {
    errors.push({ field: 'declaration.signature_data_url', message: 'החתימה אינה תקינה' });
  }

  return { errors, warnings };
}

/**
 * Builds next year's starting point from last year's form.
 *
 * The electronic-101 rules name exactly which parts may carry over — ב (personal),
 * ג (children) and ו (spouse). Income, credits and above all the SIGNATURE must
 * not: a signature is a statement about one specific year's declaration, and
 * re-using it would mean the employee never actually signed this year's form.
 */
export function prefillFromPrevious(previous: any): Record<string, any> {
  if (!previous || typeof previous !== 'object') return {};
  const out: Record<string, any> = {};
  for (const section of FORM101_SECTIONS) {
    if (!section.carries_over) continue;
    const value = previous[section.key];
    if (value === undefined) continue;
    out[section.key] = structuredClone(value);
  }
  if (!Object.keys(out).length) return {};
  // The employee must actively confirm the carried data is still correct before
  // the wizard will move on — required by the rules, and the reason a stale
  // address or an outgrown child doesn't silently ride into a new tax year.
  out.prefilled_needs_confirmation = true;
  return out;
}
