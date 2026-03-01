const { runDailyCheck } = require('../controllers');

/**
 * Register internal routes.
 * @param {object} fastify - Fastify instance
 */
async function internalRoutes(fastify) {
  fastify.post('/internal/daily-check', runDailyCheck);
}

module.exports = internalRoutes;
