const crypto = require('crypto');
const fetch = require('node-fetch');

const { getActiveConfig, getEnvFallbackConfig } = require('./configService');
const { DailyGraphState } = require('../models');
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

async function getPersistentDailyState(logger) {
  try {
    let state = await DailyGraphState.findByPk(1);
    if (!state) {
      state = await DailyGraphState.create({ id: 1 });
    }

    return {
      missingNoticeDateKey: state.missingNoticeDateKey || null,
      todayDateKey: state.todayDateKey || null,
      todayHash: state.todayHash || null,
      tomorrowDateKey: state.tomorrowDateKey || null,
      tomorrowHash: state.tomorrowHash || null,
    };
  } catch (error) {
    logger?.warn('Persistent scheduler state unavailable', {
      error: error.message,
    });
    return null;
  }
}

async function savePersistentDailyState(logger, patch) {
  try {
    let state = await DailyGraphState.findByPk(1);
    if (!state) {
      state = await DailyGraphState.create({ id: 1 });
    }
    await state.update(patch);
  } catch (error) {
    logger?.warn('Failed to persist scheduler state', {
      error: error.message,
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTimeInZone(date, timeZone) {
  return new Date(date.toLocaleString('en-US', { timeZone }));
}

function formatDateKey(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).format(date);
}

function formatDateLabel(date, timeZone) {
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).format(date);
}

function getDelayToNextRun(now = new Date(), hour, minute, timeZone) {
  const nowInZone = getTimeInZone(now, timeZone);
  const nextRunInZone = new Date(nowInZone);

  nextRunInZone.setHours(hour, minute, 0, 0);
  if (nextRunInZone <= nowInZone) {
    nextRunInZone.setDate(nextRunInZone.getDate() + 1);
  }

  return nextRunInZone.getTime() - nowInZone.getTime();
}

function getDelayToNextInterval(now = new Date(), intervalMinutes, timeZone) {
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

function getActiveWindowInfo(now = new Date(), config) {
  const {
    checkEndHour,
    checkEndMinute,
    checkIntervalMinutes,
    checkStartHour,
    checkStartMinute,
    timezone,
  } = config;

  const nowInZone = getTimeInZone(now, timezone);
  const startMinutes = checkStartHour * 60 + checkStartMinute;
  const endMinutes = checkEndHour * 60 + checkEndMinute;
  const intervalMinutes = Math.max(checkIntervalMinutes, 1);
  const crossesMidnight = endMinutes <= startMinutes;

  const startToday = new Date(nowInZone);
  startToday.setHours(checkStartHour, checkStartMinute, 0, 0);

  const endToday = new Date(nowInZone);
  endToday.setHours(checkEndHour, checkEndMinute, 0, 0);

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
  const finalCheckGraceMs = intervalMinutes * 60 * 1000;
  const isWithinFinalGrace =
    crossesMidnight &&
    nowInZone > windowEnd &&
    nowInZone.getTime() - windowEnd.getTime() < finalCheckGraceMs;
  const msUntilWindowEnd = windowEnd.getTime() - nowInZone.getTime();
  const isLastPlannedIntervalCheck =
    isActive && msUntilWindowEnd >= 0 && msUntilWindowEnd < finalCheckGraceMs;
  const isFinalCheck =
    (isActive &&
      nowInZone.getHours() === checkEndHour &&
      nowInZone.getMinutes() === checkEndMinute) ||
    isLastPlannedIntervalCheck ||
    isWithinFinalGrace;

  return {
    isActive: isActive || isWithinFinalGrace,
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
  groupKey,
  timeZone,
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

function extractTomorrowGroupData(scheduleJson, groupKey, timeZone) {
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

function extractTargetGroupData(scheduleJson, targetDateKey, groupKey, timeZone) {
  const factData = scheduleJson?.fact?.data;
  if (!targetDateKey || !factData || typeof factData !== 'object') {
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
    if (!groupData || typeof groupData !== 'object') {
      return null;
    }

    return {
      groupData,
      targetDateKey: epochDateKey,
      targetDateLabel: formatDateLabel(epochDate, timeZone),
      targetEpoch: Number(epoch),
    };
  }

  return null;
}

function extractTodayInfo(scheduleJson, groupKey, timeZone) {
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

function isJsonFresh(scheduleJson, jsonMaxAgeHours, now = new Date()) {
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

  const maxAgeMs = jsonMaxAgeHours * 60 * 60 * 1000;
  const ageMs = now.getTime() - lastUpdatedDate.getTime();
  if (ageMs > maxAgeMs) {
    return {
      isFresh: false,
      reason: `lastUpdated is older than ${jsonMaxAgeHours}h`,
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

function resetStateForWindow(state, windowStart, timeZone) {
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

async function fetchScheduleJson(fetchClient = fetch, url) {
  const response = await fetchClient(url);
  if (!response.ok) {
    throw new Error(`JSON fetch failed with status ${response.status}`);
  }

  return response.json();
}

async function fetchPngBinary(fetchClient = fetch, pngUrl, cacheBustToken = Date.now()) {
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
    config = null,
    fetchClient = fetch,
    fetchPngBinaryFn = fetchPngBinary,
    now = new Date(),
    stateStore = {
      getState: getPersistentDailyState,
      saveState: savePersistentDailyState,
    },
    sendMessageFn = sendMessage,
    sendPhotoFn = sendPhoto,
  } = {},
) {
  const activeConfig = config || (await getActiveConfig());
  const {
    chatId,
    dailyGroupKey,
    dailyJsonUrl,
    dailyPngUrl,
    dailyThreadId,
    jsonMaxAgeHours,
    requireNonYesValues,
    sendTodayInitial,
    timezone,
  } = activeConfig;

  const windowInfo = getActiveWindowInfo(now, activeConfig);

  if (isRunning) {
    logger?.warn('Skipping JSON check because previous check is still active');
    return windowInfo;
  }

  const windowKey = formatDateKey(windowInfo.windowStart, timezone);
  if (state.currentWindowKey !== windowKey) {
    resetStateForWindow(state, windowInfo.windowStart, timezone);
  }

  isRunning = true;
  const currentTime = Math.floor(Date.now() / 1000);
  const formattedTime = formatTime(currentTime);

  try {
    const scheduleJson = await fetchScheduleJson(fetchClient, dailyJsonUrl);
    const persistentState = await stateStore.getState(logger);
    const freshness = isJsonFresh(scheduleJson, jsonMaxAgeHours, now);
    if (!freshness.isFresh) {
      logger?.warn('Skipping graph check due to stale JSON', {
        reason: freshness.reason,
        targetDate: state.currentTargetDateLabel,
      });
      return windowInfo;
    }

    const today = extractTodayInfo(scheduleJson, dailyGroupKey, timezone);
    if (today) {
      if (state.currentTodayDateKey !== today.targetDateKey) {
        resetTodayStateForDate(state, today);
      }

      const todayHash = buildGroupHash(today.groupData);

      if (
        !state.hasSentTodayInitial &&
        persistentState?.tomorrowDateKey === today.targetDateKey &&
        persistentState?.tomorrowHash &&
        persistentState.tomorrowHash !== todayHash &&
        persistentState.missingNoticeDateKey === today.targetDateKey
      ) {
        const todayHasOutages = hasNonYesValues(today.groupData);
        if (todayHasOutages) {
          const photoPayload = await fetchPngBinaryFn(
            fetchClient,
            dailyPngUrl,
            now.getTime(),
          );
          const caption = `⚠️ Графік на ${state.currentTodayDateLabel} ЗМІНЕНО - з'явилися відключення! Станом на ${formattedTime}`;
          const response = await runWithRetry(
            () =>
              sendPhotoFn(photoPayload, caption, logger, {
                chatId,
                threadId: dailyThreadId,
              }),
            logger,
            'Today schedule changed notification failed',
          );
          if (!response?.ok) {
            throw new Error(
              'Telegram API returned unexpected response for changed today schedule',
            );
          }

          state.hasSentTodayInitial = true;
          state.lastSentTodayHash = todayHash;
          await stateStore.saveState(logger, {
            missingNoticeDateKey: null,
            todayDateKey: state.currentTodayDateKey,
            todayHash,
            todayLastNotifiedAt: new Date(),
          });
          logger?.info('Sent today schedule change notification', {
            targetDate: state.currentTodayDateLabel,
          });
        }
      }

      if (
        !state.hasSentTodayInitial &&
        persistentState?.todayDateKey === today.targetDateKey &&
        persistentState?.todayHash
      ) {
        state.hasSentTodayInitial = true;
        state.lastSentTodayHash = persistentState.todayHash;
      }

      if (today.groupData) {
        const todayValidation = validateGroupData(today.groupData);
        if (!todayValidation.isValid) {
          logger?.warn('Skipping today graph send due to invalid group data', {
            group: dailyGroupKey,
            reason: todayValidation.reason,
            targetDate: state.currentTodayDateLabel,
          });
        } else if (requireNonYesValues && !hasNonYesValues(today.groupData)) {
          const todayHash = buildGroupHash(today.groupData);
          if (
            state.hasSentTodayInitial &&
            state.lastSentTodayHash &&
            todayHash !== state.lastSentTodayHash
          ) {
            const photoPayload = await fetchPngBinaryFn(
              fetchClient,
              dailyPngUrl,
              now.getTime(),
            );
            const caption = `Графік на ${state.currentTodayDateLabel} ОНОВЛЕНО - відключення скасовано. Станом на ${formattedTime}`;
            const response = await runWithRetry(
              () =>
                sendPhotoFn(photoPayload, caption, logger, {
                  chatId,
                  threadId: dailyThreadId,
                }),
              logger,
              'Cancelled today outages graph send failed',
            );
            if (!response?.ok) {
              throw new Error(
                'Telegram API returned unexpected response for cancelled today outages graph',
              );
            }

            state.lastSentTodayHash = todayHash;
            await stateStore.saveState(logger, {
              todayDateKey: state.currentTodayDateKey,
              todayHash,
              todayLastNotifiedAt: new Date(),
            });
            logger?.info('Sent today graph update: outages cancelled', {
              targetDate: state.currentTodayDateLabel,
            });
          } else {
            logger?.warn('Skipping today graph send because data is all "yes"', {
              group: dailyGroupKey,
              targetDate: state.currentTodayDateLabel,
            });
          }
        } else {
          const todayHash = buildGroupHash(today.groupData);
          if (!state.hasSentTodayInitial) {
            if (sendTodayInitial) {
              const photoPayload = await fetchPngBinaryFn(
                fetchClient,
                dailyPngUrl,
                now.getTime(),
              );
              const caption = `Графік відключень на ${state.currentTodayDateLabel}. Станом на ${formattedTime}`;
              const response = await runWithRetry(
                () =>
                  sendPhotoFn(photoPayload, caption, logger, {
                    chatId,
                    threadId: dailyThreadId,
                  }),
                logger,
                'Today graph send failed',
              );
              if (!response?.ok) {
                throw new Error(
                  'Telegram API returned unexpected response for today graph',
                );
              }
            } else {
              logger?.info('Today graph baseline initialized without notify', {
                targetDate: state.currentTodayDateLabel,
              });
            }

            state.hasSentTodayInitial = true;
            state.lastSentTodayHash = todayHash;
            await stateStore.saveState(logger, {
              todayDateKey: state.currentTodayDateKey,
              todayHash,
            });
          } else if (todayHash !== state.lastSentTodayHash) {
            const photoPayload = await fetchPngBinaryFn(
              fetchClient,
              dailyPngUrl,
              now.getTime(),
            );
            const caption = `Графік на ${state.currentTodayDateLabel} ОНОВЛЕНО. Станом на ${formattedTime}`;
            const response = await runWithRetry(
              () =>
                sendPhotoFn(photoPayload, caption, logger, {
                  chatId,
                  threadId: dailyThreadId,
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
            await stateStore.saveState(logger, {
              todayDateKey: state.currentTodayDateKey,
              todayHash,
              todayLastNotifiedAt: new Date(),
            });
          }
        }
      } else {
        logger?.warn('Today group data is missing in JSON', {
          group: dailyGroupKey,
          targetDate: state.currentTodayDateLabel,
        });
      }
    } else {
      logger?.warn('Skipping today graph check because fact.today is missing');
    }

    if (windowInfo.isActive) {
      const tomorrow = extractTargetGroupData(
        scheduleJson,
        state.currentTargetDateKey,
        dailyGroupKey,
        timezone,
      );

      if (tomorrow) {
        const previousTargetDateKey = state.currentTargetDateKey;
        state.currentTargetEpoch = tomorrow.targetEpoch;
        state.currentTargetDateKey = tomorrow.targetDateKey;
        state.currentTargetDateLabel = tomorrow.targetDateLabel;

        if (
          !state.hasSentInitial &&
          persistentState?.tomorrowDateKey === tomorrow.targetDateKey &&
          persistentState?.tomorrowHash
        ) {
          state.hasSentInitial = true;
          state.lastSentHash = persistentState.tomorrowHash;
          logger?.info('Restored tomorrow graph state from persistent storage', {
            targetDate: state.currentTargetDateLabel,
          });
        }

        if (
          !state.missingNoticeSent &&
          persistentState?.missingNoticeDateKey === tomorrow.targetDateKey
        ) {
          state.missingNoticeSent = true;
        }

        const groupValidation = validateGroupData(tomorrow.groupData);
        if (!groupValidation.isValid) {
          logger?.warn('Skipping graph send due to invalid group data', {
            group: dailyGroupKey,
            reason: groupValidation.reason,
            targetDate: state.currentTargetDateLabel,
          });
          return windowInfo;
        }

        if (requireNonYesValues && !hasNonYesValues(tomorrow.groupData)) {
          const groupHash = buildGroupHash(tomorrow.groupData);
          if (
            state.hasSentInitial &&
            state.lastSentHash &&
            groupHash !== state.lastSentHash
          ) {
            const photoPayload = await fetchPngBinaryFn(
              fetchClient,
              dailyPngUrl,
              now.getTime(),
            );
            const caption = `Графік на ${state.currentTargetDateLabel} ОНОВЛЕНО - відключення скасовано. Станом на ${formattedTime}`;
            const response = await runWithRetry(
              () =>
                sendPhotoFn(photoPayload, caption, logger, {
                  chatId,
                  threadId: dailyThreadId,
                }),
              logger,
              'Cancelled outages graph send failed',
            );
            if (!response?.ok) {
              throw new Error(
                'Telegram API returned unexpected response for cancelled outages graph',
              );
            }

            state.lastSentHash = groupHash;
            await stateStore.saveState(logger, {
              missingNoticeDateKey: null,
              tomorrowDateKey: state.currentTargetDateKey,
              tomorrowHash: groupHash,
              tomorrowLastNotifiedAt: new Date(),
            });
            logger?.info('Sent graph update: outages cancelled', {
              targetDate: state.currentTargetDateLabel,
            });
          } else if (windowInfo.isFinalCheck && !state.missingNoticeSent) {
            const photoPayload = await fetchPngBinaryFn(
              fetchClient,
              dailyPngUrl,
              now.getTime(),
            );
            const caption = `✅ Графік на ${state.currentTargetDateLabel} - відключень не заплановано. Станом на ${formattedTime}`;
            const response = await runWithRetry(
              () =>
                sendPhotoFn(photoPayload, caption, logger, {
                  chatId,
                  threadId: dailyThreadId,
                }),
              logger,
              'No outages graph send failed',
            );
            if (!response?.ok) {
              throw new Error(
                'Telegram API returned unexpected response for no outages graph',
              );
            }

            const noOutagesHash = buildGroupHash(tomorrow.groupData);
            state.hasSentInitial = true;
            state.lastSentHash = noOutagesHash;
            state.missingNoticeSent = true;
            await stateStore.saveState(logger, {
              missingNoticeDateKey: state.currentTargetDateKey,
              tomorrowDateKey: state.currentTargetDateKey,
              tomorrowHash: noOutagesHash,
              tomorrowLastNotifiedAt: new Date(),
            });
            logger?.info('Sent no outages graph at final check', {
              targetDate: state.currentTargetDateLabel,
            });
          } else {
            logger?.warn('Skipping graph send because tomorrow data is all "yes"', {
              group: dailyGroupKey,
              hasSentInitial: state.hasSentInitial,
              isFinalCheck: windowInfo.isFinalCheck,
              missingNoticeSent: state.missingNoticeSent,
              targetDate: state.currentTargetDateLabel,
            });
          }
          return windowInfo;
        }

        const groupHash = buildGroupHash(tomorrow.groupData);
        const isSameTargetDate = previousTargetDateKey === tomorrow.targetDateKey;
        if (!state.hasSentInitial || !isSameTargetDate) {
          const photoPayload = await fetchPngBinaryFn(
            fetchClient,
            dailyPngUrl,
            now.getTime(),
          );
          const caption = `Графік відключень на ${state.currentTargetDateLabel}. Станом на ${formattedTime}`;
          const response = await runWithRetry(
            () =>
              sendPhotoFn(photoPayload, caption, logger, {
                chatId,
                threadId: dailyThreadId,
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
          await stateStore.saveState(logger, {
            missingNoticeDateKey: null,
            tomorrowDateKey: state.currentTargetDateKey,
            tomorrowHash: groupHash,
            tomorrowLastNotifiedAt: new Date(),
          });
        } else if (groupHash !== state.lastSentHash) {
          const photoPayload = await fetchPngBinaryFn(
            fetchClient,
            dailyPngUrl,
            now.getTime(),
          );
          const caption = `Графік на ${state.currentTargetDateLabel} ОНОВЛЕНО. Станом на ${formattedTime}`;
          const response = await runWithRetry(
            () =>
              sendPhotoFn(photoPayload, caption, logger, {
                chatId,
                threadId: dailyThreadId,
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
          await stateStore.saveState(logger, {
            missingNoticeDateKey: null,
            tomorrowDateKey: state.currentTargetDateKey,
            tomorrowHash: groupHash,
            tomorrowLastNotifiedAt: new Date(),
          });
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
              chatId,
              threadId: dailyThreadId,
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
        await stateStore.saveState(logger, {
          missingNoticeDateKey: state.currentTargetDateKey,
        });
      }
    } else {
      logger?.info('Tomorrow graph check skipped outside active window', {
        nowInZone: windowInfo.nowInZone.toISOString(),
      });
    }
  } catch (error) {
    logger?.error('Window check failed', {
      error: error.message,
      jsonUrl: dailyJsonUrl,
      targetDate: state.currentTargetDateLabel,
    });
  } finally {
    isRunning = false;
  }

  return windowInfo;
}

async function scheduleNextTick(logger, delayMs) {
  nextCheckTimeout = setTimeout(async () => {
    const config = await getActiveConfig();
    await processWindowCheck(logger, runtimeState, { config });
    const nextDelay = getDelayToNextInterval(
      new Date(),
      config.checkIntervalMinutes,
      config.timezone,
    );
    scheduleNextTick(logger, nextDelay);
  }, delayMs);
}

function clearSchedulerTimers() {
  if (nextCheckTimeout) {
    clearTimeout(nextCheckTimeout);
    nextCheckTimeout = null;
  }
}

async function startDailyImageScheduler(logger) {
  clearSchedulerTimers();

  const config = await getActiveConfig();

  logger?.info('Daily graph scheduler initialized', {
    checkEndHour: config.checkEndHour,
    checkEndMinute: config.checkEndMinute,
    checkIntervalMinutes: config.checkIntervalMinutes,
    checkStartHour: config.checkStartHour,
    checkStartMinute: config.checkStartMinute,
    group: config.dailyGroupKey,
    initialDelayMs: 0,
    jsonUrl: config.dailyJsonUrl,
    pngUrl: config.dailyPngUrl,
    source: config.contactId ? 'database' : 'env',
    timeZone: config.timezone,
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
