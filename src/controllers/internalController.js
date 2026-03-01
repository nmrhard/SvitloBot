const { INTERNAL_CHECK_API_KEY } = require('../config/constants');
const { processWindowCheck } = require('../services');

/**
 * Execute one scheduler check via protected endpoint.
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 */
async function runDailyCheck(request, reply) {
  const configuredApiKey = process.env.INTERNAL_CHECK_API_KEY || INTERNAL_CHECK_API_KEY;
  const apiKey = request.headers['x-api-key'];
  if (!configuredApiKey) {
    reply.code(503).send({ error: 'INTERNAL_CHECK_API_KEY is not configured' });
    return;
  }

  if (apiKey !== configuredApiKey) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
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

module.exports = {
  runDailyCheck,
};
