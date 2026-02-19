const statusService = require('./statusService');
const telegramService = require('./telegramService');
const dailyImageScheduler = require('./dailyImageScheduler');

module.exports = {
  ...dailyImageScheduler,
  ...statusService,
  ...telegramService,
};

