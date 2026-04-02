// ---------------------------------------------------------------------------
// BullMQ Queue Definitions -- Foreclosure Flip Radar background job system
// ---------------------------------------------------------------------------

import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// Define queues
export const propertyIngestionQueue = new Queue('property-ingestion', { connection });
export const countyAdapterQueue = new Queue('county-adapter', { connection });
export const scoringQueue = new Queue('scoring', { connection });
export const alertQueue = new Queue('alerts', { connection });
export const enrichmentQueue = new Queue('enrichment', { connection });
export const maintenanceQueue = new Queue('maintenance', { connection });

// Re-export types and connection for use by workers
export { connection, Worker, Job };
export type { Queue };
