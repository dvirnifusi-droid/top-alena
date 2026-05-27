import pg from 'pg';

const password = 'fFFkgtfzfNWtjWAK';
const ref = 'ngeuszdlzafqitxcoxhw';

const candidates = [
  `postgresql://postgres:${password}@db.${ref}.supabase.co:5432/postgres`,
  `postgresql://postgres.${ref}:${password}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`,
  `postgresql://postgres:${password}@db.${ref}.supabase.co:6543/postgres`,
];

for (const url of candidates) {
  const masked = url.replace(password, '***');
  console.log(`\nTrying: ${masked}`);
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
  try {
    await client.connect();
    const r = await client.query('select current_user');
    console.log('  ✓ Connected as', r.rows[0].current_user);
    await client.end();
  } catch (err) {
    console.log('  ✗', err.code || '', err.message?.slice(0, 100));
  }
}
