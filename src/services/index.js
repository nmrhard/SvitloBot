const statusService = require('./statusService');
const telegramService = require('./telegramService');

module.exports = {
  ...statusService,
  ...telegramService,
};

