/**
 * Format UNIX timestamp to Ukrainian locale date string
 * @param {number} time - UNIX timestamp in seconds
 * @returns {string} Formatted date string
 */
function formatTime(time) {
  return new Intl.DateTimeFormat('uk-UA', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
    timeZone: 'Europe/Kyiv',
  }).format(new Date(time * 1000));
}

/**
 * Calculate duration between two timestamps
 * @param {number} startTime - Start UNIX timestamp in seconds
 * @param {number} endTime - End UNIX timestamp in seconds
 * @returns {string} Formatted duration string
 */
function calculateDuration(startTime, endTime) {
  const durationMs = (endTime - startTime) * 1000;
  const minutes = Math.floor(durationMs / 60000) % 60;
  const hours = Math.floor(durationMs / 3600000);
  return `${hours}г. ${minutes}хв.`;
}

/**
 * Get duration message based on status
 * @param {string} status - 'offline' or 'online'
 * @param {string} duration - Formatted duration string
 * @returns {string} Duration message
 */
function getDurationMessage(status, duration) {
  return status === 'offline'
    ? `⏳Cвітло було: <b>${duration}</b>`
    : `⏳Cвітло не було: <b>${duration}</b>`;
}

module.exports = {
  calculateDuration,
  formatTime,
  getDurationMessage,
};

