import {
  beforeAll,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Set required env vars BEFORE any imports
process.env.CHAT_ID = 'test-chat-id';
process.env.API_TOKEN = 'test-token';
process.env.THREAD_ID = 'test-thread-id';
process.env.DATABASE_URL = 'postgres://localhost:5432/test';
process.env.MONITOR_WEBHOOK_SECRET = 'test-webhook-secret';

const webhookHeaders = { 'x-webhook-secret': 'test-webhook-secret' };

vi.mock('../../services/statusService', () => ({
  processStatusChange: vi.fn(async () => 'mock status message'),
}));

vi.mock('../../services/telegramService', () => ({
  sendMessage: vi.fn(async () => ({ ok: true })),
  sendPhoto: vi.fn(async () => ({ ok: true })),
}));

import { buildApp } from '../../app';
import sequelize from '../../config/database';

describe('Monitor Routes', () => {
  let app;

  beforeAll(async () => {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS status_timestamps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        offlineStart INTEGER NULL,
        onlineStart INTEGER NULL
      );
    `);
    await sequelize.query('DELETE FROM status_timestamps;');
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
        headers: webhookHeaders,
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
        headers: webhookHeaders,
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
        headers: webhookHeaders,
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
        headers: webhookHeaders,
        payload,
      });

      // Assert
      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST / webhook secret', () => {
    const payload = { monitor_status: 'offline', timestamp: 1729699200 };

    it('should reject request without secret', async () => {
      // Act
      const response = await app.inject({ method: 'POST', url: '/', payload });

      // Assert
      expect(response.statusCode).toBe(401);
    });

    it('should reject request with wrong secret', async () => {
      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/',
        headers: { 'x-webhook-secret': 'wrong' },
        payload,
      });

      // Assert
      expect(response.statusCode).toBe(401);
    });

    it('should reject unauthenticated request before body validation', async () => {
      // Act
      const response = await app.inject({ method: 'POST', url: '/', payload: {} });

      // Assert
      expect(response.statusCode).toBe(401);
    });

    it('should accept secret passed as query param', async () => {
      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/?secret=test-webhook-secret',
        payload,
      });

      // Assert
      expect(response.statusCode).toBe(200);
    });

    it('should respond 503 when secret is not configured', async () => {
      // Arrange
      delete process.env.MONITOR_WEBHOOK_SECRET;

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/',
        headers: webhookHeaders,
        payload,
      });

      // Assert
      process.env.MONITOR_WEBHOOK_SECRET = 'test-webhook-secret';
      expect(response.statusCode).toBe(503);
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
