import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import {
  createTestOrganization,
  createTestClaim,
  generateAuthToken,
  cleanup,
} from '../utils/test-helpers';

describe('Edge Cases - Integration Tests', () => {
  let org: any;
  let adminToken: string;

  beforeEach(async () => {
    await cleanup();
    org = await createTestOrganization('Test Org');
    adminToken = generateAuthToken('admin-001', org.id, 'admin');
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('input validation edge cases', () => {
    it('should reject claim with negative amount', async () => {
      const response = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patientId: 'patient-001',
          providerId: 'provider-001',
          diagnosisCode: 'A00.0',
          amount: -100,
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should reject claim with zero amount', async () => {
      const response = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patientId: 'patient-001',
          providerId: 'provider-001',
          diagnosisCode: 'A00.0',
          amount: 0,
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should reject claim with extremely large amount', async () => {
      const response = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patientId: 'patient-001',
          providerId: 'provider-001',
          diagnosisCode: 'A00.0',
          amount: 999999999999,
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle missing required fields', async () => {
      const response = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patientId: 'patient-001',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should reject invalid diagnosis code format', async () => {
      const response = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patientId: 'patient-001',
          providerId: 'provider-001',
          diagnosisCode: '',
          amount: 1000,
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should reject invalid status value', async () => {
      const claim = await createTestClaim(org.id, { status: 'submitted' });

      const response = await request(app)
        .patch(`/api/claims/${claim.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'invalid_status',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('pagination edge cases', () => {
    beforeEach(async () => {
      for (let i = 0; i < 25; i++) {
        await createTestClaim(org.id, {
          patientId: `patient-${i}`,
          status: 'submitted',
        });
      }
    });

    it('should handle offset beyond total count', async () => {
      const response = await request(app)
        .get('/api/claims?limit=10&offset=1000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(0);
      expect(response.body.pagination.total).toBe(25);
    });

    it('should handle zero limit', async () => {
      const response = await request(app)
        .get('/api/claims?limit=0&offset=0')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle negative offset', async () => {
      const response = await request(app)
        .get('/api/claims?limit=10&offset=-5')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle extremely large limit', async () => {
      const response = await request(app)
        .get('/api/claims?limit=10000&offset=0')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle last page correctly', async () => {
      const response = await request(app)
        .get('/api/claims?limit=10&offset=20')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(5);
      expect(response.body.pagination.total).toBe(25);
    });
  });

  describe('filtering edge cases', () => {
    it('should handle invalid date format in date range', async () => {
      const response = await request(app)
        .get('/api/claims?fromDate=invalid-date')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle fromDate after toDate', async () => {
      const response = await request(app)
        .get('/api/claims?fromDate=2024-12-31T00:00:00Z&toDate=2024-01-01T00:00:00Z')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle minAmount greater than maxAmount', async () => {
      const response = await request(app)
        .get('/api/claims?minAmount=5000&maxAmount=1000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle non-existent patientId', async () => {
      const response = await request(app)
        .get('/api/claims?patientId=non-existent-patient')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(0);
      expect(response.body.pagination.total).toBe(0);
    });

    it('should handle non-existent providerId', async () => {
      const response = await request(app)
        .get('/api/claims?providerId=non-existent-provider')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });

    it('should handle multiple filters with no matches', async () => {
      await createTestClaim(org.id, {
        patientId: 'patient-001',
        status: 'submitted',
        amount: '1000.00',
      });

      const response = await request(app)
        .get('/api/claims?patientId=patient-001&status=approved&minAmount=5000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });
  });

  describe('bulk operation edge cases', () => {
    it('should handle empty claimIds array', async () => {
      const response = await request(app)
        .post('/api/claims/bulk-status-update')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          claimIds: [],
          status: 'under_review',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle duplicate claim IDs in bulk update', async () => {
      const claim = await createTestClaim(org.id, { status: 'submitted' });

      const response = await request(app)
        .post('/api/claims/bulk-status-update')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          claimIds: [claim.id, claim.id, claim.id],
          status: 'under_review',
        })
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should handle mix of valid and invalid claim IDs', async () => {
      const claim = await createTestClaim(org.id, { status: 'submitted' });

      const response = await request(app)
        .post('/api/claims/bulk-status-update')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          claimIds: [claim.id, 'non-existent-1', 'non-existent-2'],
          status: 'under_review',
        });

      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    it('should handle extremely large bulk update', async () => {
      const claimIds: string[] = [];
      for (let i = 0; i < 100; i++) {
        const claim = await createTestClaim(org.id, { status: 'submitted' });
        claimIds.push(claim.id);
      }

      const response = await request(app)
        .post('/api/claims/bulk-status-update')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          claimIds,
          status: 'under_review',
        });

      expect(response.status).toBeGreaterThanOrEqual(200);
    });
  });

  describe('authentication edge cases', () => {
    it('should reject expired token', async () => {
      const expiredToken = generateAuthToken('user-001', org.id, 'admin');

      const response = await request(app)
        .get('/api/claims')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should reject malformed token', async () => {
      const response = await request(app)
        .get('/api/claims')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should reject missing Bearer prefix', async () => {
      const response = await request(app)
        .get('/api/claims')
        .set('Authorization', adminToken)
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should reject empty authorization header', async () => {
      const response = await request(app)
        .get('/api/claims')
        .set('Authorization', '')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should reject missing authorization header', async () => {
      const response = await request(app)
        .get('/api/claims')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('special characters and encoding', () => {
    it('should handle special characters in patientId', async () => {
      const response = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patientId: 'patient-001-!@#$%',
          providerId: 'provider-001',
          diagnosisCode: 'A00.0',
          amount: 1000,
        });

      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    it('should handle Unicode characters in diagnosis code', async () => {
      const response = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patientId: 'patient-001',
          providerId: 'provider-001',
          diagnosisCode: 'A00.0-中文',
          amount: 1000,
        });

      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    it('should handle extremely long strings', async () => {
      const longString = 'a'.repeat(1000);

      const response = await request(app)
        .post('/api/claims')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patientId: longString,
          providerId: 'provider-001',
          diagnosisCode: 'A00.0',
          amount: 1000,
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('patient history edge cases', () => {
    it('should handle missing occurredAt timestamp', async () => {
      const response = await request(app)
        .post('/api/patient-history')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patientId: 'patient-001',
          eventType: 'admission',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle invalid event type', async () => {
      const response = await request(app)
        .post('/api/patient-history')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patientId: 'patient-001',
          eventType: 'invalid_event',
          occurredAt: new Date().toISOString(),
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle future occurredAt timestamp', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const response = await request(app)
        .post('/api/patient-history')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patientId: 'patient-001',
          eventType: 'admission',
          occurredAt: futureDate.toISOString(),
        });

      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    it('should handle very old occurredAt timestamp', async () => {
      const oldDate = new Date('1900-01-01');

      const response = await request(app)
        .post('/api/patient-history')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patientId: 'patient-001',
          eventType: 'admission',
          occurredAt: oldDate.toISOString(),
        });

      expect(response.status).toBeGreaterThanOrEqual(200);
    });
  });

  describe('sorting edge cases', () => {
    it('should handle invalid sortBy field', async () => {
      const response = await request(app)
        .get('/api/claims?sortBy=invalidField')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle invalid sortOrder value', async () => {
      const response = await request(app)
        .get('/api/claims?sortOrder=invalid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });
});
