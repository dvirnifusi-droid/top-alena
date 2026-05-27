/**
 * Create or promote an admin user.
 *
 *   tsx scripts/create-admin.ts you@example.com YourStrongPassword
 *
 * - If the user doesn't exist, creates one with role=admin.
 * - If the user exists, promotes them to admin and (optionally) resets the password.
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [, , email, password] = process.argv;
  if (!email) {
    console.error('Usage: tsx scripts/create-admin.ts <email> [password]');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const data: any = { role: 'admin' };
    if (password) data.passwordHash = await bcrypt.hash(password, 10);
    const u = await prisma.user.update({ where: { email }, data });
    console.log(`✓ promoted ${u.email} to admin${password ? ' (password reset)' : ''}`);
  } else {
    if (!password) {
      console.error('password required to create a new user');
      process.exit(1);
    }
    const u = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(password, 10), role: 'admin' },
    });
    console.log(`✓ created admin ${u.email}`);
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
