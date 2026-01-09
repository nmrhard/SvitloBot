const statuses = {
  offline: '❌Світло вимкнули',
  online: '✅Світло увімкнули',
};

const CHAT_ID = process.env.CHAT_ID;
const API_TOKEN = process.env.API_TOKEN;
const THREAD_ID = process.env.THREAD_ID;
const TG_BOT_URL = `https://api.telegram.org/bot${API_TOKEN}`;

module.exports = {
  API_TOKEN,
  CHAT_ID,
  statuses,
  TG_BOT_URL,
  THREAD_ID,
};

