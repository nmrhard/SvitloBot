const crypto = require('crypto');
const fetch = require('node-fetch');

const {
  DAILY_CHECK_END_HOUR,
  DAILY_CHECK_END_MINUTE,
  DAILY_CHECK_INTERVAL_MINUTES,
  DAILY_CHECK_START_HOUR,
  DAILY_CHECK_START_MINUTE,
  DAILY_GROUP_KEY,
  DAILY_JSON_URL,
  DAILY_PNG_URL,
  DAILY_THREAD_ID,
  TIMEZONE,
} = require('../config/constants');
const { formatTime } = require('../utils/timeFormatter');
const { sendMessage, sendPhoto } = require('./telegramService');

const RETRY_DELAYS_MS = [10_000, 30_000, 60_000];

let nextCheckTimeout = null;
let isRunning = false;

function createDailyState() {
  return {
    currentWindowKey: null,
    currentTargetDateKey: null,
    currentTargetDateLabel: null,
    hasSentInitial: false,
    lastSentHash: null,
    missingNoticeSent: false,
  };
}

const runtimeState = createDailyState();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTimeInZone(date, timeZone) {
  return new Date(date.toLocaleString('en-US', { timeZone }));
}

function formatDateKey(date, timeZone = TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).format(date);
}

function formatDateLabel(date, timeZone = TIMEZONE) {
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).format(date);
}

function getDelayToNextRun(
  now = new Date(),
  hour = DAILY_CHECK_START_HOUR,
  minute = DAILY_CHECK_START_MINUTE,
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

function getDelayToNextInterval(
  now = new Date(),
  intervalMinutes = DAILY_CHECK_INTERVAL_MINUTES,
  timeZone = TIMEZONE,
) {
  const nowInZone = getTimeInZone(now, timeZone);
  const nextInZone = new Date(nowInZone);

  nextInZone.setSeconds(0, 0);
  const remainder = nextInZone.getMinutes() % intervalMinutes;
  let minutesToAdd = intervalMinutes - remainder;
  if (minutesToAdd === 0) {
    minutesToAdd = intervalMinutes;
  }
  nextInZone.setMinutes(nextInZone.getMinutes() + minutesToAdd);

  return nextInZone.getTime() - nowInZone.getTime();
}

function getActiveWindowInfo(now = new Date(), timeZone = TIMEZONE) {
  const nowInZone = getTimeInZone(now, timeZone);
  const startMinutes = DAILY_CHECK_START_HOUR * 60 + DAILY_CHECK_START_MINUTE;
  const endMinutes = DAILY_CHECK_END_HOUR * 60 + DAILY_CHECK_END_MINUTE;
  const crossesMidnight = endMinutes <= startMinutes;

  const startToday = new Date(nowInZone);
  startToday.setHours(DAILY_CHECK_START_HOUR, DAILY_CHECK_START_MINUTE, 0, 0);

  const endToday = new Date(nowInZone);
  endToday.setHours(DAILY_CHECK_END_HOUR, DAILY_CHECK_END_MINUTE, 0, 0);

  let windowStart = startToday;
  let windowEnd = endToday;

  if (crossesMidnight) {
    const startYesterday = new Date(startToday);
    startYesterday.setDate(startYesterday.getDate() - 1);
    const endTomorrow = new Date(endToday);
    endTomorrow.setDate(endTomorrow.getDate() + 1);

    if (nowInZone >= startToday) {
      windowStart = startToday;
      windowEnd = endTomorrow;
    } else if (nowInZone <= endToday) {
      windowStart = startYesterday;
      windowEnd = endToday;
    }
  }

  const isActive = nowInZone >= windowStart && nowInZone <= windowEnd;
  const isFinalCheck =
    isActive &&
    nowInZone.getHours() === DAILY_CHECK_END_HOUR &&
    nowInZone.getMinutes() === DAILY_CHECK_END_MINUTE;

  return {
    isActive,
    isFinalCheck,
    nowInZone,
    windowEnd,
    windowStart,
  };
}

function normalizeObject(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeObject(item));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = normalizeObject(value[key]);
        return acc;
      }, {});
  }

  return value;
}

function buildGroupHash(groupData) {
  const normalized = normalizeObject(groupData);
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex');
}

function extractGroupDataForTargetDate(
  scheduleJson,
  targetDateKey,
  groupKey = DAILY_GROUP_KEY,
  timeZone = TIMEZONE,
) {
  const factData = scheduleJson?.fact?.data;
  if (!factData || typeof factData !== 'object') {
    return null;
  }

  const entries = Object.entries(factData);
  for (const [epoch, dayData] of entries) {
    const epochDate = new Date(Number(epoch) * 1000);
    const epochDateKey = formatDateKey(epochDate, timeZone);
    if (epochDateKey !== targetDateKey) {
      continue;
    }

    const groupData = dayData?.[groupKey];
    if (groupData && typeof groupData === 'object') {
      return groupData;
    }
  }

  return null;
}

function resetStateForWindow(state, windowStart, timeZone = TIMEZONE) {
  const targetDate = new Date(windowStart);
  targetDate.setDate(targetDate.getDate() + 1);

  state.currentWindowKey = formatDateKey(windowStart, timeZone);
  state.currentTargetDateKey = formatDateKey(targetDate, timeZone);
  state.currentTargetDateLabel = formatDateLabel(targetDate, timeZone);
  state.hasSentInitial = false;
  state.lastSentHash = null;
  state.missingNoticeSent = false;
}

async function runWithRetry(actionFn, logger, context) {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await actionFn();
    } catch (error) {
      const retryDelay = RETRY_DELAYS_MS[attempt];
      if (retryDelay === undefined) {
        throw error;
      }

      logger?.warn(`${context}: retry scheduled`, {
        attempt: attempt + 1,
        error: error.message,
        retryDelayMs: retryDelay,
      });
      await sleep(retryDelay);
    }
  }

  return null;
}

async function fetchScheduleJson(fetchClient = fetch, url = DAILY_JSON_URL) {
  const response = await fetchClient(url);
  if (!response.ok) {
    throw new Error(`JSON fetch failed with status ${response.status}`);
  }

  return response.json();
}

async function processWindowCheck(
  logger,
  state = runtimeState,
  {
    fetchClient = fetch,
    jsonUrl = DAILY_JSON_URL,
    now = new Date(),
    pngUrl = DAILY_PNG_URL,
    sendMessageFn = sendMessage,
    sendPhotoFn = sendPhoto,
  } = {},
) {
  const windowInfo = getActiveWindowInfo(now);
  if (!windowInfo.isActive) {
    return windowInfo;
  }

  if (isRunning) {
    logger?.warn('Skipping JSON check because previous check is still active');
    return windowInfo;
  }

  const windowKey = formatDateKey(windowInfo.windowStart, TIMEZONE);
  if (state.currentWindowKey !== windowKey) {
    resetStateForWindow(state, windowInfo.windowStart, TIMEZONE);
  }

  isRunning = true;
  const currentTime = Math.floor(Date.now() / 1000);
  const formattedTime = formatTime(currentTime);

  try {
    const scheduleJson = await fetchScheduleJson(fetchClient, jsonUrl);
    const groupData = extractGroupDataForTargetDate(
      scheduleJson,
      state.currentTargetDateKey,
      DAILY_GROUP_KEY,
      TIMEZONE,
    );

    if (groupData) {
      const groupHash = buildGroupHash(groupData);

      if (!state.hasSentInitial) {
        const caption = `Графік відключень на ${state.currentTargetDateLabel}. Станом на ${formattedTime}`;
        const response = await runWithRetry(
          () =>
            sendPhotoFn(pngUrl, caption, logger, {
              threadId: DAILY_THREAD_ID,
            }),
          logger,
          'Initial graph send failed',
        );
        if (!response?.ok) {
          throw new Error(
            'Telegram API returned unexpected response for initial graph',
          );
        }

        state.hasSentInitial = true;
        state.lastSentHash = groupHash;
      } else if (groupHash !== state.lastSentHash) {
        const caption = `Графік на ${state.currentTargetDateLabel} оновлено. Станом на ${formattedTime}`;
        const response = await runWithRetry(
          () =>
            sendPhotoFn(pngUrl, caption, logger, {
              threadId: DAILY_THREAD_ID,
            }),
          logger,
          'Updated graph send failed',
        );
        if (!response?.ok) {
          throw new Error(
            'Telegram API returned unexpected response for updated graph',
          );
        }

        state.lastSentHash = groupHash;
      }
    } else if (
      windowInfo.isFinalCheck &&
      !state.hasSentInitial &&
      !state.missingNoticeSent
    ) {
      const notice = `Графік відключень на ${state.currentTargetDateLabel} відсутній`;
      const response = await runWithRetry(
        () =>
          sendMessageFn(notice, logger, {
            threadId: DAILY_THREAD_ID,
          }),
        logger,
        'Missing graph notice send failed',
      );
      if (!response?.ok) {
        throw new Error(
          'Telegram API returned unexpected response for missing graph notice',
        );
      }

      state.missingNoticeSent = true;
    }
  } catch (error) {
    logger?.error('Window check failed', {
      error: error.message,
      jsonUrl,
      targetDate: state.currentTargetDateLabel,
    });
  } finally {
    isRunning = false;
  }

  return windowInfo;
}

function scheduleNextTick(logger, delayMs) {
  nextCheckTimeout = setTimeout(async () => {
    const windowInfo = await processWindowCheck(logger);
    const nextDelay =
      windowInfo.isActive && !windowInfo.isFinalCheck
        ? getDelayToNextInterval()
        : getDelayToNextRun();
    scheduleNextTick(logger, nextDelay);
  }, delayMs);
}

function clearSchedulerTimers() {
  if (nextCheckTimeout) {
    clearTimeout(nextCheckTimeout);
    nextCheckTimeout = null;
  }
}

function startDailyImageScheduler(logger) {
  clearSchedulerTimers();

  const windowInfo = getActiveWindowInfo();
  if (windowInfo.isActive) {
    logger?.info('Daily graph scheduler started inside active window', {
      group: DAILY_GROUP_KEY,
      jsonUrl: DAILY_JSON_URL,
      timeZone: TIMEZONE,
    });
    scheduleNextTick(logger, 0);
    return;
  }

  const delay = getDelayToNextRun();
  logger?.info('Daily graph scheduler initialized', {
    checkEndHour: DAILY_CHECK_END_HOUR,
    checkEndMinute: DAILY_CHECK_END_MINUTE,
    checkIntervalMinutes: DAILY_CHECK_INTERVAL_MINUTES,
    checkStartHour: DAILY_CHECK_START_HOUR,
    checkStartMinute: DAILY_CHECK_START_MINUTE,
    group: DAILY_GROUP_KEY,
    initialDelayMs: delay,
    jsonUrl: DAILY_JSON_URL,
    pngUrl: DAILY_PNG_URL,
    timeZone: TIMEZONE,
  });
  scheduleNextTick(logger, delay);
}

module.exports = {
  buildGroupHash,
  clearSchedulerTimers,
  createDailyState,
  extractGroupDataForTargetDate,
  getActiveWindowInfo,
  getDelayToNextInterval,
  getDelayToNextRun,
  processWindowCheck,
  startDailyImageScheduler,
};
