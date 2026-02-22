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

app.decorate('auth', async (request: any, reply: any) => {
  try { await request.jwtVerify(); } catch { reply.code(401).send({ error: 'Unauthorized' }); }
});

function requireRole(roles: string[]) {
  return async (request: any, reply: any) => {
    await request.jwtVerify();
    if (!roles.includes(request.user.role)) return reply.code(403).send({ error: 'Forbidden' });
  };
}

app.get('/health', async () => ({ ok: true }));

app.post('/auth/login', async (request, reply) => {
  const { email, password } = request.body as { email: string; password: string };
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return reply.code(401).send({ error: 'invalid credentials' });
  const token = await reply.jwtSign({ sub: user.id, role: user.role, tenantId: user.tenantId });
  return { token };
});

app.post('/tenants', { preHandler: requireRole(['admin']) }, async (req) => prisma.tenant.create({ data: req.body as any }));
app.post('/tenants/:tenantId/buildings', { preHandler: requireRole(['admin', 'operator']) }, async (req) => {
  const { tenantId } = req.params as any;
  const body = req.body as any;
  return prisma.building.create({ data: { tenantId, ...body } });
});
app.post('/tenants/:tenantId/buildings/:buildingId/provisioning-token', { preHandler: requireRole(['admin', 'operator']) }, async (req) => {
  const { tenantId, buildingId } = req.params as any;
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
  await prisma.provisioningToken.create({
    data: { id: crypto.randomUUID(), tenantId, buildingId, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt }
  });
  return { token, expiresAt };
});
app.get('/gateways', { preHandler: requireRole(['admin', 'operator', 'owner', 'guest']) }, async (req) => {
  const q = req.query as any;
  return prisma.gateway.findMany({ where: { gatewayId: q.gatewayId, tenant: q.tenant ? { slug: q.tenant } : undefined }, include: { tenant: true, building: true }, orderBy: { createdAt: 'desc' } });
});
app.get('/events', { preHandler: requireRole(['admin', 'operator', 'owner', 'guest']) }, async (req) => {
  const q = req.query as any;
  return prisma.event.findMany({
    where: {
      channel: q.channel,
      type: q.type,
      tenant: q.tenant ? { slug: q.tenant } : undefined,
      building: q.building ? { slug: q.building } : undefined,
      gateway: q.gateway ? { gatewayId: q.gateway } : undefined
    },
    take: Number(q.limit || 200),
    orderBy: { ts: 'desc' }
  });
});
app.get('/device-states', { preHandler: requireRole(['admin', 'operator', 'owner', 'guest']) }, async () => prisma.deviceState.findMany({ orderBy: { updatedAt: 'desc' } }));

const stopMqtt = startMqttIngestion(config.mqttUrl);

const start = async () => {
  await app.listen({ host: '0.0.0.0', port: config.port });
};
start();

async function shutdown() {
  stopMqtt();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
