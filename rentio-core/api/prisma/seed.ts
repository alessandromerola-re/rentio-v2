import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function pick(...values: Array<string | undefined>) {
  for (const value of values) {
    if (value && value.trim() !== '') return value.trim();
  }
  return '';
}

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@rentio.local';
  const password = process.env.ADMIN_PASSWORD || 'admin12345';
  const hash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash, role: 'admin' },
    create: { email, passwordHash: hash, role: 'admin' }
  });

  const tenantSlug = pick(process.env.SEED_TENANT_SLUG, process.env.RENTIO_TENANT, process.env.EDGE_RENTIO_TENANT);
  const buildingSlug = pick(process.env.SEED_BUILDING_SLUG, process.env.RENTIO_BUILDING, process.env.EDGE_RENTIO_BUILDING);

  if (!tenantSlug || !buildingSlug) {
    return;
  }

  const tenantName = process.env.SEED_TENANT_NAME?.trim() || tenantSlug;
  const buildingName = process.env.SEED_BUILDING_NAME?.trim() || buildingSlug;

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: { name: tenantName },
    create: { slug: tenantSlug, name: tenantName }
  });

  await prisma.building.upsert({
    where: {
      tenantId_slug: {
        tenantId: tenant.id,
        slug: buildingSlug
      }
    },
    update: { name: buildingName },
    create: {
      tenantId: tenant.id,
      slug: buildingSlug,
      name: buildingName
    }
  });
}

main().finally(() => prisma.$disconnect());
