// ---------------------------------------------------------------------------
// Jobs barrel export -- queues, scheduler, and one-off job helpers
// ---------------------------------------------------------------------------

export {
  propertyIngestionQueue,
  countyAdapterQueue,
  scoringQueue,
  alertQueue,
  enrichmentQueue,
  maintenanceQueue,
} from './queue';

export { setupScheduledJobs } from './scheduler';

// ---------------------------------------------------------------------------
// One-off job helpers
// ---------------------------------------------------------------------------

import { propertyIngestionQueue, countyAdapterQueue, scoringQueue } from './queue';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'jobs' });

/**
 * Trigger an on-demand provider sync for the given provider and counties.
 */
export async function triggerProviderSync(
  provider: string,
  counties: string[],
): Promise<string | undefined> {
  try {
    const jobName =
      provider.toLowerCase() === 'attom' ? 'attom-enrichment' : 'batchdata-sync';

    const job = await propertyIngestionQueue.add(jobName, { counties, provider });

    log.info(
      { provider, counties, jobId: job.id },
      'triggerProviderSync: enqueued',
    );

    return job.id;
  } catch (err) {
    log.error(
      { provider, counties, err: String(err) },
      'triggerProviderSync: failed to enqueue',
    );
    throw err;
  }
}

/**
 * Trigger an on-demand county adapter sync.
 */
export async function triggerCountySync(
  adapter: string,
): Promise<string | undefined> {
  try {
    // Map friendly adapter names to job names
    const jobNameMap: Record<string, string> = {
      'greenville-mie': 'greenville-sync',
      'greenville': 'greenville-sync',
      'horry-mie': 'horry-mie-sync',
      'horry-upset': 'horry-upset-sync',
      'sc-notices': 'sc-notices-sync',
      'sc-public-notices': 'sc-notices-sync',
    };

    const jobName = jobNameMap[adapter.toLowerCase()] ?? adapter;

    const job = await countyAdapterQueue.add(jobName, { manual: true });

    log.info(
      { adapter, jobName, jobId: job.id },
      'triggerCountySync: enqueued',
    );

    return job.id;
  } catch (err) {
    log.error(
      { adapter, err: String(err) },
      'triggerCountySync: failed to enqueue',
    );
    throw err;
  }
}

/**
 * Trigger score recalculation for specific opportunities or all active ones.
 */
export async function triggerScoreRecalculation(
  opportunityIds?: string[],
): Promise<string | undefined> {
  try {
    const job = await scoringQueue.add('recalculate-scores', {
      opportunityIds: opportunityIds ?? undefined,
    });

    log.info(
      {
        opportunityCount: opportunityIds?.length ?? 'all',
        jobId: job.id,
      },
      'triggerScoreRecalculation: enqueued',
    );

    return job.id;
  } catch (err) {
    log.error(
      { err: String(err) },
      'triggerScoreRecalculation: failed to enqueue',
    );
    throw err;
  }
}
