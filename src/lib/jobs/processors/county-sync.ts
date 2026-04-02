// ---------------------------------------------------------------------------
// County Adapter Sync Processor -- runs county-specific scrapers
// ---------------------------------------------------------------------------

import { Worker, Job } from 'bullmq';
import { connection } from '../queue';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { IngestionService } from '@/lib/services/ingestion';
import {
  GreenvilleMIEAdapter,
  HorryMIEAdapter,
  HorryUpsetBidAdapter,
  SCPublicNoticesAdapter,
} from '@/lib/county-adapters';
import type { CountyAdapter } from '@/lib/county-adapters/types';

const log = logger.child({ worker: 'county-sync' });

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

function getAdapterForJob(jobName: string): CountyAdapter | null {
  switch (jobName) {
    case 'greenville-sync':
      return new GreenvilleMIEAdapter();
    case 'horry-mie-sync':
      return new HorryMIEAdapter();
    case 'horry-upset-sync':
      return new HorryUpsetBidAdapter();
    case 'sc-notices-sync':
      return new SCPublicNoticesAdapter();
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Generic county sync handler
// ---------------------------------------------------------------------------

async function handleCountySync(job: Job): Promise<void> {
  const adapter = getAdapterForJob(job.name);

  if (!adapter) {
    log.warn({ jobName: job.name }, 'county-sync: no adapter found for job');
    return;
  }

  log.info(
    { adapter: adapter.name, county: adapter.county, jobId: job.id },
    'county-sync: starting',
  );

  const ingestion = new IngestionService();
  let totalProcessed = 0;
  let totalErrors = 0;

  // Create a CountyAdapterRun record to track this run
  const adapterRun = await prisma.countyAdapterRun.create({
    data: {
      adapterName: adapter.name,
      county: adapter.county,
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  try {
    // Fetch raw notices from the county source
    const rawNotices = await adapter.fetchNotices();

    log.info(
      { adapter: adapter.name, rawCount: rawNotices.length },
      'county-sync: fetched raw notices',
    );

    for (const rawNotice of rawNotices) {
      try {
        // Parse the raw notice into a normalized format
        const normalized = adapter.parseNotice(rawNotice);

        // Determine the provider name for ingestion tracking
        const providerName = mapAdapterToProvider(adapter.name);

        // Ingest through the ingestion service
        await ingestion.ingestNotice(normalized, providerName as any);
        totalProcessed++;
      } catch (err) {
        totalErrors++;
        log.error(
          {
            adapter: adapter.name,
            caseNumber: rawNotice.caseNumber,
            err: String(err),
          },
          'county-sync: failed to process notice',
        );
      }
    }

    // Update progress
    await job.updateProgress(100);

    // Update the adapter run record
    await prisma.countyAdapterRun.update({
      where: { id: adapterRun.id },
      data: {
        status: totalErrors > 0 ? 'FAILED' : 'COMPLETED',
        completedAt: new Date(),
        recordsFound: rawNotices.length,
        recordsProcessed: totalProcessed,
        errors: totalErrors > 0 ? [`${totalErrors} notice(s) failed to process`] : [],
      },
    });

    log.info(
      {
        adapter: adapter.name,
        totalProcessed,
        totalErrors,
        totalRaw: rawNotices.length,
        jobId: job.id,
      },
      'county-sync: completed',
    );
  } catch (err) {
    await prisma.countyAdapterRun.update({
      where: { id: adapterRun.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        recordsProcessed: totalProcessed,
        errors: [String(err)],
      },
    });

    log.error(
      { adapter: adapter.name, err: String(err), jobId: job.id },
      'county-sync: failed',
    );
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Map adapter name to Prisma ProviderName enum
// ---------------------------------------------------------------------------

function mapAdapterToProvider(adapterName: string): string {
  const mapping: Record<string, string> = {
    'greenville-mie': 'GREENVILLE_MIE',
    'horry-mie': 'HORRY_MIE',
    'horry-upset': 'HORRY_UPSET',
    'sc-public-notices': 'SC_PUBLIC_NOTICES',
  };
  return mapping[adapterName] ?? 'MANUAL';
}

// ---------------------------------------------------------------------------
// Worker registration
// ---------------------------------------------------------------------------

export function createCountySyncWorker(): Worker {
  const worker = new Worker(
    'county-adapter',
    async (job: Job) => {
      await handleCountySync(job);
    },
    {
      connection,
      concurrency: 1, // Run one adapter at a time to avoid overwhelming sources
    },
  );

  worker.on('completed', (job) => {
    log.info({ jobId: job.id, jobName: job.name }, 'county-sync: job completed');
  });

  worker.on('failed', (job, err) => {
    log.error(
      { jobId: job?.id, jobName: job?.name, err: String(err) },
      'county-sync: job failed',
    );
  });

  return worker;
}
