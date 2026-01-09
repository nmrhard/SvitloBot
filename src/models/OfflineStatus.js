const { DataTypes } = require('sequelize');

const sequelize = require('../config/database');

const OfflineStatus = sequelize.define(
  'OfflineStatus',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    offlineStart: {
      type: DataTypes.INTEGER, // UNIX timestamp when offline started
      allowNull: true,
    },
    onlineStart: {
      type: DataTypes.INTEGER, // UNIX timestamp when online started
      allowNull: true,
    },
  },
  {
    tableName: 'status_timestamps',
    timestamps: false,
  }
);

module.exports = OfflineStatus;
