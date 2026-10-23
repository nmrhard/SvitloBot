const ContactList = require('./ContactList');
const DailyCheckSchedule = require('./DailyCheckSchedule');
const DailyGraphState = require('./DailyGraphState');
const OfflineStatus = require('./OfflineStatus');
const PendingOutage = require('./PendingOutage');

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
  PendingOutage,
};

