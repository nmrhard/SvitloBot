const Fastify = require('fastify');
require('dotenv').config();

const registerRoutes = require('./routes');
const sequelize = require('./config/database');

const PORT = process.env.PORT || 3000;

/**
 * Build and configure Fastify application
 * @returns {Promise<object>} Fastify instance
 */
async function buildApp() {
  const fastify = Fastify({ logger: true });

  await registerRoutes(fastify);

  return fastify;
}

/**
 * Start the application
 */
async function start() {
  const fastify = await buildApp();

  try {
    await sequelize.sync();
    fastify.log.info('Database synced');

    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`Server running on http://localhost:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Export for testing
module.exports = { buildApp };

// Start if run directly
if (require.main === module) {
  start();
}
