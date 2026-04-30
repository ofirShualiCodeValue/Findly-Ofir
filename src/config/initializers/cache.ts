import { createClient, RedisClientType } from 'redis';
import config from '../../../config';

let client: RedisClientType | null = null;

export function getCache(): RedisClientType {
  if (!client) {
    throw new Error('Cache not initialized — call connectCache() first');
  }
  return client;
}

export async function connectCache(): Promise<void> {
  if (client?.isOpen) return;

  client = createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port,
    },
    password: config.redis.password || undefined,
  });

  client.on('error', (err) => {
    console.error('[cache] redis client error:', err);
  });

  await client.connect();
}

export async function disconnectCache(): Promise<void> {
  if (client?.isOpen) {
    await client.quit();
    client = null;
  }
}
