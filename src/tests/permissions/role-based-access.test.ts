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

describe('Role-Based Access Control', () => {
  let org: typeof organizations.$inferSelect;
  let claim: typeof claims.$inferSelect;
  let adminToken: string;
  let processorToken: string;
  let providerToken: string;
  let patientToken: string;

  beforeEach(async () => {
    await cleanup();
    org = await createTestOrganization('Test Organization');

    // Create a claim assigned to processor-001
    claim = await createTestClaim(org.id, {
      patientId: 'patient-001',
      providerId: 'provider-001',
      assignedProcessorId: 'processor-001',
      status: 'submitted',
    });

    // Generate tokens for different roles
    adminToken = generateAuthToken('admin-001', org.id, 'admin');
    processorToken = generateAuthToken('processor-001', org.id, 'processor');
    providerToken = generateAuthToken('provider-001', org.id, 'provider');
    patientToken = generateAuthToken('patient-001', org.id, 'patient');
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('Admin Role', () => {
    it('should allow admin to view any claim', async () => {
      const response = await request(app)
        .get(`/api/claims/${claim.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.id).toBe(claim.id);
    });

    it('should allow admin to update any claim', async () => {
      const response = await request(app)
        .patch(`/api/claims/${claim.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'under_review' })
        .expect(200);

      expect(response.body.data.status).toBe('under_review');
    });

    it('should allow admin to perform bulk updates', async () => {
      const response = await request(app)
        .post('/api/claims/bulk-status-update')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          claimIds: [claim.id],
          status: 'under_review',
        })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
    });
  });

  describe('Processor Role', () => {
    it('should allow processor to view assigned claim', async () => {
      const response = await request(app)
        .get(`/api/claims/${claim.id}`)
        .set('Authorization', `Bearer ${processorToken}`)
        .expect(200);

      expect(response.body.data.id).toBe(claim.id);
    });

    it('should NOT allow processor to view unassigned claim', async () => {
      const unassignedClaim = await createTestClaim(org.id, {
        assignedProcessorId: 'processor-002',
      });

      const response = await request(app)
        .get(`/api/claims/${unassignedClaim.id}`)
        .set('Authorization', `Bearer ${processorToken}`)
        .expect(403);

      expect(response.body.error.message).toContain('assigned to you');
    });

    it('should allow processor to update assigned claim', async () => {
      const response = await request(app)
        .patch(`/api/claims/${claim.id}`)
        .set('Authorization', `Bearer ${processorToken}`)
        .send({ status: 'under_review' })
        .expect(200);

      expect(response.body.data.status).toBe('under_review');
    });

    it('should NOT allow processor to update unassigned claim', async () => {
      const unassignedClaim = await createTestClaim(org.id, {
        assignedProcessorId: 'processor-002',
      });

      const response = await request(app)
        .patch(`/api/claims/${unassignedClaim.id}`)
        .set('Authorization', `Bearer ${processorToken}`)
        .send({ status: 'under_review' })
        .expect(403);

      expect(response.body.error.message).toContain('assigned to you');
    });

    it('should NOT allow processor to perform bulk updates', async () => {
      const response = await request(app)
        .post('/api/claims/bulk-status-update')
        .set('Authorization', `Bearer ${processorToken}`)
        .send({
          claimIds: [claim.id],
          status: 'under_review',
        })
        .expect(403);

      expect(response.body.error.message).toContain('Only admins');
    });
  });

  describe('Provider Role', () => {
    it('should allow provider to view own claim', async () => {
      const response = await request(app)
        .get(`/api/claims/${claim.id}`)
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200);

      expect(response.body.data.id).toBe(claim.id);
    });

    it('should NOT allow provider to view other provider claims', async () => {
      const otherClaim = await createTestClaim(org.id, {
        providerId: 'provider-002',
      });

      const response = await request(app)
        .get(`/api/claims/${otherClaim.id}`)
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(403);

      expect(response.body.error.message).toContain('your own');
    });

    it('should NOT allow provider to update claims', async () => {
      const response = await request(app)
        .patch(`/api/claims/${claim.id}`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'approved' })
        .expect(403);

      expect(response.body.error.message).toContain('cannot update');
    });

    it('should allow provider to create claims', async () => {
      const response = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          patientId: generateId('pat'),
          providerId: generateId('pro'),
          diagnosisCode: 'A00.0',
          amount: 1000,
        })
        .expect(201);

      expect(response.body.data.id).toBeDefined();
    });
  });

  describe('Patient Role', () => {
    it('should allow patient to view own claim', async () => {
      const response = await request(app)
        .get(`/api/claims/${claim.id}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);

      expect(response.body.data.id).toBe(claim.id);
    });

    it('should NOT allow patient to view other patient claims', async () => {
      const otherClaim = await createTestClaim(org.id, {
        patientId: 'patient-002',
      });

      const response = await request(app)
        .get(`/api/claims/${otherClaim.id}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(403);

      expect(response.body.error.message).toContain('your own');
    });

    it('should NOT allow patient to update claims', async () => {
      const response = await request(app)
        .patch(`/api/claims/${claim.id}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ status: 'approved' })
        .expect(403);

      expect(response.body.error.message).toContain('cannot update');
    });

    it('should NOT allow patient to create claims', async () => {
      const response = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          patientId: generateId('pat'),
          providerId: generateId('pro'),
          diagnosisCode: 'A00.0',
          amount: 1000,
        })
        .expect(403);

      expect(response.body.error.message).toContain('cannot create');
    });
  });

  describe('Authentication', () => {
    it('should reject requests without token', async () => {
      const response = await request(app)
        .get(`/api/claims/${claim.id}`)
        .expect(401);

      expect(response.body.error.message).toContain('No token');
    });

    it('should reject requests with invalid token', async () => {
      const response = await request(app)
        .get(`/api/claims/${claim.id}`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error.message).toContain('Invalid token');
    });
  });
});
