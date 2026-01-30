export type ClaimStatus = 'submitted' | 'under_review' | 'approved' | 'rejected' | 'paid';

export type UserRole = 'admin' | 'processor' | 'provider' | 'patient';

export type PatientEventType = 'admission' | 'discharge' | 'treatment';

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface SortParams {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
