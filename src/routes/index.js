const healthRoutes = require('./healthRoutes');
const monitorRoutes = require('./monitorRoutes');

/**
 * Register all routes
 * @param {object} fastify - Fastify instance
 */
async function registerRoutes(fastify) {
  await fastify.register(healthRoutes);
  await fastify.register(monitorRoutes);
}

module.exports = registerRoutes;

