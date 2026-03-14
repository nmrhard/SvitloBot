const { DataTypes } = require('sequelize');

const sequelize = require('../config/database');

const ContactList = sequelize.define(
  'ContactList',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'default',
    },
    chatId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    threadId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dailyThreadId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dailyGroupKey: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'GPV5.1',
    },
    dailyPngUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    dailyJsonUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'contact_list',
    timestamps: true,
    underscored: true,
  },
);

module.exports = ContactList;
