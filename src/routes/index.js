const configRoutes = require('./configRoutes');
const healthRoutes = require('./healthRoutes');
const internalRoutes = require('./internalRoutes');
const monitorRoutes = require('./monitorRoutes');

/**
 * Register all routes
 * @param {object} fastify - Fastify instance
 */
async function registerRoutes(fastify) {
  await fastify.register(configRoutes);
  await fastify.register(healthRoutes);
  await fastify.register(internalRoutes);
  await fastify.register(monitorRoutes);
}

module.exports = registerRoutes;

