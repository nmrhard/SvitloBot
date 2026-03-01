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

describe('Internal Routes', () => {
  let app;

  beforeAll(async () => {
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
});
