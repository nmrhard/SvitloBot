const {
  flushPendingOutage,
  isOutageReasonEnabled,
  processStatusChange,
  queueOfflineMessage,
  sendMessage,
} = require('../services');

/**
 * Handle monitor status webhook from Hetrix
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 */
async function handleMonitorStatus(request, reply) {
  const { monitor_status: status, timestamp: currentTime } = request.body;

  const message = await processStatusChange(status, currentTime, request.log);

  // Skip sending message for stale/out-of-order events
  if (message) {
    if (status === 'offline' && isOutageReasonEnabled()) {
      // Sent later together with DTEK outage reason
      await queueOfflineMessage(message, currentTime, request.log);
    } else {
      // Keep chronological order if offline message is still waiting for reason
      await flushPendingOutage(request.log);
      await sendMessage(message, request.log);
    }
  }

  reply.send({ success: true });
}

module.exports = {
  handleMonitorStatus,
};
