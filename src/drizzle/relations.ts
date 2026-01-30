import { relations } from "drizzle-orm/relations";
import { organizations, claims, patientHistories, claimsAudit } from "./schema";

export const claimsRelations = relations(claims, ({one, many}) => ({
	organization: one(organizations, {
		fields: [claims.organizationId],
		references: [organizations.id]
	}),
	claimsAudits: many(claimsAudit),
}));

export const organizationsRelations = relations(organizations, ({many}) => ({
	claims: many(claims),
	patientHistories: many(patientHistories),
}));

export const patientHistoriesRelations = relations(patientHistories, ({one}) => ({
	organization: one(organizations, {
		fields: [patientHistories.organizationId],
		references: [organizations.id]
	}),
}));

export const claimsAuditRelations = relations(claimsAudit, ({one}) => ({
	claim: one(claims, {
		fields: [claimsAudit.claimId],
		references: [claims.id]
	}),
}));