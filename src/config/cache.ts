import { redis } from './redis';
import { logger } from '../utils/logger';
import { cacheHitCounter, cacheMissCounter } from './metrics';

export const CACHE_TTL = {
  CLAIM: parseInt(process.env.REDIS_CACHE_TTL_CLAIM || '300'),
  CLAIM_LIST: parseInt(process.env.REDIS_CACHE_TTL_LIST || '60'),
  PATIENT_HISTORY: 300,
};

export const isCacheEnabled = (): boolean => {
  return process.env.ENABLE_CACHE !== 'false';
};

export async function cacheGet<T>(key: string, cacheType: string = 'default'): Promise<T | null> {
  if (!isCacheEnabled()) {
    return null;
  }

  try {
    const cached = await redis.get(key);
    if (cached) {
      cacheHitCounter.inc({ cache_type: cacheType });
      return JSON.parse(cached) as T;
    }
    cacheMissCounter.inc({ cache_type: cacheType });
    return null;
  } catch (error) {
    logger.error('Cache get error', { key, error });
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttl: number): Promise<void> {
  if (!isCacheEnabled()) {
    return;
  }

  try {
    await redis.setex(key, ttl, JSON.stringify(value));
  } catch (error) {
    logger.error('Cache set error', { key, error });
  }
}

export async function cacheDel(key: string): Promise<void> {
  if (!isCacheEnabled()) {
    return;
  }

  try {
    await redis.del(key);
  } catch (error) {
    logger.error('Cache delete error', { key, error });
  }
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  if (!isCacheEnabled()) {
    return;
  }

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    logger.error('Cache delete pattern error', { pattern, error });
  }
}

export function buildClaimCacheKey(organizationId: string, claimId: string): string {
  return `claim:${organizationId}:${claimId}`;
}

export function buildClaimListCacheKey(organizationId: string, filters: Record<string, any>): string {
  const filterStr = Object.keys(filters)
    .sort()
    .map(key => `${key}:${filters[key]}`)
    .join('|');
  return `claims:${organizationId}:${filterStr}`;
}

export function buildPatientHistoryCacheKey(organizationId: string, patientId: string): string {
  return `patient_history:${organizationId}:${patientId}`;
}
