const { DataTypes } = require('sequelize');

const sequelize = require('../config/database');

// Single-row table: offline message waiting for DTEK outage reason
const PendingOutage = sequelize.define(
  'PendingOutage',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
    eventTime: {
      type: DataTypes.INTEGER, // UNIX timestamp of offline event, null when nothing pending
      allowNull: true,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    deadlineAt: {
      type: DataTypes.INTEGER, // UNIX timestamp after which message is sent without reason
      allowNull: true,
    },
  },
  {
    tableName: 'pending_outage',
    timestamps: false,
  },
);

module.exports = PendingOutage;
