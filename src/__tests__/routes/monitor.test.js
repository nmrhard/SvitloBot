import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';

// Mock external dependencies before importing app
vi.mock('node-fetch', () => ({
  default: vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    })
  ),
}));

vi.mock('../../config/database', () => ({
  default: {
    sync: vi.fn(() => Promise.resolve()),
    define: vi.fn(() => ({
      findByPk: vi.fn(),
      create: vi.fn(),
    })),
  },
}));

vi.mock('../../models', () => ({
  OfflineStatus: {
    findByPk: vi.fn(() =>
      Promise.resolve({
        onlineStart: null,
        offlineStart: null,
        update: vi.fn(() => Promise.resolve()),
      })
    ),
    create: vi.fn(() =>
      Promise.resolve({
        id: 1,
        onlineStart: null,
        offlineStart: null,
        update: vi.fn(() => Promise.resolve()),
      })
    ),
  },
}));

// Set required env vars
process.env.CHAT_ID = 'test-chat-id';
process.env.API_TOKEN = 'test-token';
process.env.THREAD_ID = 'test-thread-id';
process.env.DATABASE_URL = 'postgres://test';

import { buildApp } from '../../app';

describe('Monitor Routes', () => {
  let app;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /', () => {
    it('should accept valid monitor status payload', async () => {
      // Arrange
      const payload = {
        monitor_status: 'offline',
        timestamp: 1729699200,
      };

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
    });

    it('should accept online status', async () => {
      // Arrange
      const payload = {
        monitor_status: 'online',
        timestamp: 1729699200,
      };

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
    });

    it('should reject invalid payload missing monitor_status', async () => {
      // Arrange
      const payload = {
        timestamp: 1729699200,
      };

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload,
      });

      // Assert
      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid payload missing timestamp', async () => {
      // Arrange
      const payload = {
        monitor_status: 'offline',
      };

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload,
      });

      // Assert
      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /', () => {
    it('should return health check response', async () => {
      // Act
      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ message: 'Request received' });
    });
  });
});

