// Jest global setup. Runs ONCE before any test file across all workers.
//
// Strategy:
//   We always boot a fresh, dedicated postgres container `findly-postgres-e2e`
//   on a free host port (5433+) and route the test app at it. This isolates
//   us from:
//     - The native PostgreSQL service on Windows (which on this box owns
//       host:5432 and intercepts connections to the dev container).
//     - The dev `findly-postgres` container's data (which we must not touch).
//   The image (postgres:16-alpine) is the same one the dev stack uses, so
//   it's already cached locally — startup is a couple of seconds.
//
// Steps:
//   1. Load `.env` and pin env vars.
//   2. Find a free host port (starting at 5433).
//   3. `docker rm -f` any leftover container, then `docker run` a fresh one.
//   4. Poll until pg accepts connections.
//   5. Drop + recreate the e2e database from scratch.
//   6. Apply every migration in `src/db/migrations/` and run the seeders so
//      the taxonomy is populated.
//
// We do NOT use `sequelize.sync()` because the model decorators don't include
// every constraint/index that the migrations add. Going through the real
// migrations means the e2e suite also serves as a migration smoke test.

/* eslint-disable @typescript-eslint/no-require-imports */
import { Client } from 'pg';
import { Sequelize, DataTypes } from 'sequelize';
import { execFile } from 'child_process';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

require('ts-node/register/transpile-only');

const execFileP = promisify(execFile);
const CONTAINER = 'findly-postgres-e2e';

function pinEnv(): void {
  require('dotenv').config();
  process.env.NODE_ENV = 'development';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_NAME = process.env.DB_NAME_E2E || 'findly_e2e';
  process.env.DB_USER = process.env.DB_USER || 'findly';
  process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
  process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-secret-not-for-production';
  process.env.LOG_LEVEL = 'error';
  if (!process.env.DB_PASSWORD) {
    throw new Error('DB_PASSWORD not set — check that .env exists at the project root');
  }
}

/** Returns a free TCP port on 127.0.0.1 (asks the OS for one). */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close();
        reject(new Error('Could not allocate port'));
      }
    });
  });
}

async function dockerOrThrow(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileP('docker', args, { windowsHide: true });
    return stdout;
  } catch (err) {
    const e = err as { code?: string; stderr?: string; message: string };
    if (e.code === 'ENOENT') {
      throw new Error('docker CLI not found on PATH — install Docker Desktop or add docker to PATH');
    }
    throw new Error(`docker ${args.join(' ')} failed: ${(e.stderr ?? e.message).trim()}`);
  }
}

async function startContainer(port: number): Promise<void> {
  // Best-effort cleanup of any leftover container from a previous (crashed) run.
  await execFileP('docker', ['rm', '-f', CONTAINER], { windowsHide: true }).catch(() => undefined);

  await dockerOrThrow([
    'run',
    '-d',
    '--name', CONTAINER,
    '-e', `POSTGRES_USER=${process.env.DB_USER}`,
    '-e', `POSTGRES_PASSWORD=${process.env.DB_PASSWORD}`,
    '-e', 'POSTGRES_DB=postgres',
    '-p', `127.0.0.1:${port}:5432`,
    '--health-cmd', `pg_isready -U ${process.env.DB_USER}`,
    '--health-interval', '1s',
    '--health-timeout', '3s',
    '--health-retries', '15',
    'postgres:16-alpine',
  ]);
}

async function waitForPg(port: number, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    const c = new Client({
      host: '127.0.0.1',
      port,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: 'postgres',
    });
    try {
      await c.connect();
      await c.query('SELECT 1');
      await c.end();
      return;
    } catch (err) {
      lastErr = err;
      await c.end().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Postgres at 127.0.0.1:${port} did not become ready: ${(lastErr as Error)?.message}`);
}

async function recreateDatabase(port: number, dbName: string): Promise<void> {
  const admin = new Client({
    host: '127.0.0.1',
    port,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres',
  });
  await admin.connect();
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();
}

async function runMigrationsAndSeed(port: number, dbName: string): Promise<void> {
  const sequelize = new Sequelize({
    dialect: 'postgres',
    host: '127.0.0.1',
    port,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: dbName,
    logging: false,
  });

  const qi = sequelize.getQueryInterface();
  const migrationDir = path.resolve(__dirname, '../db/migrations');
  const migrationFiles = fs.readdirSync(migrationDir).filter((f) => f.endsWith('.ts')).sort();

  for (const f of migrationFiles) {
    const mod = require(path.join(migrationDir, f));
    if (typeof mod.up !== 'function') {
      throw new Error(`Migration ${f} has no up() export`);
    }
    await mod.up(qi, DataTypes);
  }

  const { seedTaxonomy } = require('./helpers/seed');
  await seedTaxonomy(sequelize);

  await sequelize.close();
}

export default async function globalSetup(): Promise<void> {
  pinEnv();
  const port = await findFreePort();
  await startContainer(port);
  await waitForPg(port);

  // Surface the chosen port to test workers (jest.setup.ts treats it as
  // already-set so the default of 5432 doesn't override it). With
  // --runInBand they share this process's env, so this just works.
  process.env.DB_PORT = String(port);

  const dbName = process.env.DB_NAME!;
  await recreateDatabase(port, dbName);
  await runMigrationsAndSeed(port, dbName);
}
