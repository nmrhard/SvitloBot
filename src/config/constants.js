const statuses = {
  offline: '❌Світло вимкнули',
  online: '✅Світло увімкнули',
};

const CHAT_ID = process.env.CHAT_ID;
const API_TOKEN = process.env.API_TOKEN;
const THREAD_ID = process.env.THREAD_ID;
const TG_BOT_URL = `https://api.telegram.org/bot${API_TOKEN}`;
const DAILY_PNG_URL =
  process.env.DAILY_PNG_URL ||
  'https://raw.githubusercontent.com/Baskerville42/outage-data-ua/main/images/kyiv-region/gpv-5-1-emergency.png';
const parsedSendHour = Number(process.env.DAILY_SEND_HOUR);
const DAILY_SEND_HOUR =
  Number.isInteger(parsedSendHour) && parsedSendHour >= 0 && parsedSendHour <= 23
    ? parsedSendHour
    : 21;
const parsedSendMinute = Number(process.env.DAILY_SEND_MINUTE);
const DAILY_SEND_MINUTE =
  Number.isInteger(parsedSendMinute) &&
  parsedSendMinute >= 0 &&
  parsedSendMinute <= 59
    ? parsedSendMinute
    : 0;
const TIMEZONE = process.env.TIMEZONE || 'Europe/Kyiv';

module.exports = {
  API_TOKEN,
  CHAT_ID,
  DAILY_PNG_URL,
  DAILY_SEND_HOUR,
  DAILY_SEND_MINUTE,
  statuses,
  TIMEZONE,
  TG_BOT_URL,
  THREAD_ID,
};

