const configService = require('./configService');
const dailyImageScheduler = require('./dailyImageScheduler');
const outageReasonService = require('./outageReasonService');
const statusService = require('./statusService');
const telegramService = require('./telegramService');

module.exports = {
  ...configService,
  ...dailyImageScheduler,
  ...outageReasonService,
  ...statusService,
  ...telegramService,
};

