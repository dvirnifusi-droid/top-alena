// Put names on anonymous money.
//
// Israeli banks export supplier payments with no counterparty — Mizrahi writes
// "העברה באינטרנט" and "פירעון שיק" and nothing else, which on a real account is
// well over a million shekels a quarter with no idea who it went to. The only
// other record of that money is the invoice, so this matches the two by amount
// and timing.
//
// Two shapes cover almost everything: one transfer paying one invoice, and one
// transfer settling several invoices from the same supplier at once. Every match
// is scored, and anything the algorithm is not sure of is reported as unmatched
// rather than guessed — a wrong attribution is worse than a missing one, because
// it silently corrupts the supplier ledger the owner makes decisions from.

const DAY = 86400_000;
const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / DAY);

export type MatchInvoice = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  amount: number;
  invoice_date: string;
  due_date: string;
  paid_by_card?: boolean;
};

export type MatchTx = {
  id: string;
  date: string;
  amount: number;      // negative (an outflow)
  description: string;
};

export type Variance = {
  bank_tx_id: string;
  bank_date: string;
  bank_amount: number;
  invoice_id: string;
  supplier_name: string;
  invoice_amount: number;
  diff: number;          // paid minus invoiced; positive = overpaid
  pct: number;
  reason: string;
};

export type Match = {
  bank_tx_id: string;
  bank_date: string;
  bank_amount: number;
  supplier_id: string;
  supplier_name: string;
  invoice_ids: string[];
  method: 'exact' | 'batch';
  confidence: 'high' | 'medium' | 'low';
  day_gap: number;     // bank date minus due date; negative = paid early
  reason: string;
};

const AGORA = 0.5;              // rounding slack, in shekels
const EARLY = 14;               // how early a payment may plausibly land
const LATE = 45;                // and how late

/** Confidence from how far the payment sits from the invoice's due date. */
function score(gap: number, method: 'exact' | 'batch'): 'high' | 'medium' | 'low' {
  const a = Math.abs(gap);
  if (method === 'exact') {
    if (a <= 7) return 'high';
    if (a <= 21) return 'medium';
    return 'low';
  }
  // A batch has to clear a higher bar: matching a sum by coincidence is far
  // likelier than matching a single amount.
  if (a <= 7) return 'medium';
  return 'low';
}

/** Smallest subset of `pool` summing to `target`, searched size-first. */
function findSubset(pool: MatchInvoice[], target: number, maxSize: number): MatchInvoice[] | null {
  const n = pool.length;
  // Size-first so the simplest explanation wins, and so a huge pool cannot
  // explode: the pool is capped by the caller before we get here.
  for (let size = 2; size <= Math.min(maxSize, n); size++) {
    const idx = new Array(size).fill(0).map((_, i) => i);
    for (;;) {
      let sum = 0;
      for (const i of idx) sum += pool[i].amount;
      if (Math.abs(sum - target) <= AGORA) return idx.map((i) => pool[i]);

      let k = size - 1;
      while (k >= 0 && idx[k] === n - size + k) k--;
      if (k < 0) break;
      idx[k]++;
      for (let j = k + 1; j < size; j++) idx[j] = idx[j - 1] + 1;
    }
  }
  return null;
}

export function reconcile(txs: MatchTx[], invoices: MatchInvoice[]): {
  matches: Match[];
  variances: Variance[];
  unmatched_tx: MatchTx[];
  unmatched_invoices: MatchInvoice[];
} {
  const used = new Set<string>();          // invoice ids already attributed
  const matched = new Set<string>();       // bank tx ids already attributed
  const matches: Match[] = [];

  const open = () => invoices.filter((i) => !used.has(i.id));

  // Pass 1 — one transfer, one invoice. Run first and across every transaction,
  // because an exact single is the strongest evidence available and should claim
  // its invoice before any batch search can consume it.
  const exactPass = () => {
  for (const tx of txs) {
    if (matched.has(tx.id)) continue;
    const target = Math.abs(tx.amount);
    const cands = open()
      .filter((i) => Math.abs(i.amount - target) <= AGORA)
      .filter((i) => {
        const g = days(tx.date, i.due_date);
        return g >= -EARLY && g <= LATE;
      })
      .sort((a, b) => Math.abs(days(tx.date, a.due_date)) - Math.abs(days(tx.date, b.due_date)));

    if (!cands.length) continue;
    // Two suppliers with an identical open amount in the same window is a real
    // ambiguity — attributing it to whichever sorted first would be a guess.
    if (cands.length > 1) {
      const g0 = Math.abs(days(tx.date, cands[0].due_date));
      const g1 = Math.abs(days(tx.date, cands[1].due_date));
      if (cands[0].supplier_id !== cands[1].supplier_id && g1 - g0 <= 2) continue;
    }

    const inv = cands[0];
    const gap = days(tx.date, inv.due_date);
    used.add(inv.id); matched.add(tx.id);
    matches.push({
      bank_tx_id: tx.id, bank_date: tx.date, bank_amount: tx.amount,
      supplier_id: inv.supplier_id, supplier_name: inv.supplier_name,
      invoice_ids: [inv.id], method: 'exact', confidence: score(gap, 'exact'), day_gap: gap,
      reason: `סכום זהה לחשבונית ${inv.amount.toLocaleString()} ₪ מ-${inv.invoice_date}, ${gap === 0 ? 'ביום התשלום' : gap > 0 ? `${gap} ימים אחרי מועד התשלום` : `${-gap} ימים לפני מועד התשלום`}`,
    });
  }
  };

  exactPass();

  // Pass 2 — one transfer settling several invoices from the same supplier.
  const batchPass = () => {
  for (const tx of txs) {
    if (matched.has(tx.id)) continue;
    const target = Math.abs(tx.amount);

    const bySupplier = new Map<string, MatchInvoice[]>();
    for (const i of open()) {
      const g = days(tx.date, i.due_date);
      if (g < -EARLY || g > LATE) continue;
      if (i.amount > target + AGORA) continue;     // cannot be part of a smaller sum
      if (!bySupplier.has(i.supplier_id)) bySupplier.set(i.supplier_id, []);
      bySupplier.get(i.supplier_id)!.push(i);
    }

    let best: { subset: MatchInvoice[]; sup: MatchInvoice } | null = null;
    for (const [, pool] of bySupplier) {
      if (pool.length < 2) continue;
      // Cap the pool at the 12 invoices closest to this payment date; beyond
      // that the search cost climbs and the evidence gets thinner anyway.
      const capped = [...pool]
        .sort((a, b) => Math.abs(days(tx.date, a.due_date)) - Math.abs(days(tx.date, b.due_date)))
        .slice(0, 12);
      const subset = findSubset(capped, target, 6);
      if (subset && (!best || subset.length < best.subset.length)) {
        best = { subset, sup: subset[0] };
      }
    }
    if (!best) continue;

    const gaps = best.subset.map((i) => days(tx.date, i.due_date));
    const gap = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    for (const i of best.subset) used.add(i.id);
    matched.add(tx.id);
    matches.push({
      bank_tx_id: tx.id, bank_date: tx.date, bank_amount: tx.amount,
      supplier_id: best.sup.supplier_id, supplier_name: best.sup.supplier_name,
      invoice_ids: best.subset.map((i) => i.id), method: 'batch',
      confidence: score(gap, 'batch'), day_gap: gap,
      reason: `${best.subset.length} חשבוניות של ${best.sup.supplier_name} מסתכמות בדיוק לסכום ההעברה`,
    });
  }
  };

  batchPass();

  // An ambiguity in pass 1 is often resolved by pass 2: once a batch claims the
  // competing invoice, the single candidate that was skipped as "could be either
  // supplier" becomes the only one left. Keep alternating until nothing new
  // lands, so a genuine match is never lost to an ambiguity that no longer
  // exists.
  for (let round = 0; round < 4; round++) {
    const before = matches.length;
    exactPass();
    batchPass();
    if (matches.length === before) break;
  }

  // Pass 3 — near misses. Not matches: a payment that does not equal its
  // invoice is the thing the owner most wants flagged, and quietly pairing them
  // would hide it. Reported with the difference so it can be checked.
  const variances: Variance[] = [];
  const NEAR_PCT = 0.25;          // within a quarter either way
  const NEAR_MIN = 100;           // ignore rounding-scale differences
  // One invoice can only have been paid once. Without this, a supplier with one
  // scanned invoice and six unscanned weekly deliveries produces six "you paid
  // the wrong amount" alerts against the same invoice — all false, and enough
  // noise to make the real ones worthless.
  const claimed = new Set<string>();
  for (const tx of txs) {
    if (matched.has(tx.id)) continue;
    const target = Math.abs(tx.amount);
    let best: { inv: MatchInvoice; diff: number } | null = null;
    for (const inv of open()) {
      if (claimed.has(inv.id)) continue;
      const g = days(tx.date, inv.due_date);
      if (g < -EARLY || g > LATE) continue;
      const diff = target - inv.amount;
      if (Math.abs(diff) < NEAR_MIN) continue;
      if (Math.abs(diff) > inv.amount * NEAR_PCT) continue;
      if (!best || Math.abs(diff) < Math.abs(best.diff)) best = { inv, diff };
    }
    if (!best) continue;
    claimed.add(best.inv.id);
    variances.push({
      bank_tx_id: tx.id, bank_date: tx.date, bank_amount: tx.amount,
      invoice_id: best.inv.id, supplier_name: best.inv.supplier_name,
      invoice_amount: best.inv.amount, diff: Math.round(best.diff),
      pct: Math.round((best.diff / best.inv.amount) * 100),
      reason: best.diff > 0
        ? `שולם ${target.toLocaleString()} ₪ מול חשבונית של ${best.inv.amount.toLocaleString()} ₪ — עודף ${Math.round(best.diff).toLocaleString()} ₪`
        : `שולם ${target.toLocaleString()} ₪ מול חשבונית של ${best.inv.amount.toLocaleString()} ₪ — חסר ${Math.round(-best.diff).toLocaleString()} ₪`,
    });
  }

  return {
    matches,
    variances,
    unmatched_tx: txs.filter((t) => !matched.has(t.id)),
    unmatched_invoices: invoices.filter((i) => !used.has(i.id)),
  };
}
