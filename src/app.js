// Node's IPv6/IPv4 auto-selection gives each address only 250ms by default,
// which is too short to reach Neon (eu-central-1) from slower networks.
require('net').setDefaultAutoSelectFamilyAttemptTimeout(2000);

const Fastify = require('fastify');
require('dotenv').config();

const registerRoutes = require('./routes');
const sequelize = require('./config/database');
const { restorePendingOutage } = require('./services');

const PORT = process.env.PORT || 3000;

const DEV_CORS_ORIGINS = ['http://localhost:4321'];

/**
 * Allowed browser origins from comma-separated CORS_ORIGINS env.
 * Falls back to the local Astro dev server outside production.
 * @returns {string[]}
 */
function getCorsOrigins() {
  const origins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length > 0) {
    return origins;
  }

  return process.env.NODE_ENV === 'production' ? [] : DEV_CORS_ORIGINS;
}

/**
 * Strip query string values that may carry secrets (e.g. webhook `secret`).
 * @param {string} url - raw request URL
 * @returns {string}
 */
function redactUrl(url) {
  return url.replace(/([?&]secret=)[^&]*/gi, '$1[REDACTED]');
}

/**
 * Build and configure Fastify application
 * @returns {Promise<object>} Fastify instance
 */
async function buildApp() {
  const fastify = Fastify({
    logger: {
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: redactUrl(request.url),
            host: request.host,
            remoteAddress: request.ip,
          };
        },
      },
    },
  });

  // Auth uses Bearer headers, not cookies, so credentials are not needed
  await fastify.register(require('@fastify/cors'), {
    origin: getCorsOrigins(),
  });

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

    await restorePendingOutage(fastify.log);

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
