const { secureCompare } = require('../utils/secureCompare');

/**
 * Verify the monitor webhook secret from `x-webhook-secret` header
 * or `secret` query param (for providers that cannot set headers).
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 */
async function verifyWebhookSecret(request, reply) {
  const configuredSecret = process.env.MONITOR_WEBHOOK_SECRET;

  if (!configuredSecret) {
    request.log.error('MONITOR_WEBHOOK_SECRET is not configured, rejecting webhook');
    return reply.code(503).send({ error: 'MONITOR_WEBHOOK_SECRET is not configured' });
  }

  const providedSecret = request.headers['x-webhook-secret'] ?? request.query?.secret;

  if (!secureCompare(providedSecret, configuredSecret)) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
}

module.exports = {
  verifyWebhookSecret,
};
