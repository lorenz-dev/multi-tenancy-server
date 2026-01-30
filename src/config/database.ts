import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../drizzle/schema';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/claims_db';

export const queryClient = postgres(connectionString, {
  max: parseInt(process.env.DB_POOL_MAX || '10'),
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, { schema });

export async function closeDatabaseConnection() {
  await queryClient.end();
}
