import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import {
  createTestOrganization,
  createTestClaim,
  generateAuthToken,
  cleanup,
} from '../utils/test-helpers';
import { organizations, claims } from '../../drizzle/schema';

describe('Tenant Isolation - Security Tests', () => {
  let org1: typeof organizations.$inferSelect;
  let org2: typeof organizations.$inferSelect;
  let org1Claim: typeof claims.$inferSelect;
  let org2Claim: typeof claims.$inferSelect;
  let org1Token: string;
  let org2Token: string;

  beforeEach(async () => {
    await cleanup();

    // Create two organizations
    org1 = await createTestOrganization('Organization 1');
    org2 = await createTestOrganization('Organization 2');

    // Create claims for each organization
    org1Claim = await createTestClaim(org1.id, {
      patientId: 'patient-001',
    });

    org2Claim = await createTestClaim(org2.id, {
      patientId: 'patient-002',
    });

    // Generate tokens
    org1Token = generateAuthToken('admin-1', org1.id, 'admin');
    org2Token = generateAuthToken('admin-2', org2.id, 'admin');
  });

  afterEach(async () => {
    await cleanup();
  });

  it('should NOT allow access to claims from other organizations', async () => {
    // Try to access org2's claim with org1's token
    const response = await request(app)
      .get(`/api/claims/${org2Claim.id}`)
      .set('Authorization', `Bearer ${org1Token}`)
      .expect(404);

    expect(response.body.error.message).toContain('not found');
  });

  it('should only list claims from own organization', async () => {
    // Org1 admin lists claims
    const response = await request(app)
      .get('/api/claims')
      .set('Authorization', `Bearer ${org1Token}`)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(org1Claim.id);
    expect(response.body.data[0].organizationId).toBe(org1.id);
  });

  it('should NOT allow updating claims from other organizations', async () => {
    // Try to update org2's claim with org1's token
    const response = await request(app)
      .patch(`/api/claims/${org2Claim.id}`)
      .set('Authorization', `Bearer ${org1Token}`)
      .send({ status: 'approved' })
      .expect(404);

    expect(response.body.error.message).toContain('not found');
  });

  it('should isolate claims by organization in bulk operations', async () => {
    // Try bulk update with mixed org claims
    const response = await request(app)
      .post('/api/claims/bulk-status-update')
      .set('Authorization', `Bearer ${org1Token}`)
      .send({
        claimIds: [org1Claim.id, org2Claim.id],
        status: 'under_review',
      })
      .expect(404);

    // Should fail because org2Claim is not accessible
    expect(response.body.error.message).toContain('not found');
  });

  it('should prevent URL parameter manipulation', async () => {
    // Even if someone tries to pass organizationId in query params, it should be ignored
    const response = await request(app)
      .get(`/api/claims/${org2Claim.id}?organizationId=${org2.id}`)
      .set('Authorization', `Bearer ${org1Token}`)
      .expect(404);

    expect(response.body.error.message).toContain('not found');
  });
});
