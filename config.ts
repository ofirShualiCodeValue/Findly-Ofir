import * as dotenv from 'dotenv';
dotenv.config();

import convict from 'convict';

const config = convict({
  env: {
    doc: 'Application environment',
    format: ['development', 'staging', 'production', 'test'],
    default: 'development',
    env: 'NODE_ENV',
  },
  port: {
    doc: 'HTTP server bind port',
    format: 'port',
    default: 3000,
    env: 'PORT',
  },
  db: {
    host: { doc: 'PostgreSQL host', format: String, default: 'localhost', env: 'DB_HOST' },
    port: { doc: 'PostgreSQL port', format: 'port', default: 5432, env: 'DB_PORT' },
    name: { doc: 'PostgreSQL database name', format: String, default: 'findly_dev', env: 'DB_NAME' },
    user: { doc: 'PostgreSQL user', format: String, default: 'findly', env: 'DB_USER' },
    password: { doc: 'PostgreSQL password', format: String, default: '', env: 'DB_PASSWORD', sensitive: true },
  },
  redis: {
    host: { doc: 'Redis host', format: String, default: 'localhost', env: 'REDIS_HOST' },
    port: { doc: 'Redis port', format: 'port', default: 6379, env: 'REDIS_PORT' },
    password: { doc: 'Redis password', format: String, default: '', env: 'REDIS_PASSWORD', sensitive: true },
  },
  jwt: {
    secret: { doc: 'JWT signing secret (HS256)', format: String, default: '', env: 'JWT_SECRET', sensitive: true },
    expiresIn: { doc: 'JWT TTL', format: String, default: '7d', env: 'JWT_EXPIRES_IN' },
  },
  cors: {
    origins: {
      doc: 'Comma-separated list of allowed origins',
      format: String,
      default: 'http://localhost:3000',
      env: 'CORS_ORIGINS',
    },
  },
  log: {
    level: { doc: 'Log level', format: String, default: 'info', env: 'LOG_LEVEL' },
  },
});

config.validate({ allowed: 'strict' });

export default config;
