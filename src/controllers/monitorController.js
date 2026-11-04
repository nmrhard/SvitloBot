const {
  isOutageReasonEnabled,
  processStatusChange,
  sendMessage,
  startReasonLookup,
  stopReasonLookup,
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
    // Reason lookup failures must never block status messages
    if (status !== 'offline') {
      try {
        await stopReasonLookup(request.log);
      } catch (error) {
        request.log.error('Error stopping outage reason lookup:', error.message);
      }
    }

    const response = await sendMessage(message, request.log);

    if (status === 'offline' && isOutageReasonEnabled()) {
      try {
        // DTEK reason is added to this message later via edit
        await startReasonLookup(
          message,
          currentTime,
          response?.result?.message_id,
          request.log,
        );
      } catch (error) {
        request.log.error('Error starting outage reason lookup:', error.message);
      }
    }
  }

  reply.send({ success: true });
}

module.exports = {
  handleMonitorStatus,
};
