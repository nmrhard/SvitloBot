const configService = require('./configService');
const dailyImageScheduler = require('./dailyImageScheduler');
const statusService = require('./statusService');
const telegramService = require('./telegramService');

module.exports = {
  ...configService,
  ...dailyImageScheduler,
  ...statusService,
  ...telegramService,
};

