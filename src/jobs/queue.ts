import { Queue, QueueOptions } from 'bullmq';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import {
  queueWaitingJobs,
  queueActiveJobs,
  queueCompletedJobs,
  queueFailedJobs,
  queueDelayedJobs
} from '../config/metrics';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = {
  host: new URL(REDIS_URL).hostname,
  port: parseInt(new URL(REDIS_URL).port || '6379'),
};

const defaultQueueOptions: QueueOptions = {
  connection,
  defaultJobOptions: {
    attempts: parseInt(process.env.BULLMQ_MAX_RETRIES || '3'),
    backoff: {
      type: 'exponential',
      delay: parseInt(process.env.BULLMQ_BACKOFF_DELAY_MS || '2000'),
    },
    removeOnComplete: {
      count: 100,
      age: 24 * 3600,
    },
    removeOnFail: {
      count: 500,
    },
  },
};

export const patientAdmissionQueue = new Queue('patient-admission', defaultQueueOptions);

export const patientDischargeQueue = new Queue('patient-discharge', defaultQueueOptions);

export const treatmentInitiatedQueue = new Queue('treatment-initiated', defaultQueueOptions);

function setupQueueListeners(queue: Queue, queueName: string) {
  queue.on('error', (error) => {
    logger.error(`Queue ${queueName} error`, { error: error.message });
  });

  queue.on('waiting', (jobId) => {
    logger.debug(`Job ${jobId} is waiting in queue ${queueName}`);
  });

  queue.on('active', (job) => {
    logger.debug(`Job ${job.id} is active in queue ${queueName}`);
  });

  queue.on('completed', (job) => {
    logger.info(`Job ${job.id} completed in queue ${queueName}`);
  });

  queue.on('failed', (job, error) => {
    logger.error(`Job ${job?.id} failed in queue ${queueName}`, {
      error: error.message,
      jobData: job?.data,
    });
  });
}

setupQueueListeners(patientAdmissionQueue, 'patient-admission');
setupQueueListeners(patientDischargeQueue, 'patient-discharge');
setupQueueListeners(treatmentInitiatedQueue, 'treatment-initiated');

const queues = [
  { queue: patientAdmissionQueue, name: 'patient-admission' },
  { queue: patientDischargeQueue, name: 'patient-discharge' },
  { queue: treatmentInitiatedQueue, name: 'treatment-initiated' },
];

async function collectQueueMetrics() {
  for (const { queue, name } of queues) {
    try {
      const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');

      queueWaitingJobs.set({ queue_name: name }, counts.waiting || 0);
      queueActiveJobs.set({ queue_name: name }, counts.active || 0);
      queueCompletedJobs.set({ queue_name: name }, counts.completed || 0);
      queueFailedJobs.set({ queue_name: name }, counts.failed || 0);
      queueDelayedJobs.set({ queue_name: name }, counts.delayed || 0);
    } catch (error) {
      logger.error(`Failed to collect metrics for queue ${name}`, { error });
    }
  }
}

let metricsInterval: NodeJS.Timeout | null = null;

export function startQueueMetricsCollection(intervalMs: number = 10000) {
  if (metricsInterval) {
    return;
  }

  collectQueueMetrics();

  metricsInterval = setInterval(() => {
    collectQueueMetrics();
  }, intervalMs);

  logger.info('Queue metrics collection started', { intervalMs });
}

export async function closeQueues() {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }

  await Promise.all([
    patientAdmissionQueue.close(),
    patientDischargeQueue.close(),
    treatmentInitiatedQueue.close(),
  ]);
}

export interface PatientAdmissionJobData {
  eventId: string;
  patientId: string;
  organizationId: string;
  occurredAt: string;
}

export interface PatientDischargeJobData {
  eventId: string;
  patientId: string;
  organizationId: string;
  occurredAt: string;
}

export interface TreatmentInitiatedJobData {
  eventId: string;
  patientId: string;
  organizationId: string;
  treatmentType: string;
  occurredAt: string;
}
