import { Job } from 'bullmq';
import { runWithTenantContext } from '../utils/tenant-context';
import { TreatmentInitiatedJobData } from './queue';
import { logger } from '../utils/logger';
import { cacheDel, buildClaimCacheKey, cacheDelPattern } from '../config/cache';
import { ClaimsRepository } from '../repositories/claims.repository';
import { PatientHistoryRepository } from '../repositories/patient-history.repository';

export async function processTreatmentInitiated(job: Job<TreatmentInitiatedJobData>) {
  const { eventId, patientId, organizationId, treatmentType, occurredAt } = job.data;

  logger.info('Processing treatment initiated', {
    jobId: job.id,
    eventId,
    patientId,
    organizationId,
    treatmentType,
  });

  return runWithTenantContext(
    { organizationId, userId: 'system', role: 'admin' },
    async () => {
      const patientHistoryRepo = new PatientHistoryRepository();
      const claimsRepo = new ClaimsRepository();

      const event = await patientHistoryRepo.findById(eventId);

      if (!event) {
        logger.warn('Event not found', { eventId });
        return { skipped: true, reason: 'Event not found' };
      }

      if (event.processedAt) {
        logger.info('Event already processed', { eventId });
        return { skipped: true, reason: 'Already processed' };
      }

      const result = await claimsRepo.updateStatusByPatientId(
        patientId,
        'submitted',
        'under_review'
      );

      await patientHistoryRepo.markAsProcessed(eventId);

      if (result.length > 0) {
        await Promise.all(
          result.map(claim =>
            cacheDel(buildClaimCacheKey(organizationId, claim.id))
          )
        );
        await cacheDelPattern(`claims:${organizationId}:*`);
      }

      logger.info('Treatment initiated processed', {
        jobId: job.id,
        eventId,
        treatmentType,
        claimsUpdated: result.length,
      });

      return {
        processed: true,
        claimsUpdated: result.length,
        claimIds: result.map(c => c.id),
        treatmentType,
      };
    }
  );
}
