import mqtt from 'mqtt';
import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { parseSysStatusPayload, parseTopic, safeCreateEvent, validateEnvelope } from './mqttUtils.js';

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
      const gateway = await upsertGateway(parsed.tenant, parsed.building, parsed.gateway);
      const raw = payloadBuf.toString('utf8');

      // sys/status is plain retained string by contract usage examples.
      if (parsed.channel === 'sys' && parsed.subpath === 'status') {
        const status = parseSysStatusPayload(raw);
        await prisma.gateway.update({
          where: { id: gateway.id },
          data: { status, lastSeenAt: new Date() }
        });

        await safeCreateEvent({
          tenantId: gateway.tenantId,
          buildingId: gateway.buildingId,
          gatewayDbId: gateway.id,
          eventId: crypto.randomUUID(),
          type: 'status',
          channel: 'sys',
          topic,
          ts: new Date(),
          payload: { status }
        });

        console.log(JSON.stringify({ gateway_id: gateway.gatewayId, channel: parsed.channel, event_id: 'sys-status' }));
        return;
      }

      const payload = validateEnvelope(JSON.parse(raw));
      const ts = new Date(payload.ts as string);

      await prisma.gateway.update({ where: { id: gateway.id }, data: { lastSeenAt: new Date() } });

      if (['evt', 'tele', 'ack'].includes(parsed.channel)) {
        await safeCreateEvent({
          tenantId: gateway.tenantId,
          buildingId: gateway.buildingId,
          gatewayDbId: gateway.id,
          eventId: payload.id as string,
          type: parsed.subpath || parsed.channel,
          channel: parsed.channel,
          topic,
          ts,
          payload: payload as object
        });
      }

      if (parsed.channel === 'state') {
        await prisma.deviceState.upsert({
          where: { gatewayDbId_key: { gatewayDbId: gateway.id, key: parsed.subpath } },
          update: { ts, value: payload.data as object },
          create: {
            tenantId: gateway.tenantId,
            buildingId: gateway.buildingId,
            gatewayDbId: gateway.id,
            key: parsed.subpath,
            ts,
            value: payload.data as object
          }
        });

        await safeCreateEvent({
          tenantId: gateway.tenantId,
          buildingId: gateway.buildingId,
          gatewayDbId: gateway.id,
          eventId: payload.id as string,
          type: parsed.subpath || 'state',
          channel: parsed.channel,
          topic,
          ts,
          payload: payload as object
        });
      }

      if (parsed.channel === 'evt' && parsed.subpath === 'system/hello') {
        await handleProvisioning(gateway, (payload.data as { token?: string })?.token);
      }

      console.log(JSON.stringify({ gateway_id: gateway.gatewayId, channel: parsed.channel, event_id: payload.id }));
    } catch (err) {
      console.error(JSON.stringify({ msg: 'mqtt ingestion error', error: (err as Error).message, topic }));
    }
  });

  return () => client.end(true);
}

async function upsertGateway(tenantSlug: string, buildingSlug: string, gatewayId: string) {
  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: {},
    create: { id: crypto.randomUUID(), slug: tenantSlug, name: tenantSlug }
  });

  const building = await prisma.building.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: buildingSlug } },
    update: {},
    create: { id: crypto.randomUUID(), tenantId: tenant.id, slug: buildingSlug, name: buildingSlug }
  });

  // TODO: disable implicit auto-registration in production.
  return prisma.gateway.upsert({
    where: { tenantId_buildingId_gatewayId: { tenantId: tenant.id, buildingId: building.id, gatewayId } },
    update: { lastSeenAt: new Date() },
    create: {
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      buildingId: building.id,
      gatewayId,
      name: gatewayId,
      status: 'online',
      lastSeenAt: new Date()
    }
  });
}

async function handleProvisioning(gateway: { tenantId: string; buildingId: string }, token?: string) {
  if (!token) return;

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const found = await prisma.provisioningToken.findFirst({
    where: {
      tenantId: gateway.tenantId,
      buildingId: gateway.buildingId,
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() }
    }
  });

  if (found) {
    await prisma.provisioningToken.update({ where: { id: found.id }, data: { usedAt: new Date() } });
  }
}
