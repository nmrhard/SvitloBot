const { ContactList, DailyCheckSchedule } = require('../models');

let cachedConfig = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60_000;

function getEnvFallbackConfig() {
  const parsedCheckStartHour = Number(process.env.DAILY_CHECK_START_HOUR);
  const parsedCheckStartMinute = Number(process.env.DAILY_CHECK_START_MINUTE);
  const parsedCheckEndHour = Number(process.env.DAILY_CHECK_END_HOUR);
  const parsedCheckEndMinute = Number(process.env.DAILY_CHECK_END_MINUTE);
  const parsedCheckIntervalMinutes = Number(
    process.env.DAILY_CHECK_INTERVAL_MINUTES,
  );
  const parsedJsonMaxAgeHours = Number(process.env.DAILY_JSON_MAX_AGE_HOURS);

  return {
    chatId: process.env.CHAT_ID,
    dailyGroupKey: process.env.DAILY_GROUP_KEY || 'GPV5.1',
    dailyJsonUrl:
      process.env.DAILY_JSON_URL ||
      'https://raw.githubusercontent.com/Baskerville42/outage-data-ua/main/data/kyiv-region.json',
    dailyPngUrl:
      process.env.DAILY_PNG_URL ||
      'https://raw.githubusercontent.com/Baskerville42/outage-data-ua/main/images/kyiv-region/gpv-5-1-emergency.png',
    dailyThreadId: process.env.DAILY_THREAD_ID,
    threadId: process.env.THREAD_ID,

    checkEndHour:
      Number.isInteger(parsedCheckEndHour) &&
      parsedCheckEndHour >= 0 &&
      parsedCheckEndHour <= 23
        ? parsedCheckEndHour
        : 23,
    checkEndMinute:
      Number.isInteger(parsedCheckEndMinute) &&
      parsedCheckEndMinute >= 0 &&
      parsedCheckEndMinute <= 59
        ? parsedCheckEndMinute
        : 59,
    checkIntervalMinutes:
      Number.isInteger(parsedCheckIntervalMinutes) &&
      parsedCheckIntervalMinutes > 0
        ? parsedCheckIntervalMinutes
        : 30,
    checkStartHour:
      Number.isInteger(parsedCheckStartHour) &&
      parsedCheckStartHour >= 0 &&
      parsedCheckStartHour <= 23
        ? parsedCheckStartHour
        : 20,
    checkStartMinute:
      Number.isInteger(parsedCheckStartMinute) &&
      parsedCheckStartMinute >= 0 &&
      parsedCheckStartMinute <= 59
        ? parsedCheckStartMinute
        : 0,
    jsonMaxAgeHours:
      Number.isFinite(parsedJsonMaxAgeHours) && parsedJsonMaxAgeHours > 0
        ? parsedJsonMaxAgeHours
        : 24,
    requireNonYesValues: process.env.DAILY_REQUIRE_NON_YES_VALUES !== 'false',
    sendTodayInitial: process.env.DAILY_SEND_TODAY_INITIAL === 'true',
    timezone: process.env.TIMEZONE || 'Europe/Kyiv',
  };
}

function mergeWithEnvFallback(dbConfig, schedule) {
  const envConfig = getEnvFallbackConfig();

  return {
    chatId: dbConfig.chatId || envConfig.chatId,
    dailyGroupKey: dbConfig.dailyGroupKey || envConfig.dailyGroupKey,
    dailyJsonUrl: dbConfig.dailyJsonUrl || envConfig.dailyJsonUrl,
    dailyPngUrl: dbConfig.dailyPngUrl || envConfig.dailyPngUrl,
    dailyThreadId: dbConfig.dailyThreadId || envConfig.dailyThreadId,
    threadId: dbConfig.threadId || envConfig.threadId,

    checkEndHour: schedule?.endHour ?? envConfig.checkEndHour,
    checkEndMinute: schedule?.endMinute ?? envConfig.checkEndMinute,
    checkIntervalMinutes:
      schedule?.intervalMinutes ?? envConfig.checkIntervalMinutes,
    checkStartHour: schedule?.startHour ?? envConfig.checkStartHour,
    checkStartMinute: schedule?.startMinute ?? envConfig.checkStartMinute,
    jsonMaxAgeHours: schedule?.jsonMaxAgeHours
      ? Number(schedule.jsonMaxAgeHours)
      : envConfig.jsonMaxAgeHours,
    requireNonYesValues:
      schedule?.requireNonYesValues ?? envConfig.requireNonYesValues,
    sendTodayInitial: schedule?.sendTodayInitial ?? envConfig.sendTodayInitial,
    timezone: schedule?.timezone ?? envConfig.timezone,

    contactId: dbConfig.id,
    contactName: dbConfig.name,
    scheduleId: schedule?.id,
  };
}

async function getActiveConfig(forceRefresh = false) {
  const now = Date.now();

  if (!forceRefresh && cachedConfig && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const dbContact = await ContactList.findOne({
      where: { isActive: true },
      include: [
        {
          model: DailyCheckSchedule,
          as: 'schedules',
          where: { isActive: true },
          required: false,
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    if (dbContact) {
      const schedule = dbContact.schedules?.[0];
      cachedConfig = mergeWithEnvFallback(dbContact, schedule);
      lastFetchTime = now;
      return cachedConfig;
    }
  } catch (error) {
    console.error('Failed to fetch config from database:', error.message);
  }

  cachedConfig = getEnvFallbackConfig();
  lastFetchTime = now;
  return cachedConfig;
}

function invalidateCache() {
  cachedConfig = null;
  lastFetchTime = 0;
}

module.exports = {
  getActiveConfig,
  getEnvFallbackConfig,
  invalidateCache,
};
