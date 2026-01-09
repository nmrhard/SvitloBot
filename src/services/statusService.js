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
    return `${baseMessage}\n${getDurationMessage('offline', onlineDuration)}`;
  }

  if (status === 'online' && statusRecord.offlineStart) {
    const offlineDuration = calculateDuration(
      statusRecord.offlineStart,
      currentTime
    );
    return `${baseMessage}\n${getDurationMessage('online', offlineDuration)}`;
  }

  return baseMessage;
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
 * @returns {Promise<string>} Message to send
 */
async function processStatusChange(status, currentTime, logger) {
  const statusRecord = await getOrCreateStatusRecord();

  logger?.info(`Processing status change: ${status}`, { statusRecord });

  const message = buildStatusMessage(status, currentTime, statusRecord);
  await updateStatusRecord(statusRecord, status, currentTime);

  return message;
}

module.exports = {
  buildStatusMessage,
  getOrCreateStatusRecord,
  processStatusChange,
  updateStatusRecord,
};

