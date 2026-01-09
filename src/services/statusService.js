const { OfflineStatus } = require('../models');
const { statuses } = require('../config/constants');
const {
  calculateDuration,
  formatTime,
  getDurationMessage,
} = require('../utils/timeFormatter');

/**
 * Get or create status record
 * @returns {Promise<object>} Status record
 */
async function getOrCreateStatusRecord() {
  let statusRecord = await OfflineStatus.findByPk(1);

  if (!statusRecord) {
    statusRecord = await OfflineStatus.create({
      id: 1,
      offlineStart: null,
      onlineStart: null,
    });
  }

  return statusRecord;
}

/**
 * Build message for status change
 * @param {string} status - 'offline' or 'online'
 * @param {number} currentTime - Current UNIX timestamp
 * @param {object} statusRecord - Database status record
 * @returns {string} Formatted message
 */
function buildStatusMessage(status, currentTime, statusRecord) {
  const formattedTime = formatTime(currentTime);
  const baseMessage = `${statuses[status]}: <b>${formattedTime}</b>`;

  if (status === 'offline' && statusRecord.onlineStart) {
    const onlineDuration = calculateDuration(
      statusRecord.onlineStart,
      currentTime
    );
    // Skip duration if events arrived out of order
    if (onlineDuration) {
      return `${baseMessage}\n${getDurationMessage('offline', onlineDuration)}`;
    }
  }

  if (status === 'online' && statusRecord.offlineStart) {
    const offlineDuration = calculateDuration(
      statusRecord.offlineStart,
      currentTime
    );
    // Skip duration if events arrived out of order
    if (offlineDuration) {
      return `${baseMessage}\n${getDurationMessage('online', offlineDuration)}`;
    }
  }

  return baseMessage;
}

/**
 * Get the last event timestamp from status record
 * @param {object} statusRecord - Database status record
 * @returns {number|null} Last event timestamp
 */
function getLastEventTime(statusRecord) {
  const { offlineStart, onlineStart } = statusRecord;
  if (!offlineStart && !onlineStart) return null;
  if (!offlineStart) return onlineStart;
  if (!onlineStart) return offlineStart;
  return Math.max(offlineStart, onlineStart);
}

/**
 * Check if event should be processed based on timestamp
 * @param {object} statusRecord - Database status record
 * @param {number} currentTime - Current UNIX timestamp
 * @returns {boolean} True if event should be processed
 */
function shouldProcessEvent(statusRecord, currentTime) {
  const lastEventTime = getLastEventTime(statusRecord);
  // Process if no previous event or current time is newer
  return !lastEventTime || currentTime > lastEventTime;
}

/**
 * Update status record in database
 * @param {object} statusRecord - Database status record
 * @param {string} status - 'offline' or 'online'
 * @param {number} currentTime - Current UNIX timestamp
 */
async function updateStatusRecord(statusRecord, status, currentTime) {
  if (status === 'offline') {
    await statusRecord.update({
      offlineStart: currentTime,
      onlineStart: null,
    });
  } else if (status === 'online') {
    await statusRecord.update({
      onlineStart: currentTime,
      offlineStart: null,
    });
  }
}

/**
 * Process status change
 * @param {string} status - 'offline' or 'online'
 * @param {number} currentTime - Current UNIX timestamp
 * @param {object} logger - Fastify logger instance
 * @returns {Promise<string|null>} Message to send or null if event is stale
 */
async function processStatusChange(status, currentTime, logger) {
  const statusRecord = await getOrCreateStatusRecord();

  // Skip stale/out-of-order events
  if (!shouldProcessEvent(statusRecord, currentTime)) {
    logger?.warn(
      `Skipping stale event: ${status} at ${currentTime}, last event was at ${statusRecord.lastEventTime}`
    );
    return null;
  }

  logger?.info(`Processing status change: ${status}`, { statusRecord });

  const message = buildStatusMessage(status, currentTime, statusRecord);
  await updateStatusRecord(statusRecord, status, currentTime);

  return message;
}

module.exports = {
  buildStatusMessage,
  getLastEventTime,
  getOrCreateStatusRecord,
  processStatusChange,
  shouldProcessEvent,
  updateStatusRecord,
};
