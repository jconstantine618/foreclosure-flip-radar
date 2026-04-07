import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { providerRegistry, initializeProviders } from '@/lib/providers';
import { IngestionService } from '@/lib/services/ingestion';

// ---------------------------------------------------------------------------
// GET /api/cron/sync – Vercel Cron Job endpoint
// Automatically syncs properties from BatchData for configured counties.
// Protected by CRON_SECRET to prevent unauthorized access.
// ---------------------------------------------------------------------------

const TARGET_COUNTIES = ['Greenville', 'Horry', 'Georgetown'];

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret (Vercel sends this header for cron jobs)
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    logger.info('cron/sync: starting scheduled sync');

    initializeProviders();

    const provider = providerRegistry.getPropertyProvider('batchdata');
    if (!provider) {
      logger.error('cron/sync: BatchData provider not configured');
      return NextResponse.json(
        { error: 'BatchData provider not configured' },
        { status: 500 },
      );
    }

    const ingestion = new IngestionService();
    const results: Array<{
      county: string;
      status: string;
      recordsFound: number;
      recordsIngested: number;
      errors: number;
    }> = [];

    for (const county of TARGET_COUNTIES) {
      const syncJob = await prisma.providerSyncJob.create({
        data: {
          provider: 'BATCHDATA',
          county,
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      try {
        const searchResults = await provider.searchProperties({
          county,
          distressStages: ['PRE_FORECLOSURE', 'AUCTION_SCHEDULED', 'TAX_LIEN'],
          limit: 100,
          page: 1,
        });

        let ingested = 0;
        let ingestErrors = 0;

        for (const property of searchResults.properties) {
          try {
            await ingestion.ingestProperty(property, 'BATCHDATA');
            ingested++;
          } catch (err) {
            ingestErrors++;
            logger.error(
              { county, address: property.address, err: String(err) },
              'cron/sync: failed to ingest property',
            );
          }
        }

        await prisma.providerSyncJob.update({
          where: { id: syncJob.id },
          data: {
            status: 'COMPLETED',
            recordsFound: searchResults.total,
            recordsProcessed: ingested,
            completedAt: new Date(),
          },
        });

        results.push({
          county,
          status: 'COMPLETED',
          recordsFound: searchResults.total,
          recordsIngested: ingested,
          errors: ingestErrors,
        });

        logger.info(
          { county, ingested, ingestErrors, total: searchResults.total },
          'cron/sync: county sync completed',
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ county, err: message }, 'cron/sync: county sync failed');

        await prisma.providerSyncJob
          .update({
            where: { id: syncJob.id },
            data: {
              status: 'FAILED',
              errors: [message],
              completedAt: new Date(),
            },
          })
          .catch(() => {});

        results.push({
          county,
          status: 'FAILED',
          recordsFound: 0,
          recordsIngested: 0,
          errors: 1,
        });
      }
    }

    const totalIngested = results.reduce((sum, r) => sum + r.recordsIngested, 0);
    logger.info(
      { totalIngested, counties: TARGET_COUNTIES.length },
      'cron/sync: scheduled sync completed',
    );

    return NextResponse.json({
      data: {
        status: 'COMPLETED',
        totalIngested,
        results,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'cron/sync: fatal error');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}
