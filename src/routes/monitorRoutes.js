const { handleMonitorStatus } = require('../controllers');
const { verifyWebhookSecret } = require('../middleware/webhookSecret');

const monitorStatusSchema = {
  body: {
    type: 'object',
    properties: {
      monitor_status: { type: 'string' },
      timestamp: { type: 'integer' },
    },
    required: ['monitor_status', 'timestamp'],
  },
};

/**
 * Register monitor routes
 * @param {object} fastify - Fastify instance
 */
async function monitorRoutes(fastify) {
  fastify.post(
    '/',
    // onRequest runs before body validation, so unauthenticated calls get 401
    { schema: monitorStatusSchema, onRequest: verifyWebhookSecret },
    handleMonitorStatus
  );
}

module.exports = monitorRoutes;

