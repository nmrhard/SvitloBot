import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

process.env.INTERNAL_CHECK_API_KEY = 'test-internal-key';

vi.mock('../../services', () => ({
  processWindowCheck: vi.fn(async () => ({
    isActive: false,
    isFinalCheck: false,
    nowInZone: new Date('2026-02-27T10:00:00.000Z'),
    windowEnd: new Date('2026-02-27T22:00:00.000Z'),
    windowStart: new Date('2026-02-27T20:00:00.000Z'),
  })),
}));

import { buildApp } from '../../app';
import PendingOutage from '../../models/PendingOutage';

describe('Internal Routes', () => {
  let app;

  beforeAll(async () => {
    await PendingOutage.sync({ force: true });
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should reject request without API key', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/internal/daily-check',
    });

    expect(response.statusCode).toBe(401);
  });

  it('should execute daily check with valid API key', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/internal/daily-check',
      headers: {
        'x-api-key': 'test-internal-key',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        ok: true,
      }),
    );
  });

  describe('POST /internal/outage-reason', () => {
    const payload = { eventTime: 1729699200, status: 'error', error: 'blocked' };

    it('should reject request without API key', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/outage-reason',
        payload,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject invalid status', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/outage-reason',
        headers: { 'x-api-key': 'test-internal-key' },
        payload: { ...payload, status: 'unknown' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should apply reason to matching pending message', async () => {
      await PendingOutage.upsert({
        id: 1,
        eventTime: 1729699200,
        message: 'pending offline message',
        deadlineAt: Math.floor(Date.now() / 1000) + 180,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/internal/outage-reason',
        headers: { 'x-api-key': 'test-internal-key' },
        payload,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true, applied: true });
      expect((await PendingOutage.findByPk(1)).eventTime).toBeNull();
    });

    it('should report stale callback as not applied', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/outage-reason',
        headers: { 'x-api-key': 'test-internal-key' },
        payload: { ...payload, eventTime: 1 },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true, applied: false });
    });
  });
});
