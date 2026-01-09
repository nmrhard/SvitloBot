const { healthCheck } = require('../controllers');

/**
 * Register health check routes
 * @param {object} fastify - Fastify instance
 */
async function healthRoutes(fastify) {
  fastify.get('/', healthCheck);
}

module.exports = healthRoutes;

