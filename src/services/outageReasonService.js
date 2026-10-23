const fetch = require('node-fetch');

const { PendingOutage } = require('../models');
const {
  GITHUB_DISPATCH_TOKEN,
  GITHUB_REPO,
  OUTAGE_REASON_TIMEOUT_MINUTES,
} = require('../config/constants');
const { sendMessage } = require('./telegramService');

const DISPATCH_EVENT_TYPE = 'outage-reason';

let flushTimer = null;

function getDispatchConfig() {
  return {
    token: process.env.GITHUB_DISPATCH_TOKEN || GITHUB_DISPATCH_TOKEN,
    repo: process.env.GITHUB_REPO || GITHUB_REPO,
  };
}

/**
 * Check if DTEK reason lookup is configured
 * @returns {boolean} True when GitHub dispatch can be triggered
 */
function isOutageReasonEnabled() {
  const { token, repo } = getDispatchConfig();
  return Boolean(token && repo);
}

function nowInSeconds() {
  return Math.floor(Date.now() / 1000);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function capitalizeFirst(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Build reason line appended to offline message
 * @param {object} result - Scraper callback payload
 * @returns {string} HTML text or empty string when nothing to add
 */
function buildReasonText({ status, subType }) {
  if (status === 'no_outage') {
    return 'ℹ️ ДТЕК не повідомляє про відключення за цією адресою';
  }

  if (status !== 'found' || !subType) {
    return '';
  }

  return `⚠️ Причина: <i>${escapeHtml(capitalizeFirst(subType))}</i>`;
}

/**
 * Trigger GitHub Actions workflow that scrapes DTEK site
 * @param {number} eventTime - Offline event UNIX timestamp
 * @param {Function} fetchClient - fetch implementation
 */
async function triggerReasonLookup(eventTime, fetchClient = fetch) {
  const { token, repo } = getDispatchConfig();
  const response = await fetchClient(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      event_type: DISPATCH_EVENT_TYPE,
      client_payload: { eventTime },
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub dispatch failed with status ${response.status}`);
  }
}

function clearFlushTimer() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

/**
 * Atomically take pending message so timeout and callback never both send it
 * @param {number} [eventTime] - Only claim if pending event matches
 * @returns {Promise<string|null>} Pending message or null
 */
async function claimPendingOutage(eventTime) {
  const pending = await PendingOutage.findByPk(1);
  if (!pending?.eventTime) return null;
  if (eventTime !== undefined && pending.eventTime !== eventTime) return null;

  const [affected] = await PendingOutage.update(
    { eventTime: null, message: null, deadlineAt: null },
    { where: { id: 1, eventTime: pending.eventTime } },
  );

  return affected ? pending.message : null;
}

/**
 * Send pending offline message without reason
 * @param {object} logger - Fastify logger instance
 * @param {object} options - Optional parameters
 * @param {number} options.eventTime - Only flush if pending event matches
 * @param {Function} options.sendMessageFn - Telegram send implementation
 * @returns {Promise<boolean>} True if message was sent
 */
async function flushPendingOutage(logger, { eventTime, sendMessageFn = sendMessage } = {}) {
  const message = await claimPendingOutage(eventTime);
  if (!message) return false;

  clearFlushTimer();
  logger?.warn('Sending offline message without DTEK reason');
  await sendMessageFn(message, logger);
  return true;
}

function scheduleFlush(eventTime, delayMs, logger, sendMessageFn) {
  clearFlushTimer();
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushPendingOutage(logger, { eventTime, sendMessageFn }).catch((error) => {
      logger?.error('Error flushing pending outage:', error.message);
    });
  }, Math.max(delayMs, 0));
  flushTimer.unref?.();
}

/**
 * Hold offline message until DTEK reason arrives (or timeout passes)
 * @param {string} message - Offline status message
 * @param {number} eventTime - Offline event UNIX timestamp
 * @param {object} logger - Fastify logger instance
 * @param {object} options - Optional parameters
 * @param {Function} options.fetchClient - fetch implementation
 * @param {Function} options.sendMessageFn - Telegram send implementation
 */
async function queueOfflineMessage(
  message,
  eventTime,
  logger,
  { fetchClient = fetch, sendMessageFn = sendMessage } = {},
) {
  // Previous offline event must not be lost or sent after this one
  await flushPendingOutage(logger, { sendMessageFn });

  const timeoutSeconds = Math.round(OUTAGE_REASON_TIMEOUT_MINUTES * 60);
  await PendingOutage.upsert({
    id: 1,
    eventTime,
    message,
    deadlineAt: nowInSeconds() + timeoutSeconds,
  });

  try {
    await triggerReasonLookup(eventTime, fetchClient);
  } catch (error) {
    logger?.error('Error triggering DTEK reason lookup:', error.message);
    await flushPendingOutage(logger, { eventTime, sendMessageFn });
    return;
  }

  scheduleFlush(eventTime, timeoutSeconds * 1000, logger, sendMessageFn);
}

/**
 * Send pending offline message with reason from scraper callback
 * @param {object} result - { eventTime, status, subType, startDate, endDate }
 * @param {object} logger - Fastify logger instance
 * @param {object} options - Optional parameters
 * @param {Function} options.sendMessageFn - Telegram send implementation
 * @returns {Promise<boolean>} False if no matching pending message (stale/late callback)
 */
async function resolveOutageReason(result, logger, { sendMessageFn = sendMessage } = {}) {
  const message = await claimPendingOutage(result.eventTime);
  if (!message) return false;

  clearFlushTimer();
  const reasonText = buildReasonText(result);
  await sendMessageFn(reasonText ? `${message}\n${reasonText}` : message, logger);
  return true;
}

/**
 * Re-arm timeout after restart, or send message if deadline already passed
 * @param {object} logger - Fastify logger instance
 * @param {object} options - Optional parameters
 * @param {Function} options.sendMessageFn - Telegram send implementation
 */
async function restorePendingOutage(logger, { sendMessageFn = sendMessage } = {}) {
  const pending = await PendingOutage.findByPk(1);
  if (!pending?.eventTime) return;

  const delayMs = (pending.deadlineAt - nowInSeconds()) * 1000;
  if (delayMs <= 0) {
    await flushPendingOutage(logger, { eventTime: pending.eventTime, sendMessageFn });
    return;
  }

  scheduleFlush(pending.eventTime, delayMs, logger, sendMessageFn);
}

module.exports = {
  buildReasonText,
  claimPendingOutage,
  flushPendingOutage,
  isOutageReasonEnabled,
  queueOfflineMessage,
  resolveOutageReason,
  restorePendingOutage,
  triggerReasonLookup,
};
