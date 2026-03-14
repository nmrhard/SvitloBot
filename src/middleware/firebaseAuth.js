const { getFirebaseAuth } = require('../config/firebase');

async function verifyFirebaseToken(request, reply) {
  const auth = getFirebaseAuth();

  if (!auth) {
    request.log.warn('Firebase Auth not configured, skipping authentication');
    return;
  }

  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header',
    });
  }

  const token = authHeader.slice(7);

  try {
    const decodedToken = await auth.verifyIdToken(token);
    request.user = decodedToken;
  } catch (error) {
    request.log.error('Firebase token verification failed:', error.message);
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
}

module.exports = {
  verifyFirebaseToken,
};
