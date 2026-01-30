import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { patientHistories } from '../drizzle/schema';
import type { PatientHistory, NewPatientHistory } from '../drizzle/types';
import { GetPatientHistoryQuery } from '../validators/patient-history.validator';

export class PatientHistoryRepository extends BaseRepository {
  async create(data: Omit<NewPatientHistory, 'organizationId'>): Promise<PatientHistory> {
    const organizationId = this.getTenantId();

    const [event] = await this.db
      .insert(patientHistories)
      .values({
        ...data,
        organizationId,
      })
      .returning();

    return event;
  }

  async findById(eventId: string): Promise<PatientHistory | null> {
    const organizationId = this.getTenantId();

    const [event] = await this.db
      .select()
      .from(patientHistories)
      .where(
        and(
          eq(patientHistories.id, eventId),
          eq(patientHistories.organizationId, organizationId)
        )
      )
      .limit(1);

    return event || null;
  }

  async getByPatientId(patientId: string, query: GetPatientHistoryQuery): Promise<PatientHistory[]> {
    const organizationId = this.getTenantId();

    const conditions = [
      eq(patientHistories.organizationId, organizationId),
      eq(patientHistories.patientId, patientId),
    ];

    if (query.eventType) {
      conditions.push(eq(patientHistories.eventType, query.eventType));
    }

    if (query.fromDate) {
      conditions.push(gte(patientHistories.occurredAt, query.fromDate));
    }

    if (query.toDate) {
      conditions.push(lte(patientHistories.occurredAt, query.toDate));
    }

    const events = await this.db
      .select()
      .from(patientHistories)
      .where(and(...conditions))
      .orderBy(desc(patientHistories.occurredAt))
      .limit(query.limit)
      .offset(query.offset);

    return events;
  }

  async markAsProcessed(eventId: string): Promise<void> {
    const organizationId = this.getTenantId();

    await this.db
      .update(patientHistories)
      .set({ processedAt: new Date().toISOString() })
      .where(
        and(
          eq(patientHistories.id, eventId),
          eq(patientHistories.organizationId, organizationId)
        )
      );
  }

  async isProcessed(eventId: string): Promise<boolean> {
    const event = await this.findById(eventId);
    return event?.processedAt !== null;
  }
}
