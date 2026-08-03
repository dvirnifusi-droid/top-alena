// Guards for the generic /api/entities route so sensitive data can only flow
// through dedicated, permission-checked functions.

// Models that must NEVER be read/written via the generic entities route.
// DepositSettings / IntegrationSecret / EmailAccount hold live payment and
// third-party credentials: a generic read returned the tenant's raw PayPlus
// api_key + secret_key to ANY logged-in staff member (who could then charge
// cards outside the app), and a generic write let them swap in their own
// merchant credentials to redirect every guest deposit. Dedicated, masked,
// role-checked functions (getDepositSettings / listMyIntegrations) are the
// only legitimate way in.
export const READ_BLOCKED_ENTITIES = new Set<string>([
  'EmployeePay', 'DepositSettings', 'IntegrationSecret', 'EmailAccount',
]);

// Fields that must not be settable via a generic write on a given model
// (they are governed by dedicated owner-only functions instead).
const PROTECTED_FIELDS: Record<string, string[]> = {
  Employee: ['pay_access_scope'],
  // Money fields — only the deposit functions may move these, so a tampered
  // generic write can't inflate what a later "charge" call captures.
  Reservation: [
    'deposit_amount', 'deposit_status', 'deposit_provider_ref', 'deposit_provider',
    'deposit_charge_amount', 'deposit_charged_at', 'deposit_authorized_at', 'deposit_released_at',
  ],
};

export function stripProtectedFields(modelName: string, data: any): any {
  if (!data || typeof data !== 'object') return data;
  const fields = PROTECTED_FIELDS[modelName];
  if (!fields) return data;
  const out = { ...data };
  for (const f of fields) delete out[f];
  return out;
}
