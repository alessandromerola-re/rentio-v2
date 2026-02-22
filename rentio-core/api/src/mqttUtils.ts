import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export function parseTopic(topic: string) {
  const parts = topic.split('/');
  if (parts.length < 8 || parts[0] !== 'rentio' || parts[1] !== 'v1' || parts[4] !== 'gw') throw new Error('invalid topic');
  return { tenant: parts[2], building: parts[3], gateway: parts[5], channel: parts[6], subpath: parts.slice(7).join('/') };
}

export function validateEnvelope(payload: any) {
  for (const key of ['v', 'id', 'ts', 'tenant', 'building', 'gateway', 'data']) {
    if (payload[key] === undefined || payload[key] === null) throw new Error(`invalid envelope: ${key}`);
  }
  return payload;
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
