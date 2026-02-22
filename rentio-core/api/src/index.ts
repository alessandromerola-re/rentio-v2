import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { config } from './config.js';
import { prisma } from './prisma.js';
import { startMqttIngestion } from './mqtt.js';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(jwt, { secret: config.jwtSecret });

type UserClaims = { sub: string; role: string; tenantId?: string | null };

function requireRole(roles: string[]) {
  return async (request: any, reply: any) => {
    try {
      await request.jwtVerify<UserClaims>();
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    if (!roles.includes(request.user.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  };
}

app.get('/health', async () => ({ ok: true }));

app.post('/auth/login', async (request, reply) => {
  const body = (request.body || {}) as { email?: string; password?: string };
  if (!body.email || !body.password) {
    return reply.code(400).send({ error: 'email and password are required' });
  }

  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    return reply.code(401).send({ error: 'invalid credentials' });
  }

  const token = await reply.jwtSign({ sub: user.id, role: user.role, tenantId: user.tenantId });
  return { token };
});

app.post('/tenants', { preHandler: requireRole(['admin']) }, async (req, reply) => {
  const body = (req.body || {}) as { slug?: string; name?: string };
  if (!body.slug || !body.name) return reply.code(400).send({ error: 'slug and name are required' });
  return prisma.tenant.create({ data: { slug: body.slug, name: body.name } });
});

app.post('/tenants/:tenantId/buildings', { preHandler: requireRole(['admin', 'operator']) }, async (req, reply) => {
  const { tenantId } = req.params as { tenantId: string };
  const body = (req.body || {}) as { slug?: string; name?: string };
  if (!body.slug || !body.name) return reply.code(400).send({ error: 'slug and name are required' });
  return prisma.building.create({ data: { tenantId, slug: body.slug, name: body.name } });
});

app.post('/tenants/:tenantId/buildings/:buildingId/provisioning-token', { preHandler: requireRole(['admin', 'operator']) }, async (req) => {
  const { tenantId, buildingId } = req.params as { tenantId: string; buildingId: string };
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
  await prisma.provisioningToken.create({
    data: {
      id: crypto.randomUUID(),
      tenantId,
      buildingId,
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      expiresAt
    }
  });
  return { token, expiresAt };
});

app.get('/gateways', { preHandler: requireRole(['admin', 'operator', 'owner', 'guest']) }, async (req) => {
  const q = req.query as { tenant?: string; building?: string; gateway?: string; status?: string };
  return prisma.gateway.findMany({
    where: {
      gatewayId: q.gateway,
      status: q.status,
      tenant: q.tenant ? { slug: q.tenant } : undefined,
      building: q.building ? { slug: q.building } : undefined
    },
    include: { tenant: true, building: true },
    orderBy: { createdAt: 'desc' }
  });
});

app.get('/events', { preHandler: requireRole(['admin', 'operator', 'owner', 'guest']) }, async (req) => {
  const q = req.query as {
    tenant?: string;
    building?: string;
    gateway?: string;
    channel?: string;
    type?: string;
    from?: string;
    to?: string;
    limit?: string;
  };

  return prisma.event.findMany({
    where: {
      channel: q.channel,
      type: q.type,
      ts: {
        gte: q.from ? new Date(q.from) : undefined,
        lte: q.to ? new Date(q.to) : undefined
      },
      tenant: q.tenant ? { slug: q.tenant } : undefined,
      building: q.building ? { slug: q.building } : undefined,
      gateway: q.gateway ? { gatewayId: q.gateway } : undefined
    },
    take: Number(q.limit || 200),
    orderBy: { ts: 'desc' }
  });
});

app.get('/device-states', { preHandler: requireRole(['admin', 'operator', 'owner', 'guest']) }, async (req) => {
  const q = req.query as { tenant?: string; building?: string; gateway?: string; key?: string };
  return prisma.deviceState.findMany({
    where: {
      key: q.key,
      tenant: q.tenant ? { slug: q.tenant } : undefined,
      building: q.building ? { slug: q.building } : undefined,
      gateway: q.gateway ? { gatewayId: q.gateway } : undefined
    },
    orderBy: { updatedAt: 'desc' }
  });
});

const stopMqtt = startMqttIngestion(config.mqttUrl);

await app.listen({ host: '0.0.0.0', port: config.port });

async function shutdown() {
  stopMqtt();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
