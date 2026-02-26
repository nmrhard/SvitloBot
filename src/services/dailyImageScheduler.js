const crypto = require('crypto');
const fetch = require('node-fetch');

const {
  DAILY_CHECK_END_HOUR,
  DAILY_CHECK_END_MINUTE,
  DAILY_CHECK_INTERVAL_MINUTES,
  DAILY_CHECK_START_HOUR,
  DAILY_CHECK_START_MINUTE,
  DAILY_GROUP_KEY,
  DAILY_JSON_MAX_AGE_HOURS,
  DAILY_JSON_URL,
  DAILY_PNG_URL,
  DAILY_REQUIRE_NON_YES_VALUES,
  DAILY_THREAD_ID,
  TIMEZONE,
} = require('../config/constants');
const { formatTime } = require('../utils/timeFormatter');
const { sendMessage, sendPhoto } = require('./telegramService');

const RETRY_DELAYS_MS = [10_000, 30_000, 60_000];
const ALLOWED_GROUP_VALUES = new Set([
  'first',
  'mfirst',
  'maybe',
  'msecond',
  'no',
  'second',
  'yes',
]);

let nextCheckTimeout = null;
let isRunning = false;

function createDailyState() {
  return {
    currentTodayDateKey: null,
    currentTodayDateLabel: null,
    hasSentTodayInitial: false,
    lastSentTodayHash: null,
    currentWindowKey: null,
    currentTargetEpoch: null,
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

function extractTomorrowEpoch(scheduleJson) {
  const todayEpoch = Number(scheduleJson?.fact?.today);
  const factData = scheduleJson?.fact?.data;
  if (!todayEpoch || !factData || typeof factData !== 'object') {
    return null;
  }

  const candidate = Object.keys(factData)
    .map((epoch) => Number(epoch))
    .filter((epoch) => Number.isFinite(epoch) && epoch > todayEpoch)
    .sort((a, b) => a - b)[0];

  return Number.isFinite(candidate) ? candidate : null;
}

function extractTomorrowGroupData(
  scheduleJson,
  groupKey = DAILY_GROUP_KEY,
  timeZone = TIMEZONE,
) {
  const tomorrowEpoch = extractTomorrowEpoch(scheduleJson);
  if (!tomorrowEpoch) {
    return null;
  }

  const dayData = scheduleJson?.fact?.data?.[String(tomorrowEpoch)];
  const groupData = dayData?.[groupKey];
  if (!groupData || typeof groupData !== 'object') {
    return null;
  }

  const targetDate = new Date(tomorrowEpoch * 1000);
  return {
    groupData,
    targetDateKey: formatDateKey(targetDate, timeZone),
    targetDateLabel: formatDateLabel(targetDate, timeZone),
    targetEpoch: tomorrowEpoch,
  };
}

function extractTodayInfo(
  scheduleJson,
  groupKey = DAILY_GROUP_KEY,
  timeZone = TIMEZONE,
) {
  const todayEpoch = Number(scheduleJson?.fact?.today);
  if (!todayEpoch) {
    return null;
  }

  const targetDate = new Date(todayEpoch * 1000);
  const groupData = scheduleJson?.fact?.data?.[String(todayEpoch)]?.[groupKey];

  return {
    groupData: groupData && typeof groupData === 'object' ? groupData : null,
    targetDateKey: formatDateKey(targetDate, timeZone),
    targetDateLabel: formatDateLabel(targetDate, timeZone),
    targetEpoch: todayEpoch,
  };
}

function isJsonFresh(scheduleJson, now = new Date()) {
  const lastUpdatedRaw = scheduleJson?.lastUpdated;
  if (!lastUpdatedRaw) {
    return {
      isFresh: false,
      reason: 'lastUpdated is missing in JSON',
    };
  }

  const lastUpdatedDate = new Date(lastUpdatedRaw);
  if (Number.isNaN(lastUpdatedDate.getTime())) {
    return {
      isFresh: false,
      reason: 'lastUpdated has invalid format',
    };
  }

  const maxAgeMs = DAILY_JSON_MAX_AGE_HOURS * 60 * 60 * 1000;
  const ageMs = now.getTime() - lastUpdatedDate.getTime();
  if (ageMs > maxAgeMs) {
    return {
      isFresh: false,
      reason: `lastUpdated is older than ${DAILY_JSON_MAX_AGE_HOURS}h`,
    };
  }

  return { isFresh: true, reason: null };
}

function validateGroupData(groupData) {
  if (!groupData || typeof groupData !== 'object') {
    return {
      isValid: false,
      reason: 'group data is missing',
    };
  }

  for (let hour = 1; hour <= 24; hour += 1) {
    const hourKey = String(hour);
    const value = groupData[hourKey];
    if (!value) {
      return {
        isValid: false,
        reason: `hour ${hourKey} is missing`,
      };
    }

    if (!ALLOWED_GROUP_VALUES.has(value)) {
      return {
        isValid: false,
        reason: `hour ${hourKey} has invalid value "${value}"`,
      };
    }
  }

  return { isValid: true, reason: null };
}

function hasNonYesValues(groupData) {
  return Object.values(groupData).some(
    (value) => String(value).toLowerCase() !== 'yes',
  );
}

function resetStateForWindow(state, windowStart, timeZone = TIMEZONE) {
  const targetDate = new Date(windowStart);
  targetDate.setDate(targetDate.getDate() + 1);

  state.currentWindowKey = formatDateKey(windowStart, timeZone);
  state.currentTargetEpoch = null;
  state.currentTargetDateKey = formatDateKey(targetDate, timeZone);
  state.currentTargetDateLabel = formatDateLabel(targetDate, timeZone);
  state.hasSentInitial = false;
  state.lastSentHash = null;
  state.missingNoticeSent = false;
}

function resetTodayStateForDate(state, dateInfo) {
  state.currentTodayDateKey = dateInfo.targetDateKey;
  state.currentTodayDateLabel = dateInfo.targetDateLabel;
  state.hasSentTodayInitial = false;
  state.lastSentTodayHash = null;
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

async function fetchPngBinary(
  fetchClient = fetch,
  pngUrl = DAILY_PNG_URL,
  cacheBustToken = Date.now(),
) {
  const url = new URL(pngUrl);
  url.searchParams.set('ts', String(cacheBustToken));

  const response = await fetchClient(url.toString());
  if (!response.ok) {
    throw new Error(`PNG fetch failed with status ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'image/png';
  const photoBuffer = await response.buffer();
  if (!photoBuffer.length) {
    throw new Error('Downloaded PNG is empty');
  }

  return {
    contentType,
    fileName: 'gpv-5-1-emergency.png',
    photoBuffer,
  };
}

async function processWindowCheck(
  logger,
  state = runtimeState,
  {
    fetchClient = fetch,
    fetchPngBinaryFn = fetchPngBinary,
    jsonUrl = DAILY_JSON_URL,
    now = new Date(),
    pngUrl = DAILY_PNG_URL,
    sendMessageFn = sendMessage,
    sendPhotoFn = sendPhoto,
  } = {},
) {
  const windowInfo = getActiveWindowInfo(now);

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
    const freshness = isJsonFresh(scheduleJson, now);
    if (!freshness.isFresh) {
      logger?.warn('Skipping graph check due to stale JSON', {
        reason: freshness.reason,
        targetDate: state.currentTargetDateLabel,
      });
      return windowInfo;
    }

    const today = extractTodayInfo(scheduleJson, DAILY_GROUP_KEY, TIMEZONE);
    if (today) {
      if (state.currentTodayDateKey !== today.targetDateKey) {
        resetTodayStateForDate(state, today);
      }

      if (today.groupData) {
        const todayValidation = validateGroupData(today.groupData);
        if (!todayValidation.isValid) {
          logger?.warn('Skipping today graph send due to invalid group data', {
            group: DAILY_GROUP_KEY,
            reason: todayValidation.reason,
            targetDate: state.currentTodayDateLabel,
          });
        } else if (
          DAILY_REQUIRE_NON_YES_VALUES &&
          !hasNonYesValues(today.groupData)
        ) {
          logger?.warn('Skipping today graph send because data is all "yes"', {
            group: DAILY_GROUP_KEY,
            targetDate: state.currentTodayDateLabel,
          });
        } else {
          const todayHash = buildGroupHash(today.groupData);
          if (!state.hasSentTodayInitial) {
            const photoPayload = await fetchPngBinaryFn(
              fetchClient,
              pngUrl,
              now.getTime(),
            );
            const caption = `Графік відключень на ${state.currentTodayDateLabel}. Станом на ${formattedTime}`;
            const response = await runWithRetry(
              () =>
                sendPhotoFn(photoPayload, caption, logger, {
                  threadId: DAILY_THREAD_ID,
                }),
              logger,
              'Today graph send failed',
            );
            if (!response?.ok) {
              throw new Error(
                'Telegram API returned unexpected response for today graph',
              );
            }

            state.hasSentTodayInitial = true;
            state.lastSentTodayHash = todayHash;
          } else if (todayHash !== state.lastSentTodayHash) {
            const photoPayload = await fetchPngBinaryFn(
              fetchClient,
              pngUrl,
              now.getTime(),
            );
            const caption = `Графік на ${state.currentTodayDateLabel} оновлено. Станом на ${formattedTime}`;
            const response = await runWithRetry(
              () =>
                sendPhotoFn(photoPayload, caption, logger, {
                  threadId: DAILY_THREAD_ID,
                }),
              logger,
              'Updated today graph send failed',
            );
            if (!response?.ok) {
              throw new Error(
                'Telegram API returned unexpected response for updated today graph',
              );
            }

            state.lastSentTodayHash = todayHash;
          }
        }
      } else {
        logger?.warn('Today group data is missing in JSON', {
          group: DAILY_GROUP_KEY,
          targetDate: state.currentTodayDateLabel,
        });
      }
    } else {
      logger?.warn('Skipping today graph check because fact.today is missing');
    }

    if (windowInfo.isActive) {
      const tomorrow = extractTomorrowGroupData(
        scheduleJson,
        DAILY_GROUP_KEY,
        TIMEZONE,
      );

      if (tomorrow) {
        const previousTargetDateKey = state.currentTargetDateKey;
        state.currentTargetEpoch = tomorrow.targetEpoch;
        state.currentTargetDateKey = tomorrow.targetDateKey;
        state.currentTargetDateLabel = tomorrow.targetDateLabel;

        const groupValidation = validateGroupData(tomorrow.groupData);
        if (!groupValidation.isValid) {
          logger?.warn('Skipping graph send due to invalid group data', {
            group: DAILY_GROUP_KEY,
            reason: groupValidation.reason,
            targetDate: state.currentTargetDateLabel,
          });
          return windowInfo;
        }

        if (
          DAILY_REQUIRE_NON_YES_VALUES &&
          !hasNonYesValues(tomorrow.groupData)
        ) {
          logger?.warn(
            'Skipping graph send because tomorrow data is all "yes"',
            {
              group: DAILY_GROUP_KEY,
              targetDate: state.currentTargetDateLabel,
            },
          );
          if (
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
          return windowInfo;
        }

        const groupHash = buildGroupHash(tomorrow.groupData);
        const isSameTargetDate =
          previousTargetDateKey === tomorrow.targetDateKey;
        if (!state.hasSentInitial || !isSameTargetDate) {
          const photoPayload = await fetchPngBinaryFn(
            fetchClient,
            pngUrl,
            now.getTime(),
          );
          const caption = `Графік відключень на ${state.currentTargetDateLabel}. Станом на ${formattedTime}`;
          const response = await runWithRetry(
            () =>
              sendPhotoFn(photoPayload, caption, logger, {
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
          const photoPayload = await fetchPngBinaryFn(
            fetchClient,
            pngUrl,
            now.getTime(),
          );
          const caption = `Графік на ${state.currentTargetDateLabel} ОНОВЛЕНО. Станом на ${formattedTime}`;
          const response = await runWithRetry(
            () =>
              sendPhotoFn(photoPayload, caption, logger, {
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
    } else {
      logger?.info('Tomorrow graph check skipped outside active window', {
        nowInZone: windowInfo.nowInZone.toISOString(),
      });
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
    await processWindowCheck(logger);
    const nextDelay = getDelayToNextInterval();
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

  logger?.info('Daily graph scheduler initialized', {
    checkEndHour: DAILY_CHECK_END_HOUR,
    checkEndMinute: DAILY_CHECK_END_MINUTE,
    checkIntervalMinutes: DAILY_CHECK_INTERVAL_MINUTES,
    checkStartHour: DAILY_CHECK_START_HOUR,
    checkStartMinute: DAILY_CHECK_START_MINUTE,
    group: DAILY_GROUP_KEY,
    initialDelayMs: 0,
    jsonUrl: DAILY_JSON_URL,
    pngUrl: DAILY_PNG_URL,
    timeZone: TIMEZONE,
  });
  scheduleNextTick(logger, 0);
}

module.exports = {
  buildGroupHash,
  clearSchedulerTimers,
  createDailyState,
  extractGroupDataForTargetDate,
  extractTodayInfo,
  extractTomorrowEpoch,
  extractTomorrowGroupData,
  fetchPngBinary,
  getActiveWindowInfo,
  getDelayToNextInterval,
  getDelayToNextRun,
  hasNonYesValues,
  isJsonFresh,
  processWindowCheck,
  startDailyImageScheduler,
  validateGroupData,
};
