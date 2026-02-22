import mqtt from 'mqtt';
import { prisma } from './prisma.js';
import { parseTopic, validateEnvelope, safeCreateEvent } from './mqttUtils.js';
import crypto from 'node:crypto';

const SUBS = ['evt', 'state', 'tele', 'sys', 'ack'].map((c) => `rentio/v1/+/+/gw/+/${c}/#`);

export function startMqttIngestion(mqttUrl: string) {
  const client = mqtt.connect(mqttUrl, { reconnectPeriod: 2000, keepalive: 30 });

  client.on('connect', () => {
    SUBS.forEach((topic) => client.subscribe(topic, { qos: 1 }));
    console.log(JSON.stringify({ msg: 'mqtt connected', mqttUrl }));
  });

  client.on('message', async (topic, payloadBuf) => {
    try {
      const parsed = parseTopic(topic);
      const payload = JSON.parse(payloadBuf.toString('utf8'));
      const env = validateEnvelope(payload);
      const gateway = await upsertGateway(parsed.tenant, parsed.building, parsed.gateway);
      const ts = new Date(env.ts);

      if (parsed.channel === 'sys' && parsed.subpath === 'status') {
        const status = payloadBuf.toString('utf8').replace(/"/g, '');
        await prisma.gateway.update({ where: { id: gateway.id }, data: { status, lastSeenAt: new Date() } });
      } else {
        await prisma.gateway.update({ where: { id: gateway.id }, data: { lastSeenAt: new Date() } });
      }

      if (['evt', 'tele', 'ack'].includes(parsed.channel)) {
        await safeCreateEvent({
          tenantId: gateway.tenantId,
          buildingId: gateway.buildingId,
          gatewayDbId: gateway.id,
          eventId: env.id,
          type: parsed.subpath || parsed.channel,
          channel: parsed.channel,
          topic,
          ts,
          payload
        });
      }
      if (parsed.channel === 'state') {
        await prisma.deviceState.upsert({
          where: { gatewayDbId_key: { gatewayDbId: gateway.id, key: parsed.subpath } },
          update: { ts, value: payload.data },
          create: {
            tenantId: gateway.tenantId,
            buildingId: gateway.buildingId,
            gatewayDbId: gateway.id,
            key: parsed.subpath,
            ts,
            value: payload.data
          }
        });
        await safeCreateEvent({
          tenantId: gateway.tenantId,
          buildingId: gateway.buildingId,
          gatewayDbId: gateway.id,
          eventId: env.id,
          type: parsed.subpath || 'state',
          channel: parsed.channel,
          topic,
          ts,
          payload
        });
      }

      if (parsed.channel === 'evt' && parsed.subpath === 'system/hello') {
        await handleProvisioning(gateway, payload.data?.token);
      }

      console.log(JSON.stringify({ gateway_id: gateway.gatewayId, channel: parsed.channel, event_id: env.id }));
    } catch (err) {
      console.error(JSON.stringify({ msg: 'mqtt ingestion error', error: (err as Error).message, topic }));
    }
  });

  return () => client.end(true);
}

async function upsertGateway(tenantSlug: string, buildingSlug: string, gatewayId: string) {
  const tenant = await prisma.tenant.upsert({ where: { slug: tenantSlug }, update: {}, create: { id: crypto.randomUUID(), slug: tenantSlug, name: tenantSlug } });
  const building = await prisma.building.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: buildingSlug } },
    update: {},
    create: { id: crypto.randomUUID(), tenantId: tenant.id, slug: buildingSlug, name: buildingSlug }
  });
  // TODO: disable implicit auto-registration in production.
  return prisma.gateway.upsert({
    where: { tenantId_buildingId_gatewayId: { tenantId: tenant.id, buildingId: building.id, gatewayId } },
    update: { lastSeenAt: new Date() },
    create: { id: crypto.randomUUID(), tenantId: tenant.id, buildingId: building.id, gatewayId, name: gatewayId, status: 'online', lastSeenAt: new Date() }
  });
}

async function handleProvisioning(gateway: { tenantId: string; buildingId: string }, token?: string) {
  if (!token) return;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const found = await prisma.provisioningToken.findFirst({
    where: { tenantId: gateway.tenantId, buildingId: gateway.buildingId, tokenHash, usedAt: null, expiresAt: { gt: new Date() } }
  });
  if (found) {
    await prisma.provisioningToken.update({ where: { id: found.id }, data: { usedAt: new Date() } });
  }
}
