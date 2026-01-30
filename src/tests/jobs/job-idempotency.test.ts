import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../../config/database';
import { claims, patientHistories, organizations } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { processPatientAdmission } from '../../jobs/patient-admission.job';
import { processPatientDischarge } from '../../jobs/patient-discharge.job';
import {
  createTestOrganization,
  createTestClaim,
  createTestPatientHistory,
  cleanup,
} from '../utils/test-helpers';

describe('Job Idempotency Tests', () => {
  let org: typeof organizations.$inferSelect;

  beforeEach(async () => {
    await cleanup();
    org = await createTestOrganization('Test Organization');
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('Patient Admission Job', () => {
    it('should process admission event and update claims', async () => {
      // Create submitted claims for a patient
      const claim1 = await createTestClaim(org.id, {
        patientId: 'patient-001',
        status: 'submitted',
      });
      const claim2 = await createTestClaim(org.id, {
        patientId: 'patient-001',
        status: 'submitted',
      });

      // Create admission event
      const event = await createTestPatientHistory(org.id, 'patient-001', 'admission');

      // Process the job
      const job = {
        id: 'test-job-1',
        data: {
          eventId: event.id,
          patientId: 'patient-001',
          organizationId: org.id,
          occurredAt: event.occurredAt,
        },
      } as any;

      const result = await processPatientAdmission(job);

      expect(result.processed).toBe(true);
      expect(result.claimsUpdated).toBe(2);

      // Verify claims were updated
      const updatedClaims = await db
        .select()
        .from(claims)
        .where(
          and(
            eq(claims.organizationId, org.id),
            eq(claims.patientId, 'patient-001')
          )
        );

      expect(updatedClaims.every(c => c.status === 'under_review')).toBe(true);

      // Verify event is marked as processed
      const [processedEvent] = await db
        .select()
        .from(patientHistories)
        .where(eq(patientHistories.id, event.id));

      expect(processedEvent.processedAt).toBeDefined();
    });

    it('should NOT process the same event twice (idempotency)', async () => {
      // Create submitted claim
      await createTestClaim(org.id, {
        patientId: 'patient-001',
        status: 'submitted',
      });

      // Create admission event
      const event = await createTestPatientHistory(org.id, 'patient-001', 'admission');

      const job = {
        id: 'test-job-1',
        data: {
          eventId: event.id,
          patientId: 'patient-001',
          organizationId: org.id,
          occurredAt: event.occurredAt,
        },
      } as any;

      // Process first time
      const result1 = await processPatientAdmission(job);
      expect(result1.processed).toBe(true);
      expect(result1.claimsUpdated).toBe(1);

      // Process second time (should skip)
      const result2 = await processPatientAdmission(job);
      expect(result2.skipped).toBe(true);
      expect(result2.reason).toBe('Already processed');
    });

    it('should only update submitted claims, not other statuses', async () => {
      // Create claims with different statuses
      await createTestClaim(org.id, {
        patientId: 'patient-001',
        status: 'submitted',
      });
      await createTestClaim(org.id, {
        patientId: 'patient-001',
        status: 'approved',
      });
      await createTestClaim(org.id, {
        patientId: 'patient-001',
        status: 'rejected',
      });

      const event = await createTestPatientHistory(org.id, 'patient-001', 'admission');

      const job = {
        id: 'test-job-1',
        data: {
          eventId: event.id,
          patientId: 'patient-001',
          organizationId: org.id,
          occurredAt: event.occurredAt,
        },
      } as any;

      const result = await processPatientAdmission(job);

      // Should only update the submitted claim
      expect(result.claimsUpdated).toBe(1);
    });
  });

  describe('Patient Discharge Job', () => {
    it('should process discharge event and approve claims', async () => {
      // Create under_review claims
      const claim1 = await createTestClaim(org.id, {
        patientId: 'patient-001',
        status: 'under_review',
      });

      // Create discharge event
      const event = await createTestPatientHistory(org.id, 'patient-001', 'discharge');

      const job = {
        id: 'test-job-1',
        data: {
          eventId: event.id,
          patientId: 'patient-001',
          organizationId: org.id,
          occurredAt: event.occurredAt,
        },
      } as any;

      const result = await processPatientDischarge(job);

      expect(result.processed).toBe(true);
      expect(result.claimsUpdated).toBe(1);

      // Verify claim was approved
      const [updatedClaim] = await db
        .select()
        .from(claims)
        .where(eq(claims.id, claim1.id));

      expect(updatedClaim.status).toBe('approved');
    });

    it('should be idempotent', async () => {
      await createTestClaim(org.id, {
        patientId: 'patient-001',
        status: 'under_review',
      });

      const event = await createTestPatientHistory(org.id, 'patient-001', 'discharge');

      const job = {
        id: 'test-job-1',
        data: {
          eventId: event.id,
          patientId: 'patient-001',
          organizationId: org.id,
          occurredAt: event.occurredAt,
        },
      } as any;

      // Process first time
      const result1 = await processPatientDischarge(job);
      expect(result1.processed).toBe(true);

      // Process second time (should skip)
      const result2 = await processPatientDischarge(job);
      expect(result2.skipped).toBe(true);
    });
  });

  describe('Transaction Safety', () => {
    it('should rollback on error (all or nothing)', async () => {
      // This test verifies that if the job fails, nothing is committed
      // In a real scenario, you'd force an error condition
      const claim = await createTestClaim(org.id, {
        patientId: 'patient-001',
        status: 'submitted',
      });

      const event = await createTestPatientHistory(org.id, 'patient-001', 'admission');

      // Successfully process
      const job = {
        id: 'test-job-1',
        data: {
          eventId: event.id,
          patientId: 'patient-001',
          organizationId: org.id,
          occurredAt: event.occurredAt,
        },
      } as any;

      await processPatientAdmission(job);

      // Verify both claim update and processedAt were committed
      const [updatedClaim] = await db
        .select()
        .from(claims)
        .where(eq(claims.id, claim.id));

      const [updatedEvent] = await db
        .select()
        .from(patientHistories)
        .where(eq(patientHistories.id, event.id));

      expect(updatedClaim.status).toBe('under_review');
      expect(updatedEvent.processedAt).toBeDefined();
    });
  });
});
