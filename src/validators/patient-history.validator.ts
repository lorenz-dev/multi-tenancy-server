import { z } from 'zod';

export const patientEventTypeSchema = z.enum(['admission', 'discharge', 'treatment']);

export const createPatientHistorySchema = z.object({
  patientId: z.string().min(1).max(100),
  eventType: patientEventTypeSchema,
  occurredAt: z.string().datetime(),
  details: z.string().max(5000).optional(),
});

export const getPatientHistoryQuerySchema = z.object({
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  eventType: patientEventTypeSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreatePatientHistoryInput = z.infer<typeof createPatientHistorySchema>;
export type GetPatientHistoryQuery = z.infer<typeof getPatientHistoryQuerySchema>;
