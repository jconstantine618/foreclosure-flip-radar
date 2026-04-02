// ---------------------------------------------------------------------------
// Worker Entrypoint -- run via `npm run jobs:worker`
//
// Starts all BullMQ workers and registers scheduled/repeatable jobs.
// ---------------------------------------------------------------------------

import { logger } from '@/lib/logger';
import { connection } from './queue';
import { setupScheduledJobs } from './scheduler';
import { createPropertySyncWorker } from './processors/property-sync';
import { createCountySyncWorker } from './processors/county-sync';
import { createScoringWorker } from './processors/scoring';
import { createAlertWorker } from './processors/alerts';
import { createMaintenanceWorker } from './processors/maintenance';

const log = logger.child({ module: 'worker' });

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log.info('Worker starting...');

  // Create all workers
  const workers = [
    createPropertySyncWorker(),
    createCountySyncWorker(),
    createScoringWorker(),
    createAlertWorker(),
    createMaintenanceWorker(),
  ];

  log.info(
    { workerCount: workers.length },
    'All workers created and listening for jobs',
  );

  // Register scheduled / repeatable jobs
  await setupScheduledJobs();

  console.log('Worker started, processing jobs...');

  // -------------------------------------------------------------------------
  // Graceful shutdown
  // -------------------------------------------------------------------------

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Received shutdown signal, closing workers...');

    try {
      // Close all workers gracefully (waits for active jobs to finish)
      await Promise.all(workers.map((w) => w.close()));
      log.info('All workers closed');

      // Close the shared Redis connection
      await connection.quit();
      log.info('Redis connection closed');

      process.exit(0);
    } catch (err) {
      log.error({ err: String(err) }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught errors so the worker doesn't crash silently
  process.on('uncaughtException', (err) => {
    log.error({ err: String(err) }, 'Uncaught exception in worker process');
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    log.error({ reason: String(reason) }, 'Unhandled rejection in worker process');
  });
}

main().catch((err) => {
  log.error({ err: String(err) }, 'Worker failed to start');
  console.error('Worker failed to start:', err);
  process.exit(1);
});
