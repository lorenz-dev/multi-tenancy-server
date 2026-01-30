import { db } from '../../config/database';
import { organizations, claims, patientHistories, claimsAudit } from '../../drizzle/schema';
import { generateTestToken } from '../../utils/jwt.utils';
import { redis } from '../../config/redis';
import { sql } from 'drizzle-orm';

let cleanupLock: Promise<void> | null = null;

export async function createTestOrganization(name: string = 'Test Org') {
  const [org] = await db
    .insert(organizations)
    .values({ name })
    .returning();
  return org;
}

export function generateId(prefix: string = 'id'): string {
  return `${prefix}${Date.now()}${Math.random().toString(36).substring(2, 9)}`.substring(0, 20).padEnd(20, '0');
}

export async function createTestClaim(organizationId: string, overrides: Partial<typeof claims.$inferInsert> = {}) {
  const [claim] = await db
    .insert(claims)
    .values({
      organizationId,
      patientId: overrides.patientId || generateId('pat'),
      providerId: overrides.providerId || generateId('pro'),
      diagnosisCode: 'A00.0',
      amount: '1000.00',
      status: 'submitted',
      ...overrides,
    })
    .returning();
  return claim;
}

export async function createTestPatientHistory(
  organizationId: string,
  patientId: string,
  eventType: 'admission' | 'discharge' | 'treatment' = 'admission'
) {
  const [event] = await db
    .insert(patientHistories)
    .values({
      organizationId,
      patientId,
      eventType,
      occurredAt: new Date().toISOString(),
    })
    .returning();
  return event;
}

export function generateAuthToken(
  userId: string,
  organizationId: string,
  role: 'admin' | 'processor' | 'provider' | 'patient' = 'admin'
) {
  return generateTestToken(userId, organizationId, role);
}

export async function cleanupDatabase() {
  if (cleanupLock) {
    await cleanupLock;
  }

  cleanupLock = (async () => {
    try {
      await db.execute(sql`TRUNCATE TABLE organizations, claims, patient_histories, claims_audit RESTART IDENTITY CASCADE`);
    } finally {
      cleanupLock = null;
    }
  })();

  await cleanupLock;
}

export async function cleanupRedis() {
  await redis.flushdb();
}

export async function cleanup() {
  await cleanupRedis();
  await cleanupDatabase();
}
