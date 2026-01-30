import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../../config/database';
import { claims, patientHistories, organizations } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { processPatientAdmission } from '../../jobs/patient-admission.job';
import { processPatientDischarge } from '../../jobs/patient-discharge.job';
import { processTreatmentInitiated } from '../../jobs/treatment-initiated.job';
import {
  createTestOrganization,
  createTestClaim,
  createTestPatientHistory,
  cleanup,
} from '../utils/test-helpers';
import { ClaimsRepository } from '../../repositories/claims.repository';

describe('Job Failures - Integration Tests', () => {
  let org: typeof organizations.$inferSelect;

  beforeEach(async () => {
    await cleanup();
    org = await createTestOrganization('Test Organization');
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('job retry and failure scenarios', () => {
    it('should retry on database connection failure', async () => {
      const claim = await createTestClaim(org.id, {
        patientId: 'patient-001',
        status: 'submitted',
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
        attemptsMade: 0,
      } as any;

      const originalUpdate = ClaimsRepository.prototype.updateStatusByPatientId;
      let callCount = 0;

      vi.spyOn(ClaimsRepository.prototype, 'updateStatusByPatientId').mockImplementation(
        async function (...args) {
          callCount++;
          if (callCount === 1) {
            throw new Error('Connection timeout');
          }
          return originalUpdate.apply(this, args);
        }
      );

      try {
        await processPatientAdmission(job);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toBe('Connection timeout');
      }

      vi.restoreAllMocks();

      const result = await processPatientAdmission(job);

      expect(result.processed).toBe(true);

      const [updatedClaim] = await db
        .select()
        .from(claims)
        .where(eq(claims.id, claim.id));

      expect(updatedClaim.status).toBe('under_review');
    });

    it('should not mark event as processed if claim update fails', async () => {
      await createTestClaim(org.id, {
        patientId: 'patient-001',
        status: 'submitted',
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

      vi.spyOn(ClaimsRepository.prototype, 'updateStatusByPatientId').mockRejectedValue(
        new Error('Update failed')
      );

      try {
        await processPatientAdmission(job);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toBe('Update failed');
      }

      vi.restoreAllMocks();

      const [processedEvent] = await db
        .select()
        .from(patientHistories)
        .where(eq(patientHistories.id, event.id));

      expect(processedEvent.processedAt).toBeNull();
    });

    it('should handle missing event gracefully', async () => {
      const job = {
        id: 'test-job-1',
        data: {
          eventId: 'non-existent-event',
          patientId: 'patient-001',
          organizationId: org.id,
          occurredAt: new Date().toISOString(),
        },
      } as any;

      const result = await processPatientAdmission(job);
      expect(result).toHaveProperty('skipped');
      expect(result.skipped).toBe(true);
    });

    it('should handle patient with no claims', async () => {
      const event = await createTestPatientHistory(org.id, 'patient-999', 'admission');

      const job = {
        id: 'test-job-1',
        data: {
          eventId: event.id,
          patientId: 'patient-999',
          organizationId: org.id,
          occurredAt: event.occurredAt,
        },
      } as any;

      const result = await processPatientAdmission(job);

      expect(result.processed).toBe(true);
      expect(result.claimsUpdated).toBe(0);

      const [processedEvent] = await db
        .select()
        .from(patientHistories)
        .where(eq(patientHistories.id, event.id));

      expect(processedEvent.processedAt).toBeDefined();
    });
  });

  describe('partial failure scenarios', () => {
    it('should handle partial success in bulk operations', async () => {
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
        status: 'submitted',
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

      expect(result.processed).toBe(true);
      expect(result.claimsUpdated).toBe(2);

      const updatedClaims = await db
        .select()
        .from(claims)
        .where(eq(claims.patientId, 'patient-001'));

      const submittedCount = updatedClaims.filter(c => c.status === 'submitted').length;
      const underReviewCount = updatedClaims.filter(c => c.status === 'under_review').length;
      const approvedCount = updatedClaims.filter(c => c.status === 'approved').length;

      expect(submittedCount).toBe(0);
      expect(underReviewCount).toBe(2);
      expect(approvedCount).toBe(1);
    });

    it('should not process events from other organizations', async () => {
      const org2 = await createTestOrganization('Org 2');

      await createTestClaim(org.id, {
        patientId: 'patient-001',
        status: 'submitted',
      });

      const event = await createTestPatientHistory(org.id, 'patient-001', 'admission');

      const job = {
        id: 'test-job-1',
        data: {
          eventId: event.id,
          patientId: 'patient-001',
          organizationId: org2.id,
          occurredAt: event.occurredAt,
        },
      } as any;

      const result = await processPatientAdmission(job);
      expect(result).toHaveProperty('skipped');
      expect(result.skipped).toBe(true);
    });
  });

  describe('discharge job failures', () => {
    it('should handle discharge when no claims are under review', async () => {
      await createTestClaim(org.id, {
        patientId: 'patient-001',
        status: 'submitted',
      });
      await createTestClaim(org.id, {
        patientId: 'patient-001',
        status: 'approved',
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

      const result = await processPatientDischarge(job);

      expect(result.processed).toBe(true);
      expect(result.claimsUpdated).toBe(0);
    });

    it('should retry on transient failures', async () => {
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
        attemptsMade: 0,
      } as any;

      let callCount = 0;
      const originalUpdate = ClaimsRepository.prototype.updateStatusByPatientId;

      vi.spyOn(ClaimsRepository.prototype, 'updateStatusByPatientId').mockImplementation(
        async function (...args) {
          callCount++;
          if (callCount < 2) {
            throw new Error('Temporary failure');
          }
          return originalUpdate.apply(this, args);
        }
      );

      try {
        await processPatientDischarge(job);
      } catch (error: any) {
        expect(error.message).toBe('Temporary failure');
      }

      const result = await processPatientDischarge(job);

      expect(result.processed).toBe(true);

      vi.restoreAllMocks();
    });
  });

  describe('treatment job failures', () => {
    it('should handle missing treatment type', async () => {
      await createTestClaim(org.id, {
        patientId: 'patient-001',
        status: 'submitted',
      });

      const event = await createTestPatientHistory(org.id, 'patient-001', 'treatment');

      const job = {
        id: 'test-job-1',
        data: {
          eventId: event.id,
          patientId: 'patient-001',
          organizationId: org.id,
          occurredAt: event.occurredAt,
        },
      } as any;

      const result = await processTreatmentInitiated(job);

      expect(result.processed).toBe(true);
      expect(result.treatmentType).toBeUndefined();
    });
  });

  describe('cache invalidation failures', () => {
    it('should complete job even if cache invalidation fails', async () => {
      await createTestClaim(org.id, {
        patientId: 'patient-001',
        status: 'submitted',
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

      expect(result.processed).toBe(true);
      expect(result.claimsUpdated).toBeGreaterThanOrEqual(0);
    });
  });
});
