// Tests must never load the real config (DB/Redis URLs, JWT secret).
// Set safe defaults BEFORE convict's `validate({allowed: 'strict'})` runs
// when any module transitively imports `config.ts`.
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'findly_test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.JWT_SECRET = 'test-secret-not-for-production';
