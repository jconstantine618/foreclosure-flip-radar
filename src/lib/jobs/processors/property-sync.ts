// ---------------------------------------------------------------------------
// Property Sync Job Processor -- BatchData polling & ATTOM enrichment
// ---------------------------------------------------------------------------

import { Worker, Job } from 'bullmq';
import { connection, propertyIngestionQueue } from '../queue';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { IngestionService } from '@/lib/services/ingestion';
import { initializeProviders, providerRegistry } from '@/lib/providers';

const log = logger.child({ worker: 'property-sync' });

// ---------------------------------------------------------------------------
// BatchData sync — fetches distressed properties for specified counties
// ---------------------------------------------------------------------------

async function handleBatchDataSync(job: Job): Promise<void> {
  const { counties } = job.data as { counties: string[] };

  log.info({ counties, jobId: job.id }, 'batchdata-sync: starting');

  initializeProviders();

  const provider = providerRegistry.getPropertyProvider('batchdata');
  if (!provider) {
    log.error('batchdata-sync: BatchData provider not registered — is BATCHDATA_API_KEY set?');
    return;
  }

  const ingestion = new IngestionService();
  let totalProcessed = 0;
  let totalErrors = 0;

  // Create a ProviderSyncJob record to track this run
  const syncJob = await prisma.providerSyncJob.create({
    data: {
      provider: 'BATCHDATA',
      county: counties.join(','),
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  try {
    for (const county of counties) {
      log.info({ county }, 'batchdata-sync: fetching properties for county');

      try {
        const result = await provider.searchProperties({
          county,
          distressStages: ['PRE_FORECLOSURE', 'AUCTION_SCHEDULED', 'TAX_LIEN'],
          limit: 100,
          page: 1,
        });

        log.info(
          { county, count: result.properties.length, total: result.total },
          'batchdata-sync: received properties',
        );

        for (const property of result.properties) {
          try {
            await ingestion.ingestProperty(property, 'BATCHDATA');
            totalProcessed++;
          } catch (err) {
            totalErrors++;
            log.error(
              { county, address: property.address, err: String(err) },
              'batchdata-sync: failed to ingest property',
            );
          }
        }

        await job.updateProgress(Math.round(((counties.indexOf(county) + 1) / counties.length) * 100));
      } catch (err) {
        totalErrors++;
        log.error(
          { county, err: String(err) },
          'batchdata-sync: failed to fetch properties for county',
        );
      }
    }

    // Update sync job record
    await prisma.providerSyncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        recordsProcessed: totalProcessed,
        recordsFound: totalProcessed + totalErrors,
      },
    });

    log.info(
      { totalProcessed, totalErrors, jobId: job.id },
      'batchdata-sync: completed',
    );
  } catch (err) {
    await prisma.providerSyncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        recordsProcessed: totalProcessed,
        errors: [String(err)],
      },
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// ATTOM enrichment — enriches existing properties with ATTOM valuation data
// ---------------------------------------------------------------------------

async function handleAttomEnrichment(job: Job): Promise<void> {
  const { propertyIds } = job.data as { propertyIds?: string[] };

  log.info({ propertyCount: propertyIds?.length ?? 'all', jobId: job.id }, 'attom-enrichment: starting');

  initializeProviders();

  const provider = providerRegistry.getPropertyProvider('attom');
  if (!provider) {
    log.error('attom-enrichment: ATTOM provider not registered — is ATTOM_API_KEY set?');
    return;
  }

  const ingestion = new IngestionService();
  let totalProcessed = 0;
  let totalErrors = 0;

  // Fetch properties to enrich
  const properties = propertyIds
    ? await prisma.property.findMany({ where: { id: { in: propertyIds } } })
    : await prisma.property.findMany({
        where: {
          estimatedValue: null,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        take: 50,
      });

  log.info({ count: properties.length }, 'attom-enrichment: properties to enrich');

  for (const property of properties) {
    try {
      const normalizedProp = {
        address: property.streetAddress,
        city: property.city,
        state: property.state,
        zipCode: property.zipCode,
        county: property.county,
      };

      const enriched = await provider.enrichProperty(normalizedProp as any);
      await ingestion.ingestProperty(enriched, 'ATTOM');
      totalProcessed++;
    } catch (err) {
      totalErrors++;
      log.error(
        { propertyId: property.id, err: String(err) },
        'attom-enrichment: failed to enrich property',
      );
    }
  }

  log.info(
    { totalProcessed, totalErrors, jobId: job.id },
    'attom-enrichment: completed',
  );
}

// ---------------------------------------------------------------------------
// Worker registration
// ---------------------------------------------------------------------------

export function createPropertySyncWorker(): Worker {
  const worker = new Worker(
    'property-ingestion',
    async (job: Job) => {
      switch (job.name) {
        case 'batchdata-sync':
          await handleBatchDataSync(job);
          break;
        case 'attom-enrichment':
          await handleAttomEnrichment(job);
          break;
        default:
          log.warn({ jobName: job.name }, 'property-sync: unknown job name');
      }
    },
    {
      connection,
      concurrency: 2,
    },
  );

  worker.on('completed', (job) => {
    log.info({ jobId: job.id, jobName: job.name }, 'property-sync: job completed');
  });

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, jobName: job?.name, err: String(err) }, 'property-sync: job failed');
  });

  return worker;
}
