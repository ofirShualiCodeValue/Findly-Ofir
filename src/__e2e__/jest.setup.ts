// Runs in EACH worker before any test file is loaded.
// Load `.env` first (same as config.ts does) so the dev DB credentials are
// available, then pin the values config validation cares about.

/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config();

process.env.NODE_ENV = 'development';
process.env.DB_HOST = '127.0.0.1';
// DB_PORT is set by globalSetup to the dedicated container's mapped port.
// Always override the DB name so tests never touch the dev/prod DB.
process.env.DB_NAME = process.env.DB_NAME_E2E || 'findly_e2e';
process.env.DB_USER = process.env.DB_USER || 'findly';
// Don't fall back to a fake password here — we WANT to fail fast if .env
// isn't loaded so the developer notices instead of silently hitting a wrong DB.
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-secret-not-for-production';
process.env.LOG_LEVEL = 'error';

// Silence the chatter we expect during e2e:
//   - morgan request log (writes directly to process.stdout — bypasses console.*)
//   - sequelize SQL log (uses console.log)
//   - express default `app.logerror` which dumps stack traces for any 4xx
//     thrown by middleware. Our negative tests intentionally trigger 401/403,
//     so this noise is expected and would drown out real signal.
// Jest still prints test failures via its own reporter.
const noop = (): void => undefined;
console.log = noop as unknown as typeof console.log;
console.info = noop as unknown as typeof console.info;
console.debug = noop as unknown as typeof console.debug;
console.error = noop as unknown as typeof console.error;
console.warn = noop as unknown as typeof console.warn;

// Filter morgan's HTTP access log (it writes ANSI-colored lines like
// `\x1b[0mGET /v1/... \x1b[33m401\x1b[0m`). Pattern is specific enough to
// leave jest's own reporter output alone.
const MORGAN_LINE = /^\x1b\[\d+m(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /;
const realStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = ((
  chunk: string | Uint8Array,
  ...rest: unknown[]
): boolean => {
  if (typeof chunk === 'string' && MORGAN_LINE.test(chunk)) return true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (realStdoutWrite as any)(chunk, ...rest);
}) as typeof process.stdout.write;
