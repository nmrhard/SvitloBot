const healthController = require('./healthController');
const internalController = require('./internalController');
const monitorController = require('./monitorController');

module.exports = {
  ...healthController,
  ...internalController,
  ...monitorController,
};

