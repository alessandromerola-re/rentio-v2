import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

const CHANNELS = new Set(['cmd', 'ack', 'evt', 'state', 'tele', 'sys']);

export type ParsedTopic = {
  tenant: string;
  building: string;
  gateway: string;
  channel: string;
  subpath: string;
};

export type Envelope = {
  v: string;
  id: string;
  ts: string;
  src?: string;
  tenant: string;
  building: string;
  gateway: string;
  data: Record<string, unknown>;
  corr?: string;
};

export function parseTopic(topic: string): ParsedTopic {
  const parts = topic.split('/');
  if (parts.length < 8 || parts[0] !== 'rentio' || parts[1] !== 'v1' || parts[4] !== 'gw') throw new Error('invalid topic');
  const channel = parts[6];
  if (!CHANNELS.has(channel)) throw new Error(`invalid channel: ${channel}`);
  return { tenant: parts[2], building: parts[3], gateway: parts[5], channel, subpath: parts.slice(7).join('/') };
}

export function validateEnvelope(payload: unknown): Envelope {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid envelope: object required');
  const obj = payload as Record<string, unknown>;
  for (const key of ['v', 'id', 'ts', 'tenant', 'building', 'gateway', 'data']) {
    if (obj[key] === undefined || obj[key] === null) throw new Error(`invalid envelope: ${key}`);
  }
  return obj as Envelope;
}

export function getGatewayStatusFromEnvelope(env: Envelope): 'online' | 'offline' {
  const status = String(env.data?.status || '').toLowerCase();
  if (status !== 'online' && status !== 'offline') throw new Error('invalid sys/status envelope');
  return status;
}

export async function safeCreateEvent(
  data: Prisma.EventUncheckedCreateInput,
  createFn: (args: { data: Prisma.EventUncheckedCreateInput }) => Promise<unknown> = (args) => prisma.event.create(args)
) {
  try {
    await createFn({ data });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
    throw error;
  }
}
