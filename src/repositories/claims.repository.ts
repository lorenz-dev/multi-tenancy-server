import { eq, and, gte, lte, sql, desc, asc, inArray } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { claims } from '../drizzle/schema';
import type { Claim, NewClaim } from '../drizzle/types';
import { ListClaimsQuery } from '../validators/claims.validator';
import { PaginatedResponse } from '../types';

export class ClaimsRepository extends BaseRepository {
  async create(data: NewClaim): Promise<typeof claims.$inferSelect> {
    const organizationId = this.getTenantId();

    return await this.executeWithUserContext(async (tx) => {
      const [claim] = await tx
        .insert(claims)
        .values({
          ...data,
          organizationId,
          status: 'submitted',
        })
        .returning();

      return claim;
    });
  }

  async findById(claimId: string): Promise<Claim | null> {
    const organizationId = this.getTenantId();

    const [claim] = await this.db
      .select()
      .from(claims)
      .where(and(eq(claims.id, claimId), eq(claims.organizationId, organizationId)))
      .limit(1);

    return claim || null;
  }

  async list(query: ListClaimsQuery): Promise<PaginatedResponse<Claim>> {
    const organizationId = this.getTenantId();

    const conditions = [eq(claims.organizationId, organizationId)];

    if (query.status) {
      conditions.push(eq(claims.status, query.status));
    }

    if (query.patientId) {
      conditions.push(eq(claims.patientId, query.patientId));
    }

    if (query.providerId) {
      conditions.push(eq(claims.providerId, query.providerId));
    }

    if (query.fromDate) {
      conditions.push(gte(claims.createdAt, query.fromDate));
    }

    if (query.toDate) {
      conditions.push(lte(claims.createdAt, query.toDate));
    }

    if (query.minAmount) {
      conditions.push(gte(claims.amount, query.minAmount.toString()));
    }

    if (query.maxAmount) {
      conditions.push(lte(claims.amount, query.maxAmount.toString()));
    }

    const sortColumn = claims[query.sortBy as keyof typeof claims];
    const orderFn = query.sortOrder === 'asc' ? asc : desc;

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(claims)
      .where(and(...conditions));

    const data = await this.db
      .select()
      .from(claims)
      .where(and(...conditions))
      .orderBy(orderFn(sortColumn))
      .limit(query.limit)
      .offset(query.offset);

    return {
      data,
      pagination: {
        total: Number(count),
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + query.limit < Number(count),
      },
    };
  }

  async update(claimId: string, updates: Partial<Omit<Claim, 'id' | 'organizationId' | 'createdAt'>>): Promise<Claim> {
    const organizationId = this.getTenantId();

    return await this.executeWithUserContext(async (tx) => {
      const [updated] = await tx
        .update(claims)
        .set({
          ...updates,
        })
        .where(and(eq(claims.id, claimId), eq(claims.organizationId, organizationId)))
        .returning();

      return updated;
    });
  }

  async bulkUpdateStatus(claimIds: string[], status: string): Promise<Claim[]> {
    const organizationId = this.getTenantId();

    return await this.executeWithUserContext(async (tx) => {
      const updated = await tx
        .update(claims)
        .set({ status })
        .where(
          and(
            inArray(claims.id, claimIds),
            eq(claims.organizationId, organizationId)
          )
        )
        .returning();

      return updated;
    });
  }

  async updateStatusByPatientId(patientId: string, currentStatus: string, newStatus: string): Promise<Claim[]> {
    const organizationId = this.getTenantId();

    return await this.executeWithUserContext(async (tx) => {
      const updated = await tx
        .update(claims)
        .set({ status: newStatus })
        .where(
          and(
            eq(claims.organizationId, organizationId),
            eq(claims.patientId, patientId),
            eq(claims.status, currentStatus)
          )
        )
        .returning();

      return updated;
    });
  }
}
