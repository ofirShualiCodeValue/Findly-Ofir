require('dotenv').config();

const common = {
  username: process.env.DB_USER || 'findly',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'findly_dev',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  dialect: 'postgres',
};

module.exports = {
  development: { ...common },
  test: {
    ...common,
    database: process.env.DB_NAME_TEST || 'findly_test',
  },
  staging: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  },
  production: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  },
};
