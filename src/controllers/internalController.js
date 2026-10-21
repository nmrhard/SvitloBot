const { INTERNAL_CHECK_API_KEY } = require('../config/constants');
const {
  processWindowCheck,
  resolveOutageReason,
  restorePendingOutage,
} = require('../services');
const { secureCompare } = require('../utils/secureCompare');

/**
 * Verify internal API key, replying with an error if it is invalid.
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 * @returns {boolean} True if request is authorized
 */
function authorizeInternalRequest(request, reply) {
  const configuredApiKey = process.env.INTERNAL_CHECK_API_KEY || INTERNAL_CHECK_API_KEY;
  const apiKey = request.headers['x-api-key'];
  if (!configuredApiKey) {
    reply.code(503).send({ error: 'INTERNAL_CHECK_API_KEY is not configured' });
    return false;
  }

  if (!secureCompare(apiKey, configuredApiKey)) {
    reply.code(401).send({ error: 'Unauthorized' });
    return false;
  }

  return true;
}

/**
 * Execute one scheduler check via protected endpoint.
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 */
async function runDailyCheck(request, reply) {
  if (!authorizeInternalRequest(request, reply)) return;

  // Safety net: send offline message whose reason timeout was lost on restart
  try {
    await restorePendingOutage(request.log);
  } catch (error) {
    request.log.error('Error restoring pending outage:', error.message);
  }

  const windowInfo = await processWindowCheck(request.log);
  reply.send({
    ok: true,
    window: {
      isActive: windowInfo.isActive,
      isFinalCheck: windowInfo.isFinalCheck,
      nowInZone: windowInfo.nowInZone?.toISOString?.() || null,
      windowStart: windowInfo.windowStart?.toISOString?.() || null,
      windowEnd: windowInfo.windowEnd?.toISOString?.() || null,
    },
  });
}

/**
 * Receive DTEK outage reason from GitHub Actions scraper.
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 */
async function handleOutageReason(request, reply) {
  if (!authorizeInternalRequest(request, reply)) return;

  if (request.body.status === 'error') {
    request.log.warn(`DTEK reason lookup failed: ${request.body.error}`);
  }

  const applied = await resolveOutageReason(request.body, request.log);
  if (!applied) {
    request.log.warn(`No pending offline message for event ${request.body.eventTime}`);
  }

  reply.send({ ok: true, applied });
}

module.exports = {
  handleOutageReason,
  runDailyCheck,
};
