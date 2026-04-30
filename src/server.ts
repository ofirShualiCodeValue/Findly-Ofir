import 'reflect-metadata';
import './config/initializers/env';

import http from 'http';
import config from '../config';
import app from './app';
import { sequelize } from './db/connection';
import { connectCache, disconnectCache } from './config/initializers/cache';

async function bootstrap(): Promise<void> {
  await sequelize.authenticate();
  console.log('[db] connected');

  await connectCache();
  console.log('[cache] connected');

  const server = http.createServer(app);

  server.listen(config.port, () => {
    console.log(`[server] listening on port ${config.port} (env=${config.env})`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[server] received ${signal}, shutting down gracefully`);
    server.close(async () => {
      try {
        await disconnectCache();
        await sequelize.close();
        console.log('[server] shutdown complete');
        process.exit(0);
      } catch (err) {
        console.error('[server] error during shutdown:', err);
        process.exit(1);
      }
    });

    setTimeout(() => {
      console.error('[server] forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    console.error('[server] unhandled rejection:', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('[server] uncaught exception:', err);
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  console.error('[server] bootstrap failed:', err);
  process.exit(1);
});
