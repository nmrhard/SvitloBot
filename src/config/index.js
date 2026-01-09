const constants = require('./constants');
const sequelize = require('./database');

module.exports = {
  ...constants,
  sequelize,
};

