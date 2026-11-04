const fetch = require('node-fetch');

const { OutageReasonLookup } = require('../models');
const {
  GITHUB_DISPATCH_TOKEN,
  GITHUB_REPO,
  OUTAGE_REASON_CHECK_INTERVAL_MINUTES,
  OUTAGE_REASON_MAX_WAIT_MINUTES,
} = require('../config/constants');
const { editMessage } = require('./telegramService');

const DISPATCH_EVENT_TYPE = 'outage-reason';

let checkTimer = null;

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

function getCheckIntervalSeconds() {
  return Math.round(OUTAGE_REASON_CHECK_INTERVAL_MINUTES * 60);
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
 * @returns {string} HTML text or empty string when DTEK has no reason yet
 */
function buildReasonText({ status, subType }) {
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

function clearCheckTimer() {
  if (checkTimer) {
    clearTimeout(checkTimer);
    checkTimer = null;
  }
}

function scheduleCheck(delayMs, logger, fetchClient) {
  clearCheckTimer();
  checkTimer = setTimeout(() => {
    checkTimer = null;
    runReasonCheck(logger, { fetchClient }).catch((error) => {
      logger?.error('Error running outage reason check:', error.message);
    });
  }, Math.max(delayMs, 0));
  checkTimer.unref?.();
}

/**
 * Stop waiting for DTEK reason (light is back or lookup finished)
 * @param {object} logger - Fastify logger instance
 */
async function stopReasonLookup(logger) {
  clearCheckTimer();
  const [affected] = await OutageReasonLookup.update(
    { eventTime: null, messageId: null, message: null, nextCheckAt: null, deadlineAt: null },
    { where: { id: 1 } },
  );
  if (affected) {
    logger?.info('Outage reason lookup stopped');
  }
}

/**
 * Run scraper once and schedule next run until deadline
 * @param {object} logger - Fastify logger instance
 * @param {object} options - Optional parameters
 * @param {Function} options.fetchClient - fetch implementation
 */
async function runReasonCheck(logger, { fetchClient = fetch } = {}) {
  const lookup = await OutageReasonLookup.findByPk(1);
  if (!lookup?.eventTime) return;

  const now = nowInSeconds();
  if (now >= lookup.deadlineAt) {
    logger?.warn(`DTEK reason not found for event ${lookup.eventTime}, giving up`);
    await stopReasonLookup(logger);
    return;
  }

  const intervalSeconds = getCheckIntervalSeconds();
  await lookup.update({ nextCheckAt: now + intervalSeconds });

  try {
    await triggerReasonLookup(lookup.eventTime, fetchClient);
  } catch (error) {
    // Next scheduled check will retry dispatch
    logger?.error('Error triggering DTEK reason lookup:', error.message);
  }

  scheduleCheck(intervalSeconds * 1000, logger, fetchClient);
}

/**
 * Start polling DTEK reason for already sent offline message
 * @param {string} message - Offline status message (HTML)
 * @param {number} eventTime - Offline event UNIX timestamp
 * @param {number} messageId - Telegram message_id of sent offline message
 * @param {object} logger - Fastify logger instance
 * @param {object} options - Optional parameters
 * @param {Function} options.fetchClient - fetch implementation
 */
async function startReasonLookup(
  message,
  eventTime,
  messageId,
  logger,
  { fetchClient = fetch } = {},
) {
  if (!messageId) {
    logger?.warn('Offline message was not sent, skipping DTEK reason lookup');
    return;
  }

  const now = nowInSeconds();
  await OutageReasonLookup.upsert({
    id: 1,
    eventTime,
    messageId,
    message,
    nextCheckAt: now,
    deadlineAt: now + Math.round(OUTAGE_REASON_MAX_WAIT_MINUTES * 60),
  });

  await runReasonCheck(logger, { fetchClient });
}

/**
 * Add DTEK reason to sent offline message
 * @param {object} result - { eventTime, status, subType, startDate, endDate }
 * @param {object} logger - Fastify logger instance
 * @param {object} options - Optional parameters
 * @param {Function} options.editMessageFn - Telegram edit implementation
 * @returns {Promise<boolean>} True if message was updated
 */
async function resolveOutageReason(result, logger, { editMessageFn = editMessage } = {}) {
  const reasonText = buildReasonText(result);
  // No reason yet: keep polling on schedule
  if (!reasonText) return false;

  const lookup = await OutageReasonLookup.findByPk(1);
  if (!lookup?.eventTime || lookup.eventTime !== result.eventTime) return false;

  // Atomically finish lookup so duplicate callbacks never edit twice
  const [affected] = await OutageReasonLookup.update(
    { eventTime: null, messageId: null, message: null, nextCheckAt: null, deadlineAt: null },
    { where: { id: 1, eventTime: lookup.eventTime } },
  );
  if (!affected) return false;

  clearCheckTimer();
  await editMessageFn(lookup.messageId, `${lookup.message}\n${reasonText}`, logger);
  return true;
}

/**
 * Re-arm polling after restart (or when timer was lost)
 * @param {object} logger - Fastify logger instance
 * @param {object} options - Optional parameters
 * @param {Function} options.fetchClient - fetch implementation
 */
async function restoreReasonLookup(logger, { fetchClient = fetch } = {}) {
  const lookup = await OutageReasonLookup.findByPk(1);
  if (!lookup?.eventTime) return;

  const delayMs = (lookup.nextCheckAt - nowInSeconds()) * 1000;
  if (delayMs <= 0) {
    await runReasonCheck(logger, { fetchClient });
    return;
  }

  scheduleCheck(delayMs, logger, fetchClient);
}

module.exports = {
  buildReasonText,
  isOutageReasonEnabled,
  resolveOutageReason,
  restoreReasonLookup,
  runReasonCheck,
  startReasonLookup,
  stopReasonLookup,
  triggerReasonLookup,
};
