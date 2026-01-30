import { z } from 'zod';

export const claimStatusSchema = z.enum(['submitted', 'under_review', 'approved', 'rejected', 'paid']);

export const createClaimSchema = z.object({
  patientId: z.string().length(20),
  providerId: z.string().length(20),
  diagnosisCode: z.string().min(1).max(50),
  amount: z.number().positive(),
  assignedProcessorId: z.string().length(20).optional(),
});

export const updateClaimSchema = z.object({
  status: claimStatusSchema.optional(),
  assignedProcessorId: z.string().length(20).optional(),
  diagnosisCode: z.string().min(1).max(50).optional(),
  amount: z.number().positive().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export const listClaimsQuerySchema = z.object({
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  status: claimStatusSchema.optional(),
  patientId: z.string().max(100).optional(),
  providerId: z.string().max(100).optional(),
  minAmount: z.coerce.number().positive().optional(),
  maxAmount: z.coerce.number().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z.enum(['createdAt', 'updatedAt', 'amount', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).refine(data => {
  if (data.minAmount && data.maxAmount) {
    return data.minAmount <= data.maxAmount;
  }
  return true;
}, {
  message: 'minAmount must be less than or equal to maxAmount',
}).refine(data => {
  if (data.fromDate && data.toDate) {
    return new Date(data.fromDate) <= new Date(data.toDate);
  }
  return true;
}, {
  message: 'fromDate must be before or equal to toDate',
});

export const bulkStatusUpdateSchema = z.object({
  claimIds: z.array(z.string().length(20)).min(1).max(100),
  status: claimStatusSchema,
});

export type CreateClaimInput = z.infer<typeof createClaimSchema>;
export type UpdateClaimInput = z.infer<typeof updateClaimSchema>;
export type ListClaimsQuery = z.infer<typeof listClaimsQuerySchema>;
export type BulkStatusUpdateInput = z.infer<typeof bulkStatusUpdateSchema>;
