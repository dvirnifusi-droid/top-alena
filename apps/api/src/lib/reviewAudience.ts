// Pure resolution of a day's reservation/event rows into deduped Customer ids.

export function normalizePhone(raw: unknown): string {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  return d;
}

type ResRow = { customer_id?: string | null; customer_phone?: string | null };
type EvtRow = { customer_phone?: string | null };
type CustRow = { id: string; phone: string };

export function resolveAudienceCustomerIds(input: {
  reservations: ResRow[];
  events: EvtRow[];
  customers: CustRow[];
}): string[] {
  const byPhone = new Map<string, string>();
  for (const c of input.customers) {
    const p = normalizePhone(c.phone);
    if (p) byPhone.set(p, c.id);
  }
  const ids = new Set<string>();
  for (const r of input.reservations) {
    if (r.customer_id) {
      ids.add(r.customer_id);
      continue;
    }
    const cid = byPhone.get(normalizePhone(r.customer_phone));
    if (cid) ids.add(cid);
  }
  for (const e of input.events) {
    const cid = byPhone.get(normalizePhone(e.customer_phone));
    if (cid) ids.add(cid);
  }
  return [...ids];
}
