const { DataTypes } = require('sequelize');

const sequelize = require('../config/database');

const DailyCheckSchedule = sequelize.define(
  'DailyCheckSchedule',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    contactId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'contact_list',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    startHour: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 20,
      validate: {
        min: 0,
        max: 23,
      },
    },
    startMinute: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 59,
      },
    },
    endHour: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 23,
      validate: {
        min: 0,
        max: 23,
      },
    },
    endMinute: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 59,
      validate: {
        min: 0,
        max: 59,
      },
    },
    intervalMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
      validate: {
        min: 1,
      },
    },
    timezone: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Europe/Kyiv',
    },
    jsonMaxAgeHours: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 24,
    },
    requireNonYesValues: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    sendTodayInitial: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'daily_check_schedule',
    timestamps: true,
    underscored: true,
  },
);

module.exports = DailyCheckSchedule;
