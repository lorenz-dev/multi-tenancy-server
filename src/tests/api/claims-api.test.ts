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
import { organizations, claims } from '../../drizzle/schema';

describe('Claims API - Basic CRUD', () => {
  let org: typeof organizations.$inferSelect;
  let adminToken: string;

  beforeEach(async () => {
    await cleanup();
    org = await createTestOrganization('Test Organization');
    adminToken = generateAuthToken('admin-001', org.id, 'admin');
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('POST /api/claims', () => {
    it('should create a new claim', async () => {
      const patientId = generateId('pat');
      const providerId = generateId('pro');
      const claimData = {
        patientId,
        providerId,
        diagnosisCode: 'A00.0',
        amount: 1500.50,
      };

      const response = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(claimData)
        .expect(201);

      expect(response.body.data).toMatchObject({
        patientId,
        status: 'submitted',
        organizationId: org.id,
      });
      expect(response.body.data.id).toBeDefined();
    });

    it('should reject invalid claim data', async () => {
      const response = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patientId: 'patient-001',
          // Missing required fields
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/claims/:id', () => {
    it('should get a claim by ID', async () => {
      const claim = await createTestClaim(org.id);

      const response = await request(app)
        .get(`/api/claims/${claim.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.id).toBe(claim.id);
      expect(response.body.data.patientId).toBe(claim.patientId);
    });

    it('should return 404 for non-existent claim', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .get(`/api/claims/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });
  });

  describe('GET /api/claims', () => {
    it('should list claims with pagination', async () => {
      // Create 3 claims
      await createTestClaim(org.id, { patientId: 'patient-001' });
      await createTestClaim(org.id, { patientId: 'patient-002' });
      await createTestClaim(org.id, { patientId: 'patient-003' });

      const response = await request(app)
        .get('/api/claims?limit=2&offset=0')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.total).toBe(3);
      expect(response.body.pagination.hasMore).toBe(true);
    });

    it('should filter claims by status', async () => {
      await createTestClaim(org.id, { status: 'submitted' });
      await createTestClaim(org.id, { status: 'approved' });
      await createTestClaim(org.id, { status: 'submitted' });

      const response = await request(app)
        .get('/api/claims?status=submitted')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every((c: typeof claims.$inferSelect) => c.status === 'submitted')).toBe(true);
    });
  });

  describe('PATCH /api/claims/:id', () => {
    it('should update a claim', async () => {
      const claim = await createTestClaim(org.id, {
        status: 'submitted',
        assignedProcessorId: 'processor-001',
      });

      const response = await request(app)
        .patch(`/api/claims/${claim.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'under_review' })
        .expect(200);

      expect(response.body.data.status).toBe('under_review');
    });

    it('should reject invalid status transitions', async () => {
      const claim = await createTestClaim(org.id, { status: 'approved' });

      const response = await request(app)
        .patch(`/api/claims/${claim.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'submitted' })
        .expect(403);

      expect(response.body.error.message).toContain('Cannot modify approved');
    });

    it('should prevent modification of approved claims', async () => {
      const claim = await createTestClaim(org.id, { status: 'approved' });

      const response = await request(app)
        .patch(`/api/claims/${claim.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ amount: 5000 })
        .expect(403);

      expect(response.body.error.message).toContain('Cannot modify approved');
    });
  });

  describe('POST /api/claims/bulk-status-update', () => {
    it('should bulk update claim statuses', async () => {
      const claim1 = await createTestClaim(org.id, { status: 'submitted' });
      const claim2 = await createTestClaim(org.id, { status: 'submitted' });

      const response = await request(app)
        .post('/api/claims/bulk-status-update')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          claimIds: [claim1.id, claim2.id],
          status: 'under_review',
        })
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every((c: typeof claims.$inferSelect) => c.status === 'under_review')).toBe(true);
    });
  });
});
