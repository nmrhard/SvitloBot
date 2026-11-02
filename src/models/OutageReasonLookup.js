const { DataTypes } = require('sequelize');

const sequelize = require('../config/database');

// Single-row table: sent offline message waiting for DTEK outage reason
const OutageReasonLookup = sequelize.define(
  'OutageReasonLookup',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
    eventTime: {
      type: DataTypes.INTEGER, // UNIX timestamp of offline event, null when no lookup is active
      allowNull: true,
    },
    messageId: {
      type: DataTypes.INTEGER, // Telegram message_id of offline message to edit
      allowNull: true,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    nextCheckAt: {
      type: DataTypes.INTEGER, // UNIX timestamp of next scraper run
      allowNull: true,
    },
    deadlineAt: {
      type: DataTypes.INTEGER, // UNIX timestamp after which lookup stops
      allowNull: true,
    },
  },
  {
    tableName: 'outage_reason_lookup',
    timestamps: false,
  },
);

module.exports = OutageReasonLookup;
