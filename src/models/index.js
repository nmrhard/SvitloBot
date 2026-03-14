const ContactList = require('./ContactList');
const DailyCheckSchedule = require('./DailyCheckSchedule');
const DailyGraphState = require('./DailyGraphState');
const OfflineStatus = require('./OfflineStatus');

ContactList.hasMany(DailyCheckSchedule, {
  foreignKey: 'contactId',
  as: 'schedules',
  onDelete: 'CASCADE',
});

DailyCheckSchedule.belongsTo(ContactList, {
  foreignKey: 'contactId',
  as: 'contact',
});

module.exports = {
  ContactList,
  DailyCheckSchedule,
  DailyGraphState,
  OfflineStatus,
};

