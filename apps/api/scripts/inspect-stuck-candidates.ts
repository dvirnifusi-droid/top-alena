// One-off: dump every field for the 3 candidates that landed during the bug.
// Run from apps/api:  npx tsx scripts/inspect-stuck-candidates.ts
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const names = ['מורן הררי', 'עידן דוד ביתן פרס', 'דביר ניפוסי'];
  const rows = await db.jobCandidate.findMany({
    where: { full_name: { in: names } },
    orderBy: { created_date: 'desc' },
  });
  for (const r of rows) {
    console.log('---', r.full_name, '---');
    console.log(JSON.stringify(r, null, 2));
  }
  console.log(`\nfound ${rows.length} record(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
