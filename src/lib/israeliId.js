/**
 * Israeli ID check digit — client mirror of `isValidIsraeliId` in
 * apps/api/src/lib/form101.ts (which stays the authority; the server re-checks
 * everything). Duplicated on purpose and kept tiny: an employee typing their ID
 * on a phone should be told immediately, not after submitting a whole form.
 *
 * Short input is left-padded — people habitually drop leading zeros.
 */
export function isValidIsraeliId(value) {
  const raw = String(value ?? '').replace(/[\s-]/g, '');
  if (!/^\d{1,9}$/.test(raw)) return false;
  const id = raw.padStart(9, '0');
  if (id === '000000000') return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const step = Number(id[i]) * ((i % 2) + 1);
    sum += step > 9 ? step - 9 : step;
  }
  return sum % 10 === 0;
}
