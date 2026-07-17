// Guards for the generic /api/entities route so sensitive data can only flow
// through dedicated, permission-checked functions.
// Models that must NEVER be read/written via the generic entities route.
export const READ_BLOCKED_ENTITIES = new Set(['EmployeePay']);
// Fields that must not be settable via a generic write on a given model
// (they are governed by dedicated owner-only functions instead).
const PROTECTED_FIELDS = {
    Employee: ['pay_access_scope'],
};
export function stripProtectedFields(modelName, data) {
    if (!data || typeof data !== 'object')
        return data;
    const fields = PROTECTED_FIELDS[modelName];
    if (!fields)
        return data;
    const out = { ...data };
    for (const f of fields)
        delete out[f];
    return out;
}
//# sourceMappingURL=entityGuards.js.map