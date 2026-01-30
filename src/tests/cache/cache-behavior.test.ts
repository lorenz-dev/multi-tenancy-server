import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { redis } from '../../config/redis';
import {
  createTestOrganization,
  createTestClaim,
  generateAuthToken,
  cleanup,
} from '../utils/test-helpers';
import { buildClaimCacheKey } from '../../config/cache';
import { organizations, claims } from '../../drizzle/schema';

describe('Cache Behavior Tests', () => {
  let org: typeof organizations.$inferSelect;
  let claim: typeof claims.$inferSelect;
  let adminToken: string;

  beforeEach(async () => {
    await cleanup();
    org = await createTestOrganization('Test Organization');
    claim = await createTestClaim(org.id);
    adminToken = generateAuthToken('admin-001', org.id, 'admin');
  });

  afterEach(async () => {
    await cleanup();
  });

  it('should cache claim after first fetch', async () => {
    const cacheKey = buildClaimCacheKey(org.id, claim.id);

    const before = await redis.get(cacheKey);
    expect(before).toBeNull();

    const response1 = await request(app)
      .get(`/api/claims/${claim.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const after = await redis.get(cacheKey);
    expect(after).toBeDefined();

    const cached = JSON.parse(after!);
    expect(cached.id).toBe(claim.id);
  });

  it('should invalidate cache on update', async () => {
    const cacheKey = buildClaimCacheKey(org.id, claim.id);

    await request(app)
      .get(`/api/claims/${claim.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const beforeUpdate = await redis.get(cacheKey);
    expect(beforeUpdate).toBeDefined();

    await request(app)
      .patch(`/api/claims/${claim.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'under_review' })
      .expect(200);

    const afterUpdate = await redis.get(cacheKey);
    expect(afterUpdate).toBeNull();
  });

  it('should return cached data on second fetch', async () => {
    const response1 = await request(app)
      .get(`/api/claims/${claim.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const cacheKey = buildClaimCacheKey(org.id, claim.id);
    const cachedData = JSON.parse((await redis.get(cacheKey))!);
    cachedData.patientId = 'CACHED_PATIENT_ID';
    await redis.setex(cacheKey, 300, JSON.stringify(cachedData));

    const response2 = await request(app)
      .get(`/api/claims/${claim.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response2.body.data.patientId).toBe('CACHED_PATIENT_ID');
  });

  it('should isolate cache by organization', async () => {
    const org2 = await createTestOrganization('Organization 2');
    const claim2 = await createTestClaim(org2.id, {
      patientId: 'patient-from-org-2',
    });

    const org1CacheKey = buildClaimCacheKey(org.id, claim.id);
    const org2CacheKey = buildClaimCacheKey(org2.id, claim2.id);

    const org1Token = generateAuthToken('admin-1', org.id, 'admin');
    const org2Token = generateAuthToken('admin-2', org2.id, 'admin');

    await request(app)
      .get(`/api/claims/${claim.id}`)
      .set('Authorization', `Bearer ${org1Token}`)
      .expect(200);

    await request(app)
      .get(`/api/claims/${claim2.id}`)
      .set('Authorization', `Bearer ${org2Token}`)
      .expect(200);

    const cached1 = await redis.get(org1CacheKey);
    const cached2 = await redis.get(org2CacheKey);

    expect(cached1).toBeDefined();
    expect(cached2).toBeDefined();

    const data1 = JSON.parse(cached1!);
    const data2 = JSON.parse(cached2!);

    expect(data1.organizationId).toBe(org.id);
    expect(data2.organizationId).toBe(org2.id);
  });
});
