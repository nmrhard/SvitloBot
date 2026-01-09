const healthController = require('./healthController');
const monitorController = require('./monitorController');

module.exports = {
  ...healthController,
  ...monitorController,
};

