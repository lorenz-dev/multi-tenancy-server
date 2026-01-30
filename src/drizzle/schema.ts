import { pgTable, varchar, timestamp, index, foreignKey, numeric, text, jsonb } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const organizations = pgTable("organizations", {
	id: varchar({ length: 20 }).primaryKey().notNull().default(sql`generate_id()`),
	name: varchar({ length: 255 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const claims = pgTable("claims", {
	id: varchar({ length: 20 }).primaryKey().notNull().default(sql`generate_id()`),
	organizationId: varchar("organization_id", { length: 20 }).notNull(),
	patientId: varchar("patient_id", { length: 20 }).notNull(),
	providerId: varchar("provider_id", { length: 20 }).notNull(),
	diagnosisCode: varchar("diagnosis_code", { length: 50 }).notNull(),
	amount: numeric({ precision: 10, scale:  2 }).notNull(),
	status: varchar({ length: 50 }).notNull(),
	assignedProcessorId: varchar("assigned_processor_id", { length: 20 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("claims_org_created_idx").using("btree", table.organizationId.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	index("claims_org_idx").using("btree", table.organizationId.asc().nullsLast().op("text_ops")),
	index("claims_org_patient_idx").using("btree", table.organizationId.asc().nullsLast().op("text_ops"), table.patientId.asc().nullsLast().op("text_ops")),
	index("claims_org_processor_idx").using("btree", table.organizationId.asc().nullsLast().op("text_ops"), table.assignedProcessorId.asc().nullsLast().op("text_ops")),
	index("claims_org_status_idx").using("btree", table.organizationId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "claims_organization_id_fkey"
		}),
]);

export const patientHistories = pgTable("patient_histories", {
	id: varchar({ length: 20 }).primaryKey().notNull().default(sql`generate_id()`),
	organizationId: varchar("organization_id", { length: 20 }).notNull(),
	patientId: varchar("patient_id", { length: 20 }).notNull(),
	eventType: varchar("event_type", { length: 50 }).notNull(),
	occurredAt: timestamp("occurred_at", { mode: 'string' }).notNull(),
	details: text(),
	processedAt: timestamp("processed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("patient_histories_occurred_idx").using("btree", table.occurredAt.asc().nullsLast().op("timestamp_ops")),
	index("patient_histories_org_patient_idx").using("btree", table.organizationId.asc().nullsLast().op("text_ops"), table.patientId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "patient_histories_organization_id_fkey"
		}),
]);

export const claimsAudit = pgTable("claims_audit", {
	id: varchar({ length: 20 }).primaryKey().notNull().default(sql`generate_id()`),
	claimId: varchar("claim_id", { length: 20 }).notNull(),
	organizationId: varchar("organization_id", { length: 20 }).notNull(),
	action: varchar({ length: 20 }).notNull(),
	changedBy: varchar("changed_by", { length: 100 }).notNull(),
	changedAt: timestamp("changed_at", { mode: 'string' }).defaultNow().notNull(),
	oldValues: jsonb("old_values"),
	newValues: jsonb("new_values"),
}, (table) => [
	index("claims_audit_changed_by_idx").using("btree", table.changedBy.asc().nullsLast().op("text_ops")),
	index("claims_audit_claim_idx").using("btree", table.claimId.asc().nullsLast().op("text_ops")),
	index("claims_audit_org_changed_idx").using("btree", table.organizationId.asc().nullsLast().op("timestamp_ops"), table.changedAt.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.claimId],
			foreignColumns: [claims.id],
			name: "claims_audit_claim_id_fkey"
		}),
]);
