// ---------------------------------------------------------------------------
// Scheduled Jobs -- BullMQ repeatable job configuration
// ---------------------------------------------------------------------------

import { logger } from '@/lib/logger';
import {
  propertyIngestionQueue,
  countyAdapterQueue,
  scoringQueue,
  alertQueue,
  maintenanceQueue,
} from './queue';

const log = logger.child({ module: 'scheduler' });

/**
 * Register all repeatable jobs with their cron schedules.
 * Call once during worker startup.
 */
export async function setupScheduledJobs(): Promise<void> {
  log.info('Setting up scheduled jobs...');

  try {
    // -----------------------------------------------------------------------
    // Property ingestion
    // -----------------------------------------------------------------------

    // BatchData polling - every 6 hours
    await propertyIngestionQueue.add(
      'batchdata-sync',
      { counties: ['Greenville', 'Horry', 'Georgetown'] },
      { repeat: { pattern: '0 */6 * * *' } },
    );
    log.info('Scheduled: batchdata-sync (every 6 hours)');

    // -----------------------------------------------------------------------
    // County adapter syncs
    // -----------------------------------------------------------------------

    // Greenville MIE sync - every 4 hours
    await countyAdapterQueue.add(
      'greenville-sync',
      {},
      { repeat: { pattern: '0 */4 * * *' } },
    );
    log.info('Scheduled: greenville-sync (every 4 hours)');

    // Horry MIE sync - every 4 hours (offset by 1 hour)
    await countyAdapterQueue.add(
      'horry-mie-sync',
      {},
      { repeat: { pattern: '0 1,5,9,13,17,21 * * *' } },
    );
    log.info('Scheduled: horry-mie-sync (every 4 hours, offset)');

    // Horry upset bid sync - every 4 hours (offset by 2 hours)
    await countyAdapterQueue.add(
      'horry-upset-sync',
      {},
      { repeat: { pattern: '0 2,6,10,14,18,22 * * *' } },
    );
    log.info('Scheduled: horry-upset-sync (every 4 hours, offset)');

    // SC public notices - every 8 hours
    await countyAdapterQueue.add(
      'sc-notices-sync',
      {},
      { repeat: { pattern: '0 */8 * * *' } },
    );
    log.info('Scheduled: sc-notices-sync (every 8 hours)');

    // -----------------------------------------------------------------------
    // Scoring
    // -----------------------------------------------------------------------

    // Score recalculation - daily at 2 AM
    await scoringQueue.add(
      'recalculate-scores',
      {},
      { repeat: { pattern: '0 2 * * *' } },
    );
    log.info('Scheduled: recalculate-scores (daily at 2 AM)');

    // -----------------------------------------------------------------------
    // Alerts
    // -----------------------------------------------------------------------

    // Daily digest - every day at 7 AM
    await alertQueue.add(
      'daily-digest',
      {},
      { repeat: { pattern: '0 7 * * *' } },
    );
    log.info('Scheduled: daily-digest (daily at 7 AM)');

    // Auction reminders - every day at 8 AM
    await alertQueue.add(
      'auction-reminders',
      {},
      { repeat: { pattern: '0 8 * * *' } },
    );
    log.info('Scheduled: auction-reminders (daily at 8 AM)');

    // -----------------------------------------------------------------------
    // Maintenance
    // -----------------------------------------------------------------------

    // Stale cleanup - weekly on Sunday at 3 AM
    await maintenanceQueue.add(
      'stale-cleanup',
      {},
      { repeat: { pattern: '0 3 * * 0' } },
    );
    log.info('Scheduled: stale-cleanup (weekly, Sunday 3 AM)');

    // Duplicate reconciliation - daily at 4 AM
    await maintenanceQueue.add(
      'duplicate-reconciliation',
      {},
      { repeat: { pattern: '0 4 * * *' } },
    );
    log.info('Scheduled: duplicate-reconciliation (daily at 4 AM)');

    // Sync health check - every 12 hours
    await maintenanceQueue.add(
      'sync-health-check',
      {},
      { repeat: { pattern: '0 6,18 * * *' } },
    );
    log.info('Scheduled: sync-health-check (every 12 hours)');

    log.info('All scheduled jobs registered successfully');
  } catch (err) {
    log.error({ err: String(err) }, 'Failed to set up scheduled jobs');
    throw err;
  }
}
