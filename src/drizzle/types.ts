import { organizations, claims, patientHistories, claimsAudit } from './schema';

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type Claim = typeof claims.$inferSelect;
export type NewClaim = typeof claims.$inferInsert;

export type PatientHistory = typeof patientHistories.$inferSelect;
export type NewPatientHistory = typeof patientHistories.$inferInsert;

export type ClaimsAudit = typeof claimsAudit.$inferSelect;
export type NewClaimsAudit = typeof claimsAudit.$inferInsert;
