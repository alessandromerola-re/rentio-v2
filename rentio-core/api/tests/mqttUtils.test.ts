import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { parseTopic, safeCreateEvent, validateEnvelope } from '../src/mqttUtils.js';

describe('parseTopic', () => {
  it('parses valid topics', () => {
    const parsed = parseTopic('rentio/v1/windome/casagiove-01/gw/gw-0001/evt/access/opened');
    expect(parsed.channel).toBe('evt');
    expect(parsed.subpath).toBe('access/opened');
  });
});

describe('validateEnvelope', () => {
  it('validates required fields', () => {
    expect(() => validateEnvelope({ v: '1', id: 'a', ts: '2024-01-01T00:00:00Z', tenant: 't', building: 'b', gateway: 'g', data: {} })).not.toThrow();
    expect(() => validateEnvelope({ id: 'a' })).toThrow(/v/);
  });
});

describe('safeCreateEvent', () => {
  it('returns false for unique violations', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
    const ok = await safeCreateEvent({} as any, async () => { throw err; });
    expect(ok).toBe(false);
  });
});
