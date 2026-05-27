import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const r = await client.query(
  "select tablename from pg_tables where schemaname='public' order by tablename",
);
console.log(`Found ${r.rows.length} tables in public schema:`);
for (const row of r.rows) console.log('  -', row.tablename);
await client.end();
