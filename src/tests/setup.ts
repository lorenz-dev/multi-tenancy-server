import { config } from 'dotenv';
import { beforeAll, afterAll } from 'vitest';
import { redis, closeRedisConnection } from '../config/redis';
import { closeDatabaseConnection } from '../config/database';

config({ path: '.env.test', override: true });

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes('test') && process.env.NODE_ENV !== 'test') {
    console.warn('Warning: Not using test database. Set NODE_ENV=test or use test DATABASE_URL');
  }
});

afterAll(async () => {
  await closeRedisConnection();
  await closeDatabaseConnection();
});
