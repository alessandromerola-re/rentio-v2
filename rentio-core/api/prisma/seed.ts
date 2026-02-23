import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@rentio.local';
  const password = process.env.ADMIN_PASSWORD || 'admin12345';
  const hash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash, role: 'admin' },
    create: { email, passwordHash: hash, role: 'admin' }
  });
}

main().finally(() => prisma.$disconnect());
