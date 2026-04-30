import convict from 'convict';

const config = convict({
  env: {
    doc: 'Application runtime environment',
    format: ['development', 'staging', 'production', 'test'],
    default: 'development',
    env: 'NODE_ENV',
  },
  port: {
    doc: 'HTTP port the server listens on',
    format: 'port',
    default: 3000,
    env: 'PORT',
  },
  database: {
    host: { format: String, default: 'localhost', env: 'DB_HOST' },
    port: { format: 'port', default: 5432, env: 'DB_PORT' },
    username: { format: String, default: 'findly', env: 'DB_USER' },
    password: { format: String, default: '', sensitive: true, env: 'DB_PASSWORD' },
    database: { format: String, default: 'findly_dev', env: 'DB_NAME' },
    dialect: { format: String, default: 'postgres' as const },
  },
  redis: {
    host: { format: String, default: 'localhost', env: 'REDIS_HOST' },
    port: { format: 'port', default: 6379, env: 'REDIS_PORT' },
    password: { format: String, default: '', sensitive: true, env: 'REDIS_PASSWORD' },
  },
  jwt: {
    secret: { format: String, default: '', sensitive: true, env: 'JWT_SECRET' },
    expiresIn: { format: String, default: '7d', env: 'JWT_EXPIRES_IN' },
  },
  cors: {
    origins: {
      doc: 'Comma-separated list of allowed CORS origins',
      format: String,
      default: 'http://localhost:3000',
      env: 'CORS_ORIGINS',
    },
  },
  log: {
    level: { format: String, default: 'info', env: 'LOG_LEVEL' },
  },
});

config.validate({ allowed: 'strict' });

export default config.getProperties();
