// apps/api/scripts/test-club-api.ts
// הרצה: $env:CLUB_API_KEY="..."; npx tsx scripts/test-club-api.ts
// דורש ש-dev server רץ ו-CLUB_API_KEY מוגדר באותו מפתח.

const BASE = process.env.CLUB_API_BASE ?? 'http://localhost:3001/api/club';
const KEY = process.env.CLUB_API_KEY;
if (!KEY) {
  console.error('CLUB_API_KEY env required');
  process.exit(1);
}

const TEST_PHONE = `055${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Alena-Club-Key': KEY! },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

function assert(cond: boolean, msg: string, extra?: unknown) {
  if (!cond) {
    console.error('✗', msg);
    if (extra !== undefined) console.error('  ', JSON.stringify(extra));
    process.exit(1);
  }
  console.log('✓', msg);
}

console.log('--- club api integration test ---');
console.log('phone:', TEST_PHONE);
console.log('base:', BASE);

// 1. Ping
{
  const r = await call('GET', '/ping');
  assert(r.status === 200, 'ping 200', r);
}

// 2. Lookup unknown
{
  const r = await call('POST', '/lookup', { phone: TEST_PHONE });
  assert(r.status === 200 && (r.body as any).found === false, 'lookup returns found:false for unknown', r);
}

// 3. Register new
let registeredFresh = false;
{
  const r = await call('POST', '/register', { phone: TEST_PHONE, name: 'בדיקה', marketing_consent: true });
  assert(r.status === 201, 'register returns 201 for new', r);
  assert((r.body as any).loyalty_tier === 'regular', 'new customer is regular tier', r);
  registeredFresh = true;
}

// 4. Register again (idempotent)
{
  const r = await call('POST', '/register', { phone: TEST_PHONE, name: 'בדיקה', marketing_consent: true });
  assert(r.status === 200, 'register idempotent → 200', r);
  assert((r.body as any).existing === true, 'register reports existing:true', r);
}

// 5. Lookup now finds
{
  const r = await call('POST', '/lookup', { phone: TEST_PHONE });
  assert((r.body as any).found === true, 'lookup finds registered customer', r);
}

// 6. First order — 120 ILS → 120 coins
{
  const r = await call('POST', '/orders', { phone: TEST_PHONE, order_total: 120, order_id: 'wc-int-1' });
  assert(r.status === 200, 'orders 200', r);
  assert((r.body as any).coins_earned === 120, 'earned 120 coins for 120 ILS', r);
  assert((r.body as any).visit_count === 1, 'visit_count=1', r);
  assert((r.body as any).new_tier === 'silver', 'tier=silver at 120 coins', r);
}

// 7. Second order — bump to 170, still silver
{
  const r = await call('POST', '/orders', { phone: TEST_PHONE, order_total: 50, order_id: 'wc-int-2' });
  assert((r.body as any).new_balance === 170, 'balance=170 after 2nd order', r);
  assert((r.body as any).visit_count === 2, 'visit_count=2', r);
}

// 8. Third order — push to 320, gold
{
  const r = await call('POST', '/orders', { phone: TEST_PHONE, order_total: 150, order_id: 'wc-int-3' });
  assert((r.body as any).new_balance === 320, 'balance=320 after 3rd order', r);
  assert((r.body as any).new_tier === 'gold', 'tier=gold at 320 coins', r);
}

// 9. Benefits — empty array for fresh customer
{
  const r = await call('GET', `/benefits/${TEST_PHONE}`);
  assert(r.status === 200, 'benefits 200', r);
  assert(Array.isArray((r.body as any).benefits), 'benefits is array', r);
}

// 10. Bad key rejected
{
  const res = await fetch(BASE + '/ping', { headers: { 'X-Alena-Club-Key': 'wrong' } });
  assert(res.status === 401, 'wrong key → 401');
}

// 11. Bad phone validation
{
  const r = await call('POST', '/lookup', { phone: 'x' });
  assert(r.status === 400, 'bad phone → 400', r);
}

// 12. Order for unknown customer → 404
{
  const fakePhone = `055${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
  const r = await call('POST', '/orders', { phone: fakePhone, order_total: 50, order_id: 'wc-int-unknown' });
  assert(r.status === 404, 'order for unknown customer → 404', r);
}

console.log('\n✅ all club api checks passed');
console.log('test customer phone:', TEST_PHONE, registeredFresh ? '(fresh — left in DB for manual inspection)' : '');
