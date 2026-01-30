import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import {
  createTestOrganization,
  createTestClaim,
  generateAuthToken,
  generateId,
  cleanup,
} from '../utils/test-helpers';
import { db } from '../../config/database';
import { claims } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Concurrency Tests - Integration', () => {
  let org: any;
  let claim: any;
  let processor1Token: string;
  let processor2Token: string;

  beforeEach(async () => {
    await cleanup();

    org = await createTestOrganization('Test Org');

    claim = await createTestClaim(org.id, {
      status: 'submitted',
      assignedProcessorId: 'processor-001',
    });

    processor1Token = generateAuthToken('processor-001', org.id, 'processor');
    processor2Token = generateAuthToken('processor-002', org.id, 'processor');
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('concurrent claim updates', () => {
    it('should handle two processors updating the same claim simultaneously', async () => {
      const claim1 = await createTestClaim(org.id, {
        status: 'submitted',
        assignedProcessorId: 'processor-001',
      });

      const processor1Request = request(app)
        .patch(`/api/claims/${claim1.id}`)
        .set('Authorization', `Bearer ${processor1Token}`)
        .send({ status: 'under_review' });

      const processor2Request = request(app)
        .patch(`/api/claims/${claim1.id}`)
        .set('Authorization', `Bearer ${processor2Token}`)
        .send({ status: 'rejected' });

      const [result1, result2] = await Promise.all([
        processor1Request,
        processor2Request,
      ]);

      expect(result1.status === 200 || result1.status === 403).toBe(true);
      expect(result2.status === 403 || result2.status === 404).toBe(true);

      const [finalClaim] = await db
        .select()
        .from(claims)
        .where(eq(claims.id, claim1.id));

      expect(finalClaim.status).toMatch(/submitted|under_review/);
      expect(finalClaim).toBeDefined();
    });

    it('should handle multiple concurrent reads without conflicts', async () => {
      const claim1 = await createTestClaim(org.id, {
        status: 'submitted',
        assignedProcessorId: 'processor-001',
      });

      const requests = Array.from({ length: 10 }, () =>
        request(app)
          .get(`/api/claims/${claim1.id}`)
          .set('Authorization', `Bearer ${processor1Token}`)
      );

      const results = await Promise.all(requests);

      results.forEach((result) => {
        expect(result.status).toBe(200);
        expect(result.body.data.id).toBe(claim1.id);
      });
    });

    it('should handle concurrent bulk updates correctly', async () => {
      const adminToken = generateAuthToken('admin-001', org.id, 'admin');

      const claim1 = await createTestClaim(org.id, { status: 'submitted' });
      const claim2 = await createTestClaim(org.id, { status: 'submitted' });
      const claim3 = await createTestClaim(org.id, { status: 'submitted' });

      const request1 = request(app)
        .post('/api/claims/bulk-status-update')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          claimIds: [claim1.id, claim2.id],
          status: 'under_review',
        });

      const request2 = request(app)
        .post('/api/claims/bulk-status-update')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          claimIds: [claim2.id, claim3.id],
          status: 'rejected',
        });

      const [result1, result2] = await Promise.all([request1, request2]);

      expect(result1.status).toBe(200);
      expect(result2.status).toBe(200);

      const [updatedClaim1] = await db
        .select()
        .from(claims)
        .where(eq(claims.id, claim1.id));
      const [updatedClaim2] = await db
        .select()
        .from(claims)
        .where(eq(claims.id, claim2.id));
      const [updatedClaim3] = await db
        .select()
        .from(claims)
        .where(eq(claims.id, claim3.id));

      expect(updatedClaim1.status).toMatch(/under_review|rejected/);
      expect(updatedClaim2.status).toMatch(/under_review|rejected/);
      expect(updatedClaim3.status).toMatch(/under_review|rejected/);
    });

    it('should handle concurrent create operations', async () => {
      const processorToken = generateAuthToken('processor-001', org.id, 'processor');

      const createRequests = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/api/claims')
          .set('Authorization', `Bearer ${processorToken}`)
          .send({
            patientId: generateId(`pat${i}`),
            providerId: generateId('pro'),
            diagnosisCode: 'A00.0',
            amount: 1000 + i * 100,
          })
      );

      const results = await Promise.all(createRequests);

      results.forEach((result) => {
        expect(result.status).toBe(201);
        expect(result.body.data).toHaveProperty('id');
      });

      const createdClaimIds = results.map((r) => r.body.data.id);
      expect(new Set(createdClaimIds).size).toBe(5);
    });

    it('should maintain data consistency during concurrent list operations', async () => {
      await createTestClaim(org.id, { status: 'submitted' });
      await createTestClaim(org.id, { status: 'under_review' });
      await createTestClaim(org.id, { status: 'approved' });

      const adminToken = generateAuthToken('admin-001', org.id, 'admin');

      const listRequests = Array.from({ length: 10 }, () =>
        request(app)
          .get('/api/claims')
          .set('Authorization', `Bearer ${adminToken}`)
      );

      const results = await Promise.all(listRequests);

      const firstResultCount = results[0].body.data.length;

      results.forEach((result) => {
        expect(result.status).toBe(200);
        expect(result.body.data.length).toBe(firstResultCount);
      });
    });
  });

  describe('race conditions with cache', () => {
    it('should handle cache invalidation during concurrent updates', async () => {
      const adminToken = generateAuthToken('admin-001', org.id, 'admin');

      const claim1 = await createTestClaim(org.id, { status: 'submitted' });

      await request(app)
        .get(`/api/claims/${claim1.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      const updateRequest = request(app)
        .patch(`/api/claims/${claim1.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'under_review' });

      const readRequest = request(app)
        .get(`/api/claims/${claim1.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      const [updateResult, readResult] = await Promise.all([
        updateRequest,
        readRequest,
      ]);

      expect(updateResult.status).toBe(200);
      expect(readResult.status).toBe(200);

      expect(
        readResult.body.data.status === 'submitted' ||
        readResult.body.data.status === 'under_review'
      ).toBe(true);
    });

    it('should not serve stale cache after concurrent updates', async () => {
      const adminToken = generateAuthToken('admin-001', org.id, 'admin');

      const claim1 = await createTestClaim(org.id, { status: 'submitted' });

      await request(app)
        .get(`/api/claims/${claim1.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      await request(app)
        .patch(`/api/claims/${claim1.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'under_review' });

      const readResult = await request(app)
        .get(`/api/claims/${claim1.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(readResult.status).toBe(200);
      expect(readResult.body.data.status).toBe('under_review');
    });
  });

  describe('concurrent job processing', () => {
    it('should handle multiple admission jobs for different patients simultaneously', async () => {
      const claim1 = await createTestClaim(org.id, {
        patientId: 'patient-001',
        status: 'submitted',
      });
      const claim2 = await createTestClaim(org.id, {
        patientId: 'patient-002',
        status: 'submitted',
      });
      const claim3 = await createTestClaim(org.id, {
        patientId: 'patient-003',
        status: 'submitted',
      });

      const adminToken = generateAuthToken('admin-001', org.id, 'admin');

      const requests = [
        request(app)
          .post('/api/patient-history')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            patientId: 'patient-001',
            eventType: 'admission',
            occurredAt: new Date().toISOString(),
          }),
        request(app)
          .post('/api/patient-history')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            patientId: 'patient-002',
            eventType: 'admission',
            occurredAt: new Date().toISOString(),
          }),
        request(app)
          .post('/api/patient-history')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            patientId: 'patient-003',
            eventType: 'admission',
            occurredAt: new Date().toISOString(),
          }),
      ];

      const results = await Promise.all(requests);

      results.forEach((result) => {
        expect(result.status).toBe(201);
      });
    });
  });
});
