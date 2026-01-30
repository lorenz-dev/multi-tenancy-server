import { PatientHistoryRepository } from '../repositories/patient-history.repository';
import { getTenantContext } from '../utils/tenant-context';
import { ForbiddenError } from '../errors';
import type { PatientHistory } from '../drizzle/types';
import { CreatePatientHistoryInput, GetPatientHistoryQuery } from '../validators/patient-history.validator';
import { patientAdmissionQueue, patientDischargeQueue, treatmentInitiatedQueue } from '../jobs/queue';
import { patientEventsProcessed } from '../config/metrics';
import { logger } from '../utils/logger';

export class PatientHistoryService {
  private repository: PatientHistoryRepository;

  constructor() {
    this.repository = new PatientHistoryRepository();
  }

  async createEvent(input: CreatePatientHistoryInput): Promise<PatientHistory> {
    const { organizationId } = getTenantContext();

    this.checkCreatePermission();

    const event = await this.repository.create({
      patientId: input.patientId,
      eventType: input.eventType,
      occurredAt: input.occurredAt,
      details: input.details,
    });

    await this.triggerJob(event);

    patientEventsProcessed.inc({
      event_type: event.eventType,
      organization_id: organizationId,
    });

    logger.info('Patient event created', {
      eventId: event.id,
      eventType: event.eventType,
      patientId: event.patientId,
      organizationId,
    });

    return event;
  }

  async getPatientHistory(patientId: string, query: GetPatientHistoryQuery): Promise<PatientHistory[]> {
    this.checkReadPermission(patientId);

    return await this.repository.getByPatientId(patientId, query);
  }

  private checkCreatePermission(): void {
    const { role } = getTenantContext();

    if (role === 'admin' || role === 'provider') {
      return;
    }

    throw new ForbiddenError('Only admins and providers can create patient events');
  }

  private checkReadPermission(patientId: string): void {
    const { userId, role } = getTenantContext();

    if (role === 'admin' || role === 'provider') {
      return;
    }

    if (role === 'patient') {
      if (patientId !== userId) {
        throw new ForbiddenError('You can only view your own history');
      }
      return;
    }

    throw new ForbiddenError('You cannot view patient history');
  }

  private async triggerJob(event: PatientHistory): Promise<void> {
    const jobData = {
      eventId: event.id,
      patientId: event.patientId,
      organizationId: event.organizationId,
      occurredAt: event.occurredAt,
    };

    switch (event.eventType) {
      case 'admission':
        await patientAdmissionQueue.add('process-admission', jobData, {
          jobId: `admission-${event.id}`,
        });
        break;

      case 'discharge':
        await patientDischargeQueue.add('process-discharge', jobData, {
          jobId: `discharge-${event.id}`,
        });
        break;

      case 'treatment':
        await treatmentInitiatedQueue.add('process-treatment', {
          ...jobData,
          treatmentType: event.details || 'unknown',
        }, {
          jobId: `treatment-${event.id}`,
        });
        break;

      default:
        logger.warn('Unknown event type', { eventType: event.eventType });
    }
  }
}
