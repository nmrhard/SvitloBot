/**
 * Health check endpoint handler
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 */
async function healthCheck(request, reply) {
  reply.send({ message: 'Request received' });
}

module.exports = {
  healthCheck,
};

