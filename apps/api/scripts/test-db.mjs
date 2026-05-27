import 'dotenv/config';
import pg from 'pg';

const urls = [
  ['DIRECT_URL (port 5432)', process.env.DIRECT_URL],
  ['DATABASE_URL (port 6543)', process.env.DATABASE_URL],
];

for (const [label, url] of urls) {
  if (!url) { console.log(`\n--- ${label}: not set ---`); continue; }
  console.log(`\n--- Trying ${label} ---`);
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const r = await client.query('select current_user, current_database(), version()');
    console.log('✓ OK', r.rows[0]);
    await client.end();
  } catch (err) {
    console.log('✗ FAIL', err.code, err.message);
  }
}
