const fetch = require('node-fetch');

const {
  DAILY_PNG_URL,
  DAILY_SEND_HOUR,
  DAILY_SEND_MINUTE,
  DAILY_THREAD_ID,
  TIMEZONE,
} = require('../config/constants');
const { formatTime } = require('../utils/timeFormatter');
const { sendPhoto } = require('./telegramService');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAYS_MS = [10_000, 30_000, 60_000];

let initialTimeout = null;
let dailyInterval = null;
let isRunning = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTimeInZone(date, timeZone) {
  return new Date(date.toLocaleString('en-US', { timeZone }));
}

function getDelayToNextRun(
  now = new Date(),
  hour = DAILY_SEND_HOUR,
  minute = DAILY_SEND_MINUTE,
  timeZone = TIMEZONE,
) {
  const nowInZone = getTimeInZone(now, timeZone);
  const nextRunInZone = new Date(nowInZone);

  nextRunInZone.setHours(hour, minute, 0, 0);
  if (nextRunInZone <= nowInZone) {
    nextRunInZone.setDate(nextRunInZone.getDate() + 1);
  }

  return nextRunInZone.getTime() - nowInZone.getTime();
}

async function ensurePngIsAccessible(url, fetchClient = fetch) {
  const response = await fetchClient(url);
  if (!response.ok) {
    throw new Error(`Image download failed with status ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('image/png')) {
    throw new Error(`Expected image/png but got "${contentType}"`);
  }

  const body = await response.buffer();
  if (!body.length) {
    throw new Error('Downloaded image is empty');
  }
}

async function sendDailyImage(
  logger,
  { fetchClient = fetch, sendPhotoFn = sendPhoto, url = DAILY_PNG_URL } = {},
) {
  if (isRunning) {
    logger?.warn(
      'Skipping daily image send because previous run is still active',
    );
    return;
  }

  isRunning = true;
  const currentTime = Math.floor(Date.now() / 1000);
  const formattedTime = formatTime(currentTime);

  try {
    await ensurePngIsAccessible(url, fetchClient);

    const caption = `Планові/аварійні відключення станом на ${formattedTime}`;
    const telegramResponse = await sendPhotoFn(url, caption, logger, {
      threadId: DAILY_THREAD_ID,
    });
    if (!telegramResponse?.ok) {
      throw new Error('Telegram API returned unexpected response');
    }

    logger?.info('Daily PNG sent to Telegram successfully', {
      url,
      telegramMessageId: telegramResponse.result?.message_id,
      formattedTime,
    });
  } catch (error) {
    logger?.error('Failed to send daily PNG', {
      error: error.message,
      url,
      formattedTime,
    });
    throw error;
  } finally {
    isRunning = false;
  }
}

async function runDailyImageWithRetry(logger) {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      await sendDailyImage(logger);
      return;
    } catch (error) {
      const retryDelay = RETRY_DELAYS_MS[attempt];
      if (retryDelay === undefined) {
        logger?.error('Daily PNG send failed after all retries');
        return;
      }

      logger?.warn('Retrying daily PNG send', {
        attempt: attempt + 1,
        nextRetryInMs: retryDelay,
        error: error.message,
      });
      await sleep(retryDelay);
    }
  }
}

function clearSchedulerTimers() {
  if (initialTimeout) {
    clearTimeout(initialTimeout);
    initialTimeout = null;
  }

  if (dailyInterval) {
    clearInterval(dailyInterval);
    dailyInterval = null;
  }
}

function startDailyImageScheduler(logger) {
  clearSchedulerTimers();

  const delay = getDelayToNextRun();
  logger?.info('Daily PNG scheduler initialized', {
    runAtHour: DAILY_SEND_HOUR,
    runAtMinute: DAILY_SEND_MINUTE,
    timeZone: TIMEZONE,
    initialDelayMs: delay,
    url: DAILY_PNG_URL,
  });

  initialTimeout = setTimeout(async () => {
    await runDailyImageWithRetry(logger);

    dailyInterval = setInterval(async () => {
      await runDailyImageWithRetry(logger);
    }, ONE_DAY_MS);
  }, delay);
}

module.exports = {
  clearSchedulerTimers,
  getDelayToNextRun,
  runDailyImageWithRetry,
  sendDailyImage,
  startDailyImageScheduler,
};
