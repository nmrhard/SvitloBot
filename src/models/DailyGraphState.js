const { DataTypes } = require('sequelize');

const sequelize = require('../config/database');

const DailyGraphState = sequelize.define(
  'DailyGraphState',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
    missingNoticeDateKey: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    todayDateKey: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    todayHash: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    todayLastNotifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    tomorrowDateKey: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tomorrowHash: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tomorrowLastNotifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'daily_graph_state',
    timestamps: false,
  },
);

module.exports = DailyGraphState;
