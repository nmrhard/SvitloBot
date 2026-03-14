const configController = require('./configController');
const healthController = require('./healthController');
const internalController = require('./internalController');
const monitorController = require('./monitorController');

module.exports = {
  ...configController,
  ...healthController,
  ...internalController,
  ...monitorController,
};

