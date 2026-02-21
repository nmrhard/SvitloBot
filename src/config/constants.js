const statuses = {
  offline: '❌Світло вимкнули',
  online: '✅Світло увімкнули',
};

const CHAT_ID = process.env.CHAT_ID;
const API_TOKEN = process.env.API_TOKEN;
const THREAD_ID = process.env.THREAD_ID;
const DAILY_THREAD_ID = process.env.DAILY_THREAD_ID;
const TG_BOT_URL = `https://api.telegram.org/bot${API_TOKEN}`;

const DAILY_PNG_URL =
  process.env.DAILY_PNG_URL ||
  'https://raw.githubusercontent.com/Baskerville42/outage-data-ua/main/images/kyiv-region/gpv-5-1-emergency.png';

const DAILY_JSON_URL =
  process.env.DAILY_JSON_URL ||
  'https://raw.githubusercontent.com/Baskerville42/outage-data-ua/main/data/kyiv-region.json';
const DAILY_GROUP_KEY = process.env.DAILY_GROUP_KEY || 'GPV5.1';

const parsedCheckStartHour = Number(process.env.DAILY_CHECK_START_HOUR);
const DAILY_CHECK_START_HOUR =
  Number.isInteger(parsedCheckStartHour) &&
  parsedCheckStartHour >= 0 &&
  parsedCheckStartHour <= 23
    ? parsedCheckStartHour
    : 20;

const parsedCheckStartMinute = Number(process.env.DAILY_CHECK_START_MINUTE);
const DAILY_CHECK_START_MINUTE =
  Number.isInteger(parsedCheckStartMinute) &&
  parsedCheckStartMinute >= 0 &&
  parsedCheckStartMinute <= 59
    ? parsedCheckStartMinute
    : 0;

const parsedCheckEndHour = Number(process.env.DAILY_CHECK_END_HOUR);
const DAILY_CHECK_END_HOUR =
  Number.isInteger(parsedCheckEndHour) &&
  parsedCheckEndHour >= 0 &&
  parsedCheckEndHour <= 23
    ? parsedCheckEndHour
    : 0;

const parsedCheckEndMinute = Number(process.env.DAILY_CHECK_END_MINUTE);
const DAILY_CHECK_END_MINUTE =
  Number.isInteger(parsedCheckEndMinute) &&
  parsedCheckEndMinute >= 0 &&
  parsedCheckEndMinute <= 59
    ? parsedCheckEndMinute
    : 0;

const parsedCheckIntervalMinutes = Number(process.env.DAILY_CHECK_INTERVAL_MINUTES);
const DAILY_CHECK_INTERVAL_MINUTES =
  Number.isInteger(parsedCheckIntervalMinutes) && parsedCheckIntervalMinutes > 0
    ? parsedCheckIntervalMinutes
    : 30;

const parsedJsonMaxAgeHours = Number(process.env.DAILY_JSON_MAX_AGE_HOURS);
const DAILY_JSON_MAX_AGE_HOURS =
  Number.isFinite(parsedJsonMaxAgeHours) && parsedJsonMaxAgeHours > 0
    ? parsedJsonMaxAgeHours
    : 24;

const TIMEZONE = process.env.TIMEZONE || 'Europe/Kyiv';

module.exports = {
  API_TOKEN,
  CHAT_ID,
  DAILY_CHECK_END_HOUR,
  DAILY_CHECK_END_MINUTE,
  DAILY_CHECK_INTERVAL_MINUTES,
  DAILY_CHECK_START_HOUR,
  DAILY_CHECK_START_MINUTE,
  DAILY_GROUP_KEY,
  DAILY_JSON_URL,
  DAILY_JSON_MAX_AGE_HOURS,
  DAILY_PNG_URL,
  DAILY_THREAD_ID,
  statuses,
  TIMEZONE,
  TG_BOT_URL,
  THREAD_ID,
};

