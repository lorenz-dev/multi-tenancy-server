import { Worker, Job } from 'bullmq';
import express from 'express';
import 'dotenv/config';
import { processPatientAdmission } from './jobs/patient-admission.job';
import { processPatientDischarge } from './jobs/patient-discharge.job';
import { processTreatmentInitiated } from './jobs/treatment-initiated.job';
import { logger } from './utils/logger';
import { jobProcessingDuration, jobProcessedTotal, register } from './config/metrics';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const WORKER_PORT = parseInt(process.env.WORKER_PORT || '3002');
const CONCURRENCY = parseInt(process.env.BULLMQ_CONCURRENCY || '5');

const connection = {
  host: new URL(REDIS_URL).hostname,
  port: parseInt(new URL(REDIS_URL).port || '6379'),
};

function wrapProcessorWithMetrics<T>(
  jobType: string,
  processor: (job: Job) => Promise<T>
) {
  return async (job: Job): Promise<T> => {
    const startTime = Date.now();

    try {
      const result = await processor(job);

      const duration = (Date.now() - startTime) / 1000;
      jobProcessingDuration.observe(
        { job_type: jobType, status: 'success' },
        duration
      );
      jobProcessedTotal.inc({ job_type: jobType, status: 'success' });

      return result;
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      jobProcessingDuration.observe(
        { job_type: jobType, status: 'failed' },
        duration
      );
      jobProcessedTotal.inc({ job_type: jobType, status: 'failed' });

      throw error;
    }
  };
}

const admissionWorker = new Worker(
  'patient-admission',
  wrapProcessorWithMetrics('patient-admission', processPatientAdmission),
  {
    connection,
    concurrency: CONCURRENCY,
  }
);

const dischargeWorker = new Worker(
  'patient-discharge',
  wrapProcessorWithMetrics('patient-discharge', processPatientDischarge),
  {
    connection,
    concurrency: CONCURRENCY,
  }
);

const treatmentWorker = new Worker(
  'treatment-initiated',
  wrapProcessorWithMetrics('treatment-initiated', processTreatmentInitiated),
  {
    connection,
    concurrency: CONCURRENCY,
  }
);

[admissionWorker, dischargeWorker, treatmentWorker].forEach((worker) => {
  worker.on('completed', (job) => {
    logger.info(`Job ${job.id} completed`, {
      queueName: worker.name,
    });
  });

  worker.on('failed', (job, error) => {
    logger.error(`Job ${job?.id} failed`, {
      queueName: worker.name,
      error: error.message,
      jobData: job?.data,
    });
  });

  worker.on('error', (error) => {
    logger.error(`Worker ${worker.name} error`, {
      error: error.message,
    });
  });
});

logger.info('Workers started', {
  concurrency: CONCURRENCY,
  workers: ['patient-admission', 'patient-discharge', 'treatment-initiated'],
});

const app = express();

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  const metrics = await register.metrics();
  res.send(metrics);
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    workers: {
      'patient-admission': { active: admissionWorker.isRunning() },
      'patient-discharge': { active: dischargeWorker.isRunning() },
      'treatment-initiated': { active: treatmentWorker.isRunning() },
    },
  });
});

const server = app.listen(WORKER_PORT, () => {
  logger.info(`Worker metrics available at http://localhost:${WORKER_PORT}/metrics`);
  logger.info(`Worker health check at http://localhost:${WORKER_PORT}/health`);
});

const shutdown = async () => {
  logger.info('Shutting down workers gracefully...');

  server.close(async () => {
    try {
      await Promise.all([
        admissionWorker.close(),
        dischargeWorker.close(),
        treatmentWorker.close(),
      ]);
      logger.info('All workers closed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during worker shutdown', { error });
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error('Forced worker shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
