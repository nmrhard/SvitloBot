import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fakeAuth = {
  tokens: new Map(),
  async verifyIdToken(token) {
    if (!this.tokens.has(token)) {
      throw new Error('invalid token');
    }
    return this.tokens.get(token);
  },
};

const firebaseConfig = { auth: null };

import { createVerifyFirebaseToken } from '../../middleware/firebaseAuth';

const verifyFirebaseToken = createVerifyFirebaseToken(() => firebaseConfig.auth);

function createRequest(headers = {}) {
  return {
    headers,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

function createReply() {
  const reply = { statusCode: null, body: null };
  reply.status = (code) => {
    reply.statusCode = code;
    return reply;
  };
  reply.send = (body) => {
    reply.body = body;
    return reply;
  };
  return reply;
}

describe('verifyFirebaseToken', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    firebaseConfig.auth = fakeAuth;
    fakeAuth.tokens.clear();
    fakeAuth.tokens.set('admin-token', { uid: 'admin-uid', admin: true });
    fakeAuth.tokens.set('user-token', { uid: 'user-uid' });
    delete process.env.SKIP_AUTH;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('responds 503 when Firebase Auth is not configured', async () => {
    firebaseConfig.auth = null;
    const reply = createReply();

    await verifyFirebaseToken(createRequest(), reply);

    expect(reply.statusCode).toBe(503);
  });

  it('responds 401 when Authorization header is missing', async () => {
    const reply = createReply();

    await verifyFirebaseToken(createRequest(), reply);

    expect(reply.statusCode).toBe(401);
  });

  it('responds 401 when token is invalid', async () => {
    const reply = createReply();

    await verifyFirebaseToken(createRequest({ authorization: 'Bearer bogus' }), reply);

    expect(reply.statusCode).toBe(401);
  });

  it('responds 403 when user has no admin claim', async () => {
    const reply = createReply();

    await verifyFirebaseToken(createRequest({ authorization: 'Bearer user-token' }), reply);

    expect(reply.statusCode).toBe(403);
  });

  it('attaches decoded token for admin user', async () => {
    const request = createRequest({ authorization: 'Bearer admin-token' });

    await verifyFirebaseToken(request, createReply());

    expect(request.user).toEqual({ uid: 'admin-uid', admin: true });
  });

  it('does not send a response for admin user', async () => {
    const reply = createReply();

    await verifyFirebaseToken(createRequest({ authorization: 'Bearer admin-token' }), reply);

    expect(reply.statusCode).toBeNull();
  });

  it('skips auth in development with SKIP_AUTH even without Firebase', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SKIP_AUTH = 'true';
    firebaseConfig.auth = null;
    const reply = createReply();

    await verifyFirebaseToken(createRequest(), reply);

    expect(reply.statusCode).toBeNull();
  });

  it('ignores SKIP_AUTH outside development', async () => {
    process.env.SKIP_AUTH = 'true';
    const reply = createReply();

    await verifyFirebaseToken(createRequest(), reply);

    expect(reply.statusCode).toBe(401);
  });
});
