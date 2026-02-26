const { Sequelize } = require('sequelize');
const path = require('path');

const isTestEnvironment =
  process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
const testStoragePath =
  process.env.TEST_SQLITE_STORAGE || path.join(process.cwd(), '.vitest.sqlite');

const sequelize = isTestEnvironment
  ? new Sequelize({
      dialect: 'sqlite',
      logging: false,
      storage: testStoragePath,
    })
  : new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      dialectModule: require('pg'),
      logging: false,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      },
    });

module.exports = sequelize;

