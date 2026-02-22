import mqtt from 'mqtt';
import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { getGatewayStatusFromEnvelope, parseTopic, safeCreateEvent, validateEnvelope } from './mqttUtils.js';

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
      const envelope = validateEnvelope(JSON.parse(payloadBuf.toString('utf8')));
      const ts = new Date(envelope.ts);

      const gateway = await upsertGateway(parsed.tenant, parsed.building, parsed.gateway);
      await prisma.gateway.update({ where: { id: gateway.id }, data: { lastSeenAt: new Date() } });

      if (parsed.channel === 'sys' && parsed.subpath === 'status') {
        await prisma.gateway.update({ where: { id: gateway.id }, data: { status: getGatewayStatusFromEnvelope(envelope) } });
      }

      if (['evt', 'tele', 'ack', 'sys'].includes(parsed.channel)) {
        await safeCreateEvent({
          tenantId: gateway.tenantId,
          buildingId: gateway.buildingId,
          gatewayDbId: gateway.id,
          eventId: envelope.id,
          type: parsed.subpath || parsed.channel,
          channel: parsed.channel,
          topic,
          ts,
          payload: envelope as unknown as object
        });
      }

      if (parsed.channel === 'state') {
        await prisma.deviceState.upsert({
          where: { gatewayDbId_key: { gatewayDbId: gateway.id, key: parsed.subpath } },
          update: { ts, value: envelope.data },
          create: {
            tenantId: gateway.tenantId,
            buildingId: gateway.buildingId,
            gatewayDbId: gateway.id,
            key: parsed.subpath,
            ts,
            value: envelope.data
          }
        });
        await safeCreateEvent({
          tenantId: gateway.tenantId,
          buildingId: gateway.buildingId,
          gatewayDbId: gateway.id,
          eventId: envelope.id,
          type: parsed.subpath || 'state',
          channel: parsed.channel,
          topic,
          ts,
          payload: envelope as unknown as object
        });
      }

      if (parsed.channel === 'evt' && parsed.subpath === 'system/hello') {
        await handleProvisioning(gateway, envelope.data?.token as string | undefined);
      }

      console.log(JSON.stringify({ tenant: parsed.tenant, building: parsed.building, gateway: parsed.gateway, channel: parsed.channel, event_id: envelope.id }));
    } catch (err) {
      console.error(JSON.stringify({ msg: 'mqtt ingestion error', error: (err as Error).message, topic }));
    }
  });

  return () => client.end(true);
}

async function upsertGateway(tenantSlug: string, buildingSlug: string, gatewayId: string) {
  const tenant = await prisma.tenant.upsert({ where: { slug: tenantSlug }, update: {}, create: { id: crypto.randomUUID(), slug: tenantSlug, name: tenantSlug } });
  const building = await prisma.building.upsert({ where: { tenantId_slug: { tenantId: tenant.id, slug: buildingSlug } }, update: {}, create: { id: crypto.randomUUID(), tenantId: tenant.id, slug: buildingSlug, name: buildingSlug } });
  // TODO: disable implicit auto-registration in production.
  return prisma.gateway.upsert({ where: { tenantId_buildingId_gatewayId: { tenantId: tenant.id, buildingId: building.id, gatewayId } }, update: { lastSeenAt: new Date() }, create: { id: crypto.randomUUID(), tenantId: tenant.id, buildingId: building.id, gatewayId, name: gatewayId, status: 'offline', lastSeenAt: new Date() } });
}

async function handleProvisioning(gateway: { tenantId: string; buildingId: string }, token?: string) {
  if (!token) return;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const found = await prisma.provisioningToken.findFirst({ where: { tenantId: gateway.tenantId, buildingId: gateway.buildingId, tokenHash, usedAt: null, expiresAt: { gt: new Date() } } });
  if (found) await prisma.provisioningToken.update({ where: { id: found.id }, data: { usedAt: new Date() } });
}
