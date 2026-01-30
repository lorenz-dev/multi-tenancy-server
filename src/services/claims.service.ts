import { ClaimsRepository } from '../repositories/claims.repository';
import { getTenantContext } from '../utils/tenant-context';
import { NotFoundError, ForbiddenError, BusinessRuleError } from '../errors';
import type { Claim } from '../drizzle/types';
import { CreateClaimInput, UpdateClaimInput, ListClaimsQuery, BulkStatusUpdateInput } from '../validators/claims.validator';
import { PaginatedResponse } from '../types/index';
import {
  cacheGet,
  cacheSet,
  cacheDel,
  cacheDelPattern,
  buildClaimCacheKey,
  CACHE_TTL,
} from '../config/cache';
import { claimStatusTransitions, claimsCreatedTotal } from '../config/metrics';

export class ClaimsService {
  private repository: ClaimsRepository;

  constructor() {
    this.repository = new ClaimsRepository();
  }

  async createClaim(input: CreateClaimInput): Promise<Claim> {
    const { organizationId } = getTenantContext();

    this.checkCreatePermission();

    const claim = await this.repository.create(input);

    claimsCreatedTotal.inc({ organization_id: organizationId });

    await cacheDelPattern(`claims:${organizationId}:*`);

    return claim;
  }

  async getClaim(claimId: string): Promise<Claim> {
    const { organizationId } = getTenantContext();
    const cacheKey = buildClaimCacheKey(organizationId, claimId);

    const cached = await cacheGet<Claim>(cacheKey, 'claim');
    if (cached) {
      this.checkReadPermission(cached);
      return cached;
    }

    const claim = await this.repository.findById(claimId);
    if (!claim) {
      throw new NotFoundError('Claim');
    }

    this.checkReadPermission(claim);

    await cacheSet(cacheKey, claim, CACHE_TTL.CLAIM);

    return claim;
  }

  async listClaims(query: ListClaimsQuery): Promise<PaginatedResponse<Claim>> {
    const modifiedQuery = this.applyRoleFilters(query);

    const result = await this.repository.list(modifiedQuery);

    return result;
  }

  async updateClaim(claimId: string, updates: UpdateClaimInput): Promise<Claim> {
    const { organizationId } = getTenantContext();

    const claim = await this.repository.findById(claimId);
    if (!claim) {
      throw new NotFoundError('Claim');
    }

    this.checkUpdatePermission(claim);

    if (['approved', 'paid'].includes(claim.status)) {
      throw new ForbiddenError('Cannot modify approved or paid claims');
    }

    if (updates.status && updates.status !== claim.status) {
      this.validateStatusTransition(claim.status, updates.status);

      claimStatusTransitions.inc({
        from_status: claim.status,
        to_status: updates.status,
      });
    }

    const updated = await this.repository.update(claimId, updates);

    const cacheKey = buildClaimCacheKey(organizationId, claimId);
    await cacheDel(cacheKey);
    await cacheDelPattern(`claims:${organizationId}:*`);

    return updated;
  }

  async bulkUpdateStatus(input: BulkStatusUpdateInput): Promise<Claim[]> {
    const { organizationId, role } = getTenantContext();

    if (role !== 'admin') {
      throw new ForbiddenError('Only admins can perform bulk status updates');
    }

    const claims = await Promise.all(
      input.claimIds.map(id => this.repository.findById(id))
    );

    const notFound = claims.findIndex(c => !c);
    if (notFound !== -1) {
      throw new NotFoundError(`Claim ${input.claimIds[notFound]}`);
    }

    const updated = await this.repository.bulkUpdateStatus(input.claimIds, input.status);

    await Promise.all(
      input.claimIds.map(id => cacheDel(buildClaimCacheKey(organizationId, id)))
    );
    await cacheDelPattern(`claims:${organizationId}:*`);

    updated.forEach(claim => {
      const originalClaim = claims.find(c => c!.id === claim.id);
      if (originalClaim && originalClaim.status !== claim.status) {
        claimStatusTransitions.inc({
          from_status: originalClaim.status,
          to_status: claim.status,
        });
      }
    });

    return updated;
  }

  private checkCreatePermission(): void {
    const { role } = getTenantContext();

    if (role === 'admin' || role === 'processor' || role === 'provider') {
      return;
    }

    throw new ForbiddenError('You cannot create claims');
  }

  private checkReadPermission(claim: Claim): void {
    const { userId, role } = getTenantContext();

    if (role === 'admin') {
      return;
    }

    if (role === 'processor') {
      if (claim.assignedProcessorId !== userId) {
        throw new ForbiddenError('You can only view claims assigned to you');
      }
      return;
    }

    if (role === 'provider') {
      if (claim.providerId !== userId) {
        throw new ForbiddenError('You can only view your own claims');
      }
      return;
    }

    if (role === 'patient') {
      if (claim.patientId !== userId) {
        throw new ForbiddenError('You can only view your own claims');
      }
      return;
    }
  }

  private checkUpdatePermission(claim: Claim): void {
    const { userId, role } = getTenantContext();

    if (role === 'admin') {
      return;
    }

    if (role === 'processor') {
      if (claim.assignedProcessorId !== userId) {
        throw new ForbiddenError('You can only update claims assigned to you');
      }
      return;
    }

    throw new ForbiddenError('You cannot update claims');
  }

  private applyRoleFilters(query: ListClaimsQuery): ListClaimsQuery {
    const { userId, role } = getTenantContext();

    if (role === 'admin') {
      return query;
    }

    if (role === 'processor') {
      return { ...query, assignedProcessorId: userId, patientId: undefined, providerId: undefined };
    }

    if (role === 'provider') {
      return { ...query, providerId: userId, patientId: undefined };
    }

    if (role === 'patient') {
      return { ...query, patientId: userId, providerId: undefined };
    }

    return query;
  }

  private validateStatusTransition(currentStatus: string, newStatus: string): void {
    const validTransitions: Record<string, string[]> = {
      submitted: ['under_review', 'rejected'],
      under_review: ['approved', 'rejected'],
      approved: ['paid'],
      rejected: [],
      paid: [],
    };

    const allowed = validTransitions[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new BusinessRuleError(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
        'INVALID_STATUS_TRANSITION',
        { currentStatus, newStatus, allowedTransitions: allowed }
      );
    }
  }
}
