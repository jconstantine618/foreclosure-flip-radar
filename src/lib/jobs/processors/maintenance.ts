// ---------------------------------------------------------------------------
// Maintenance Job Processor -- stale cleanup, dedup reconciliation, health checks
// ---------------------------------------------------------------------------

import { Worker, Job } from 'bullmq';
import { connection } from '../queue';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { EntityMatcher } from '@/lib/matching';
import {
  createCountyAdapters,
} from '@/lib/county-adapters';

const log = logger.child({ worker: 'maintenance' });

// ---------------------------------------------------------------------------
// stale-cleanup: mark old opportunities as inactive
// ---------------------------------------------------------------------------

async function handleStaleCleanup(job: Job): Promise<void> {
  log.info({ jobId: job.id }, 'stale-cleanup: starting');

  try {
    // Opportunities are considered stale if:
    // 1. Auction date has passed by more than 30 days, OR
    // 2. No updates for 90 days
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Mark opportunities with expired auctions as inactive
    const expiredAuctions = await prisma.opportunity.updateMany({
      where: {
        isActive: true,
        auctionDate: { lt: thirtyDaysAgo },
      },
      data: { isActive: false },
    });

    log.info(
      { count: expiredAuctions.count },
      'stale-cleanup: deactivated opportunities with expired auctions',
    );

    // Mark opportunities with no recent updates as inactive
    const staleOpportunities = await prisma.opportunity.updateMany({
      where: {
        isActive: true,
        auctionDate: null,
        updatedAt: { lt: ninetyDaysAgo },
      },
      data: { isActive: false },
    });

    log.info(
      { count: staleOpportunities.count },
      'stale-cleanup: deactivated stale opportunities with no updates',
    );

    const totalDeactivated = expiredAuctions.count + staleOpportunities.count;

    log.info(
      { totalDeactivated, jobId: job.id },
      'stale-cleanup: completed',
    );
  } catch (err) {
    log.error({ err: String(err), jobId: job.id }, 'stale-cleanup: failed');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// duplicate-reconciliation: run entity matching across unmatched notices
// ---------------------------------------------------------------------------

async function handleDuplicateReconciliation(job: Job): Promise<void> {
  log.info({ jobId: job.id }, 'duplicate-reconciliation: starting');

  const matcher = new EntityMatcher();
  let totalMatched = 0;
  let totalProcessed = 0;
  let totalErrors = 0;

  try {
    // Find county notices that have no linked property
    const unmatchedNotices = await prisma.countyNotice.findMany({
      where: { propertyId: null },
      take: 200,
      orderBy: { createdAt: 'desc' },
    });

    log.info(
      { count: unmatchedNotices.length },
      'duplicate-reconciliation: unmatched notices loaded',
    );

    for (const notice of unmatchedNotices) {
      try {
        totalProcessed++;

        if (!notice.address && !notice.caseNumber) {
          continue;
        }

        // Look for candidate properties in the same county
        const candidates = await prisma.property.findMany({
          where: { county: { equals: notice.county, mode: 'insensitive' } },
          select: {
            id: true,
            normalizedAddress: true,
            parcelNumber: true,
            apn: true,
            ownerName: true,
            county: true,
          },
          take: 500,
        });

        if (candidates.length === 0) continue;

        const normalizedAddress = notice.address
          ? matcher.normalizeForComparison(notice.address)
          : '';

        const matchResult = matcher.matchProperty(
          {
            address: normalizedAddress,
            parcelNumber: null,
            apn: null,
            ownerName: notice.defendant,
            county: notice.county,
            caseNumber: notice.caseNumber,
          },
          candidates.map((c) => ({
            id: c.id,
            normalizedAddress: c.normalizedAddress,
            parcelNumber: c.parcelNumber,
            apn: c.apn,
            ownerName: c.ownerName,
            county: c.county,
          })),
        );

        if (matchResult.matched && matchResult.matchedPropertyId) {
          await prisma.countyNotice.update({
            where: { id: notice.id },
            data: {
              propertyId: matchResult.matchedPropertyId,
              matchConfidence: matchResult.confidence,
            },
          });

          totalMatched++;

          log.debug(
            {
              noticeId: notice.id,
              propertyId: matchResult.matchedPropertyId,
              confidence: matchResult.confidence,
            },
            'duplicate-reconciliation: matched notice to property',
          );
        }
      } catch (err) {
        totalErrors++;
        log.error(
          { noticeId: notice.id, err: String(err) },
          'duplicate-reconciliation: failed to reconcile notice',
        );
      }
    }

    // Update job progress
    await job.updateProgress(100);

    log.info(
      { totalProcessed, totalMatched, totalErrors, jobId: job.id },
      'duplicate-reconciliation: completed',
    );
  } catch (err) {
    log.error({ err: String(err), jobId: job.id }, 'duplicate-reconciliation: failed');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// sync-health-check: verify adapter health and log warnings
// ---------------------------------------------------------------------------

async function handleSyncHealthCheck(job: Job): Promise<void> {
  log.info({ jobId: job.id }, 'sync-health-check: starting');

  try {
    const adapters = createCountyAdapters();
    const results: Array<{ adapter: string; ok: boolean; message: string }> = [];

    for (const adapter of adapters) {
      try {
        const health = await adapter.healthCheck();
        results.push({
          adapter: adapter.name,
          ok: health.ok,
          message: health.message,
        });

        if (!health.ok) {
          log.warn(
            { adapter: adapter.name, message: health.message },
            'sync-health-check: adapter unhealthy',
          );
        } else {
          log.info(
            { adapter: adapter.name },
            'sync-health-check: adapter healthy',
          );
        }
      } catch (err) {
        results.push({
          adapter: adapter.name,
          ok: false,
          message: String(err),
        });

        log.error(
          { adapter: adapter.name, err: String(err) },
          'sync-health-check: health check threw error',
        );
      }
    }

    // Check for recent adapter runs that may indicate issues
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentRuns = await prisma.countyAdapterRun.findMany({
      where: { startedAt: { gte: twentyFourHoursAgo } },
      orderBy: { startedAt: 'desc' },
    });

    const failedRuns = recentRuns.filter((run) => run.status === 'FAILED');
    if (failedRuns.length > 0) {
      log.warn(
        { failedCount: failedRuns.length, adapters: failedRuns.map((r) => r.adapterName) },
        'sync-health-check: recent adapter runs failed',
      );
    }

    // Check for adapters that haven't run recently
    const adapterNames = adapters.map((a) => a.name);
    const recentAdapterNames = new Set(recentRuns.map((r) => r.adapterName));

    for (const name of adapterNames) {
      if (!recentAdapterNames.has(name)) {
        log.warn(
          { adapter: name },
          'sync-health-check: no recent runs found for adapter',
        );
      }
    }

    const unhealthyCount = results.filter((r) => !r.ok).length;

    log.info(
      {
        totalAdapters: results.length,
        healthyCount: results.length - unhealthyCount,
        unhealthyCount,
        recentRunCount: recentRuns.length,
        failedRunCount: failedRuns.length,
        jobId: job.id,
      },
      'sync-health-check: completed',
    );
  } catch (err) {
    log.error({ err: String(err), jobId: job.id }, 'sync-health-check: failed');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Worker registration
// ---------------------------------------------------------------------------

export function createMaintenanceWorker(): Worker {
  const worker = new Worker(
    'maintenance',
    async (job: Job) => {
      switch (job.name) {
        case 'stale-cleanup':
          await handleStaleCleanup(job);
          break;
        case 'duplicate-reconciliation':
          await handleDuplicateReconciliation(job);
          break;
        case 'sync-health-check':
          await handleSyncHealthCheck(job);
          break;
        default:
          log.warn({ jobName: job.name }, 'maintenance: unknown job name');
      }
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on('completed', (job) => {
    log.info({ jobId: job.id, jobName: job.name }, 'maintenance: job completed');
  });

  worker.on('failed', (job, err) => {
    log.error(
      { jobId: job?.id, jobName: job?.name, err: String(err) },
      'maintenance: job failed',
    );
  });

  return worker;
}
