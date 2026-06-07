import { prisma } from '../src/db.js';

async function main() {
  const templates = [
    { name: 'מבצע קינוחים', dish_label: 'קינוח', emoji: '🍰', default_target: 30, default_coins_per_sale: 50, sort_order: 1 },
    { name: 'ספיישל יומי', dish_label: 'ספיישל יומי', emoji: '⭐', default_target: 20, default_coins_per_sale: 60, sort_order: 2 },
    { name: 'שדרוג ליין', dish_label: 'שדרוג ליין', emoji: '🍷', default_target: 15, default_coins_per_sale: 75, sort_order: 3 },
    { name: 'מנה ראשונה לכולם', dish_label: 'מנה ראשונה', emoji: '🥗', default_target: 25, default_coins_per_sale: 40, sort_order: 4 },
    { name: 'בקבוק יין', dish_label: 'בקבוק יין', emoji: '🍾', default_target: 10, default_coins_per_sale: 100, sort_order: 5 },
  ];
  for (const t of templates) {
    const existing = await (prisma as any).salesGoalTemplate.findFirst({ where: { name: t.name } });
    if (existing) {
      console.log(`SKIP ${t.name} (exists)`);
      continue;
    }
    await (prisma as any).salesGoalTemplate.create({ data: t });
    console.log(`CREATED ${t.name}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
