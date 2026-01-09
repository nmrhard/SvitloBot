const { handleMonitorStatus } = require('../controllers');

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
    { schema: monitorStatusSchema },
    handleMonitorStatus
  );
}

module.exports = monitorRoutes;

