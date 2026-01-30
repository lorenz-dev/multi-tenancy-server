import client from 'prom-client';

export const register = new client.Registry();

client.collectDefaultMetrics({ register });

export const isMetricsEnabled = (): boolean => {
  return process.env.ENABLE_METRICS !== 'false';
};

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const cacheHitCounter = new client.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'],
  registers: [register],
});

export const cacheMissCounter = new client.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
  registers: [register],
});

export const jobProcessingDuration = new client.Histogram({
  name: 'job_processing_duration_seconds',
  help: 'Duration of background job processing',
  labelNames: ['job_type', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

export const jobProcessedTotal = new client.Counter({
  name: 'jobs_processed_total',
  help: 'Total number of jobs processed',
  labelNames: ['job_type', 'status'],
  registers: [register],
});

export const claimStatusTransitions = new client.Counter({
  name: 'claim_status_transitions_total',
  help: 'Total number of claim status transitions',
  labelNames: ['from_status', 'to_status'],
  registers: [register],
});

export const claimsCreatedTotal = new client.Counter({
  name: 'claims_created_total',
  help: 'Total number of claims created',
  labelNames: ['organization_id'],
  registers: [register],
});

export const patientEventsProcessed = new client.Counter({
  name: 'patient_events_processed_total',
  help: 'Total number of patient events processed',
  labelNames: ['event_type', 'organization_id'],
  registers: [register],
});

export const queueWaitingJobs = new client.Gauge({
  name: 'queue_waiting_jobs',
  help: 'Number of jobs waiting in queue',
  labelNames: ['queue_name'],
  registers: [register],
});

export const queueActiveJobs = new client.Gauge({
  name: 'queue_active_jobs',
  help: 'Number of jobs currently being processed',
  labelNames: ['queue_name'],
  registers: [register],
});

export const queueCompletedJobs = new client.Gauge({
  name: 'queue_completed_jobs',
  help: 'Number of completed jobs',
  labelNames: ['queue_name'],
  registers: [register],
});

export const queueFailedJobs = new client.Gauge({
  name: 'queue_failed_jobs',
  help: 'Number of failed jobs',
  labelNames: ['queue_name'],
  registers: [register],
});

export const queueDelayedJobs = new client.Gauge({
  name: 'queue_delayed_jobs',
  help: 'Number of delayed jobs',
  labelNames: ['queue_name'],
  registers: [register],
});
