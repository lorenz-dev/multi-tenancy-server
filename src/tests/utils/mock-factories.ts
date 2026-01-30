import { vi } from 'vitest';

export function createMockClaimsRepository() {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    bulkUpdateStatus: vi.fn(),
    updateStatusByPatientId: vi.fn(),
  };
}

export function createMockPatientHistoryRepository() {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    getByPatientId: vi.fn(),
    isProcessed: vi.fn(),
    markAsProcessed: vi.fn(),
  };
}

export function createMockClaimsService() {
  return {
    createClaim: vi.fn(),
    getClaim: vi.fn(),
    listClaims: vi.fn(),
    updateClaim: vi.fn(),
    bulkUpdateStatus: vi.fn(),
  };
}

export function createMockPatientHistoryService() {
  return {
    createEvent: vi.fn(),
    getPatientHistory: vi.fn(),
  };
}

export function createMockDatabase() {
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    transaction: vi.fn(),
  };
}

export function createMockRedisClient() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue([]),
    flushdb: vi.fn().mockResolvedValue('OK'),
    quit: vi.fn().mockResolvedValue('OK'),
    scan: vi.fn().mockResolvedValue(['0', []]),
  };
}

export function createMockBullMQJob(data: any, id: string = 'test-job') {
  return {
    id,
    data,
    attemptsMade: 0,
    timestamp: Date.now(),
    name: 'test-job',
    opts: {},
    progress: vi.fn(),
    log: vi.fn(),
    updateProgress: vi.fn(),
  };
}

export function createMockTenantContext(
  organizationId: string = 'org-001',
  userId: string = 'user-001',
  role: 'admin' | 'processor' | 'provider' | 'patient' = 'admin'
) {
  return {
    organizationId,
    userId,
    role,
  };
}

export function createMockClaim(overrides: any = {}) {
  return {
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
    ...overrides,
  };
}

export function createMockPatientHistory(overrides: any = {}) {
  return {
    id: 'event-001',
    organizationId: 'org-001',
    patientId: 'patient-001',
    eventType: 'admission',
    occurredAt: new Date().toISOString(),
    details: null,
    processedAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockOrganization(overrides: any = {}) {
  return {
    id: 'org-001',
    name: 'Test Organization',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockPaginatedResponse<T>(data: T[], total?: number) {
  return {
    data,
    total: total ?? data.length,
    limit: 10,
    offset: 0,
  };
}
