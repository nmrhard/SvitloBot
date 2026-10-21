const { handleOutageReason, runDailyCheck } = require('../controllers');

const nullableString = { type: ['string', 'null'] };

const outageReasonSchema = {
  body: {
    type: 'object',
    properties: {
      eventTime: { type: 'integer' },
      status: { type: 'string', enum: ['found', 'no_outage', 'error'] },
      subType: nullableString,
      startDate: nullableString,
      endDate: nullableString,
      error: nullableString,
    },
    required: ['eventTime', 'status'],
  },
};

/**
 * Register internal routes.
 * @param {object} fastify - Fastify instance
 */
async function internalRoutes(fastify) {
  fastify.post('/internal/daily-check', runDailyCheck);
  fastify.post(
    '/internal/outage-reason',
    { schema: outageReasonSchema },
    handleOutageReason,
  );
}

module.exports = internalRoutes;
