import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClaimsService } from '../../../services/claims.service';
import { ClaimsRepository } from '../../../repositories/claims.repository';
import { NotFoundError, ForbiddenError, BusinessRuleError } from '../../../errors';
import * as tenantContext from '../../../utils/tenant-context';
import * as cache from '../../../config/cache';
import * as metrics from '../../../config/metrics';

vi.mock('../../../repositories/claims.repository');
vi.mock('../../../utils/tenant-context');
vi.mock('../../../config/cache', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
  cacheDelPattern: vi.fn(),
  buildClaimCacheKey: vi.fn((orgId, claimId) => `claim:${orgId}:${claimId}`),
  CACHE_TTL: { CLAIM: 300 },
}));
vi.mock('../../../config/metrics', () => ({
  claimStatusTransitions: { inc: vi.fn() },
  claimsCreatedTotal: { inc: vi.fn() },
}));

describe('ClaimsService - Unit Tests', () => {
  let service: ClaimsService;
  let mockRepository: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      bulkUpdateStatus: vi.fn(),
    };

    vi.mocked(ClaimsRepository).mockImplementation(() => mockRepository);

    vi.mocked(tenantContext.getTenantContext).mockReturnValue({
      organizationId: 'org-001',
      userId: 'user-001',
      role: 'admin',
    });

    vi.mocked(cache.cacheGet).mockResolvedValue(null);
    vi.mocked(cache.cacheSet).mockResolvedValue(undefined);
    vi.mocked(cache.cacheDel).mockResolvedValue(undefined);
    vi.mocked(cache.cacheDelPattern).mockResolvedValue(undefined);

    service = new ClaimsService();
  });

  describe('createClaim', () => {
    it('should create claim for admin role', async () => {
      const input = {
        patientId: 'patient-001',
        providerId: 'provider-001',
        diagnosisCode: 'A00.0',
        amount: 1000.00,
      };

      const createdClaim = {
        id: 'claim-001',
        organizationId: 'org-001',
        ...input,
        amount: '1000.00',
        status: 'submitted',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockRepository.create.mockResolvedValue(createdClaim);

      const result = await service.createClaim(input);

      expect(result).toEqual(createdClaim);
      expect(mockRepository.create).toHaveBeenCalledWith(input);
      expect(metrics.claimsCreatedTotal.inc).toHaveBeenCalledWith({ organization_id: 'org-001' });
      expect(cache.cacheDelPattern).toHaveBeenCalledWith('claims:org-001:*');
    });

    it('should throw ForbiddenError for patient role', async () => {
      vi.mocked(tenantContext.getTenantContext).mockReturnValue({
        organizationId: 'org-001',
        userId: 'user-001',
        role: 'patient',
      });

      const input = {
        patientId: 'patient-001',
        providerId: 'provider-001',
        diagnosisCode: 'A00.0',
        amount: 1000.00,
      };

      await expect(service.createClaim(input)).rejects.toThrow('cannot create');
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('should allow processor to create claims', async () => {
      vi.mocked(tenantContext.getTenantContext).mockReturnValue({
        organizationId: 'org-001',
        userId: 'user-001',
        role: 'processor',
      });

      const input = {
        patientId: 'patient-001',
        providerId: 'provider-001',
        diagnosisCode: 'A00.0',
        amount: 1000.00,
      };

      const createdClaim = {
        id: 'claim-001',
        organizationId: 'org-001',
        ...input,
        amount: '1000.00',
        status: 'submitted',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockRepository.create.mockResolvedValue(createdClaim);

      const result = await service.createClaim(input);

      expect(result).toEqual(createdClaim);
      expect(mockRepository.create).toHaveBeenCalledWith(input);
    });
  });

  describe('getClaim', () => {
    it('should return cached claim if available', async () => {
      const cachedClaim = {
        id: 'claim-001',
        organizationId: 'org-001',
        patientId: 'patient-001',
        providerId: 'provider-001',
        diagnosisCode: 'A00.0',
        amount: '1000.00',
        status: 'submitted',
        assignedProcessorId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(cache.cacheGet).mockResolvedValue(cachedClaim);

      const result = await service.getClaim('claim-001');

      expect(result).toEqual(cachedClaim);
      expect(cache.cacheGet).toHaveBeenCalledWith('claim:org-001:claim-001', 'claim');
      expect(mockRepository.findById).not.toHaveBeenCalled();
    });

    it('should fetch from repository and cache if not cached', async () => {
      const claim = {
        id: 'claim-001',
        organizationId: 'org-001',
        patientId: 'patient-001',
        providerId: 'provider-001',
        diagnosisCode: 'A00.0',
        amount: '1000.00',
        status: 'submitted',
        assignedProcessorId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(cache.cacheGet).mockResolvedValue(null);
      mockRepository.findById.mockResolvedValue(claim);

      const result = await service.getClaim('claim-001');

      expect(result).toEqual(claim);
      expect(mockRepository.findById).toHaveBeenCalledWith('claim-001');
      expect(cache.cacheSet).toHaveBeenCalledWith('claim:org-001:claim-001', claim, expect.any(Number));
    });

    it('should throw NotFoundError if claim does not exist', async () => {
      vi.mocked(cache.cacheGet).mockResolvedValue(null);
      mockRepository.findById.mockResolvedValue(null);

      await expect(service.getClaim('claim-999')).rejects.toThrow('not found');
    });

    it('should enforce read permissions for processor role', async () => {
      vi.mocked(tenantContext.getTenantContext).mockReturnValue({
        organizationId: 'org-001',
        userId: 'processor-001',
        role: 'processor',
      });

      const claim = {
        id: 'claim-001',
        organizationId: 'org-001',
        patientId: 'patient-001',
        providerId: 'provider-001',
        diagnosisCode: 'A00.0',
        amount: '1000.00',
        status: 'submitted',
        assignedProcessorId: 'processor-002',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(cache.cacheGet).mockResolvedValue(null);
      mockRepository.findById.mockResolvedValue(claim);

      await expect(service.getClaim('claim-001')).rejects.toThrow('only view claims');
    });
  });

  describe('updateClaim', () => {
    it('should update claim and invalidate cache', async () => {
      const existingClaim = {
        id: 'claim-001',
        organizationId: 'org-001',
        patientId: 'patient-001',
        providerId: 'provider-001',
        diagnosisCode: 'A00.0',
        amount: '1000.00',
        status: 'submitted',
        assignedProcessorId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const updatedClaim = {
        ...existingClaim,
        status: 'under_review',
        updatedAt: new Date().toISOString(),
      };

      mockRepository.findById.mockResolvedValue(existingClaim);
      mockRepository.update.mockResolvedValue(updatedClaim);

      const result = await service.updateClaim('claim-001', { status: 'under_review' });

      expect(result).toEqual(updatedClaim);
      expect(mockRepository.update).toHaveBeenCalledWith('claim-001', { status: 'under_review' });
      expect(cache.cacheDel).toHaveBeenCalledWith('claim:org-001:claim-001');
      expect(cache.cacheDelPattern).toHaveBeenCalledWith('claims:org-001:*');
      expect(metrics.claimStatusTransitions.inc).toHaveBeenCalledWith({
        from_status: 'submitted',
        to_status: 'under_review',
      });
    });

    it('should throw ForbiddenError when updating approved claim', async () => {
      const claim = {
        id: 'claim-001',
        organizationId: 'org-001',
        patientId: 'patient-001',
        providerId: 'provider-001',
        diagnosisCode: 'A00.0',
        amount: '1000.00',
        status: 'approved',
        assignedProcessorId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockRepository.findById.mockResolvedValue(claim);

      await expect(service.updateClaim('claim-001', { status: 'paid' })).rejects.toThrow('Cannot modify');
      expect(mockRepository.update).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenError when updating paid claim', async () => {
      const claim = {
        id: 'claim-001',
        organizationId: 'org-001',
        patientId: 'patient-001',
        providerId: 'provider-001',
        diagnosisCode: 'A00.0',
        amount: '1000.00',
        status: 'paid',
        assignedProcessorId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockRepository.findById.mockResolvedValue(claim);

      await expect(service.updateClaim('claim-001', { amount: 2000.00 })).rejects.toThrow('Cannot modify');
      expect(mockRepository.update).not.toHaveBeenCalled();
    });

    it('should throw BusinessRuleError for invalid status transition', async () => {
      const claim = {
        id: 'claim-001',
        organizationId: 'org-001',
        patientId: 'patient-001',
        providerId: 'provider-001',
        diagnosisCode: 'A00.0',
        amount: '1000.00',
        status: 'submitted',
        assignedProcessorId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockRepository.findById.mockResolvedValue(claim);

      await expect(service.updateClaim('claim-001', { status: 'paid' })).rejects.toThrow('Invalid status transition');
      expect(mockRepository.update).not.toHaveBeenCalled();
    });

    it('should enforce update permissions for processor role', async () => {
      vi.mocked(tenantContext.getTenantContext).mockReturnValue({
        organizationId: 'org-001',
        userId: 'processor-001',
        role: 'processor',
      });

      const claim = {
        id: 'claim-001',
        organizationId: 'org-001',
        patientId: 'patient-001',
        providerId: 'provider-001',
        diagnosisCode: 'A00.0',
        amount: '1000.00',
        status: 'submitted',
        assignedProcessorId: 'processor-002',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockRepository.findById.mockResolvedValue(claim);

      await expect(service.updateClaim('claim-001', { status: 'under_review' })).rejects.toThrow('only update claims assigned');
      expect(mockRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('bulkUpdateStatus', () => {
    it('should update multiple claims for admin', async () => {
      const mockClaims = [
        { id: 'claim-001', status: 'submitted', organizationId: 'org-001', patientId: 'p1', providerId: 'pr1', diagnosisCode: 'A00', amount: '1000', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), assignedProcessorId: null },
        { id: 'claim-002', status: 'submitted', organizationId: 'org-001', patientId: 'p1', providerId: 'pr1', diagnosisCode: 'A00', amount: '1000', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), assignedProcessorId: null },
        { id: 'claim-003', status: 'submitted', organizationId: 'org-001', patientId: 'p1', providerId: 'pr1', diagnosisCode: 'A00', amount: '1000', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), assignedProcessorId: null },
      ];
      const updatedClaims = mockClaims.map(c => ({ ...c, status: 'under_review' as const }));

      mockRepository.findById
        .mockResolvedValueOnce(mockClaims[0])
        .mockResolvedValueOnce(mockClaims[1])
        .mockResolvedValueOnce(mockClaims[2]);
      mockRepository.bulkUpdateStatus.mockResolvedValue(updatedClaims);

      const response = await service.bulkUpdateStatus({
        claimIds: ['claim-001', 'claim-002', 'claim-003'],
        status: 'under_review',
      });

      expect(response).toHaveLength(3);
      expect(response.every(c => c.status === 'under_review')).toBe(true);
      expect(cache.cacheDelPattern).toHaveBeenCalledWith('claims:org-001:*');
    });

    it('should throw ForbiddenError for non-admin roles', async () => {
      vi.mocked(tenantContext.getTenantContext).mockReturnValue({
        organizationId: 'org-001',
        userId: 'processor-001',
        role: 'processor',
      });

      await expect(service.bulkUpdateStatus({
        claimIds: ['claim-001', 'claim-002'],
        status: 'under_review',
      })).rejects.toThrow('Only admins');

      expect(mockRepository.bulkUpdateStatus).not.toHaveBeenCalled();
    });
  });

  describe('listClaims - role filters', () => {
    it('should not apply filters for admin role', async () => {
      const query = { limit: 10, offset: 0, sortBy: 'createdAt', sortOrder: 'desc' as const };
      const mockResult = { data: [], total: 0, limit: 10, offset: 0 };

      mockRepository.list.mockResolvedValue(mockResult);

      await service.listClaims(query);

      expect(mockRepository.list).toHaveBeenCalledWith(query);
    });

    it('should apply processor filter for assigned claims', async () => {
      vi.mocked(tenantContext.getTenantContext).mockReturnValue({
        organizationId: 'org-001',
        userId: 'processor-001',
        role: 'processor',
      });

      const query = { limit: 10, offset: 0, sortBy: 'createdAt', sortOrder: 'desc' as const };
      const mockResult = { data: [], total: 0, limit: 10, offset: 0 };

      mockRepository.list.mockResolvedValue(mockResult);

      await service.listClaims(query);

      expect(mockRepository.list).toHaveBeenCalledWith({
        ...query,
        assignedProcessorId: 'processor-001',
      });
    });

    it('should apply provider filter', async () => {
      vi.mocked(tenantContext.getTenantContext).mockReturnValue({
        organizationId: 'org-001',
        userId: 'provider-001',
        role: 'provider',
      });

      const query = { limit: 10, offset: 0, sortBy: 'createdAt', sortOrder: 'desc' as const };
      const mockResult = { data: [], total: 0, limit: 10, offset: 0 };

      mockRepository.list.mockResolvedValue(mockResult);

      await service.listClaims(query);

      expect(mockRepository.list).toHaveBeenCalledWith({
        ...query,
        providerId: 'provider-001',
      });
    });

    it('should apply patient filter', async () => {
      vi.mocked(tenantContext.getTenantContext).mockReturnValue({
        organizationId: 'org-001',
        userId: 'patient-001',
        role: 'patient',
      });

      const query = { limit: 10, offset: 0, sortBy: 'createdAt', sortOrder: 'desc' as const };
      const mockResult = { data: [], total: 0, limit: 10, offset: 0 };

      mockRepository.list.mockResolvedValue(mockResult);

      await service.listClaims(query);

      expect(mockRepository.list).toHaveBeenCalledWith({
        ...query,
        patientId: 'patient-001',
      });
    });
  });
});
