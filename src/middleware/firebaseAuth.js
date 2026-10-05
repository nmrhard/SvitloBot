const { getFirebaseAuth } = require('../config/firebase');

/**
 * Build the auth preHandler. `getAuth` is injectable for tests.
 * @param {() => object|null} getAuth - returns Firebase Auth or null
 */
function createVerifyFirebaseToken(getAuth) {
  return async function verifyFirebaseToken(request, reply) {
    // Skip authentication in development mode if SKIP_AUTH is set
    if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
      request.log.info('Authentication skipped in development mode');
      request.user = { uid: 'dev-user', email: 'dev@example.com', admin: true };
      return;
    }

    const auth = getAuth();

    // Fail closed: never serve protected routes without a working verifier
    if (!auth) {
      request.log.error('Firebase Auth not configured, rejecting request');
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Authentication is not configured',
      });
    }

    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header',
      });
    }

    const token = authHeader.slice(7);

    let decodedToken;
    try {
      // checkRevoked = true rejects tokens of disabled users or revoked sessions
      decodedToken = await auth.verifyIdToken(token, true);
    } catch (error) {
      request.log.error('Firebase token verification failed:', error.message);
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }

    if (decodedToken.admin !== true) {
      request.log.warn({ uid: decodedToken.uid }, 'User without admin claim denied');
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
    }

    request.user = decodedToken;
  };
}

const verifyFirebaseToken = createVerifyFirebaseToken(getFirebaseAuth);

module.exports = {
  createVerifyFirebaseToken,
  verifyFirebaseToken,
};
