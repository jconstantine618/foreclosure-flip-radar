import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { providerRegistry, initializeProviders } from '@/lib/providers';
import { IngestionService } from '@/lib/services/ingestion';

// ---------------------------------------------------------------------------
// Vercel route config — allow up to 300 s on Pro plan (Hobby caps at 60 s).
// ---------------------------------------------------------------------------

export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max records per BatchData API page (their hard limit is 1000). */
const PAGE_SIZE = 100;

/** Safety cap Ã¢ÂÂ never ingest more than this many records per county per sync. */
const MAX_RECORDS_PER_COUNTY = 10_000;

/** Default lookback window for the very first sync (30 days). */
const INITIAL_LOOKBACK_DAYS = 30;

// ---------------------------------------------------------------------------
// POST /api/sync/providers Ã¢ÂÂ Trigger an incremental provider sync
// ---------------------------------------------------------------------------

const TriggerSyncSchema = z.object({
  provider: z.enum(['BATCHDATA', 'ATTOM']),
  counties: z.array(z.string().min(1)).min(1),
  filters: z
    .object({
      distressStages: z.array(z.string()).optional(),
      propertyTypes: z.array(z.string()).optional(),
      maxPrice: z.number().optional(),
    })
    .optional(),
  /** Override: force a full sync from this date instead of using last-sync. */
  since: z.string().datetime().optional(),
});
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = TriggerSyncSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', message: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { provider, counties, filters, since } = parsed.data;

    // Ensure providers are initialized
    initializeProviders();

    const propertyProvider = providerRegistry.getPropertyProvider(
      provider === 'BATCHDATA' ? 'batchdata' : 'attom',
    );

    if (!propertyProvider) {
      return NextResponse.json(
        { error: `Provider ${provider} is not configured` },
        { status: 422 },
      );
    }

    const ingestion = new IngestionService();

    // Create a sync job record for each county
    const jobs = await Promise.all(
      counties.map((county) =>
        prisma.providerSyncJob.create({
          data: { provider, county, status: 'PENDING' },
        }),
      ),
    );

    const results: Array<{
      jobId: string;
      county: string;
      status: string;
      recordsFound: number;
      recordsIngested: number;
      dateRange: { from: string; to: string };
      pages: number;
    }> = [];

    for (const job of jobs) {
      try {
        await prisma.providerSyncJob.update({
          where: { id: job.id },
          data: { status: 'RUNNING', startedAt: new Date() },
        });

        const startMs = Date.now();

        // ---------------------------------------------------------------
        // Determine the date window for this county
        // ---------------------------------------------------------------
        let dateMin: Date;

        if (since) {
          // Explicit override from request body
          dateMin = new Date(since);
        } else {
          // Look up the most recent COMPLETED sync for this provider+county
          const lastSync = await prisma.providerSyncJob.findFirst({
            where: {
              provider,
              county: job.county,
              status: 'COMPLETED',
              id: { not: job.id }, // exclude the current job
            },
            orderBy: { completedAt: 'desc' },
            select: { completedAt: true },
          });

          if (lastSync?.completedAt) {
            // Incremental: pull everything since last successful sync
            dateMin = lastSync.completedAt;
          } else {
            // First-ever sync: pull last 30 days
            dateMin = new Date();
            dateMin.setDate(dateMin.getDate() - INITIAL_LOOKBACK_DAYS);
          }
        }

        const dateMax = new Date(); // now

        // ---------------------------------------------------------------
        // Paginated fetch + ingest loop
        // ---------------------------------------------------------------
        let page = 1;
        let totalFound = 0;
        let totalIngested = 0;
        let totalErrors = 0;
        const errors: string[] = [];

        while (totalIngested < MAX_RECORDS_PER_COUNTY) {
          const searchResults = await propertyProvider.searchProperties({
            county: job.county ?? '',
            distressStages: filters?.distressStages as any,
            propertyTypes: filters?.propertyTypes as any,
            maxPrice: filters?.maxPrice,
            page,
            limit: PAGE_SIZE,
            dateMin: dateMin.toISOString(),
            dateMax: dateMax.toISOString(),
            orderBy: 'calendardate',
          });

          if (page === 1) {
            totalFound = searchResults.total;
          }

          const properties = searchResults.properties;
          if (properties.length === 0) break; // no more results

          // Ingest each property through the full pipeline (dedup, score, etc.)
          for (const prop of properties) {
            try {
              await ingestion.ingestProperty(
                prop,
                provider === 'BATCHDATA' ? 'BATCHDATA' : 'ATTOM',
              );
              totalIngested++;
            } catch (ingErr) {
              totalErrors++;
              const msg = ingErr instanceof Error ? ingErr.message : String(ingErr);
              if (errors.length < 10) errors.push(msg); // cap stored errors
            }
          }

          // If we got fewer than PAGE_SIZE, we've reached the end
          if (properties.length < PAGE_SIZE) break;

          page++;
        }

        const durationMs = Date.now() - startMs;

        await prisma.providerSyncJob.update({
          where: { id: job.id },
          data: {
            status: 'COMPLETED',
            recordsFound: totalFound,
            recordsProcessed: totalIngested,
            errors: errors.length > 0 ? errors : undefined,
            completedAt: new Date(),
            duration: durationMs,
          },
        });

        results.push({
          jobId: job.id,
          county: job.county ?? '',
          status: 'COMPLETED',
          recordsFound: totalFound,
          recordsIngested: totalIngested,
          dateRange: {
            from: dateMin.toISOString(),
            to: dateMax.toISOString(),
          },
          pages: page,
        });

        logger.info(
          {
            jobId: job.id,
            county: job.county,
            provider,
            totalFound,
            totalIngested,
            totalErrors,
            pages: page,
            durationMs,
            dateMin: dateMin.toISOString(),
          },
          'Incremental provider sync completed',
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ jobId: job.id, err: message }, 'Provider sync failed');

        await prisma.providerSyncJob
          .update({
            where: { id: job.id },
            data: {
              status: 'FAILED',
              errors: [message],
              completedAt: new Date(),
            },
          })
          .catch(() => {});

        results.push({
          jobId: job.id,
          county: job.county ?? '',
          status: 'FAILED',
          recordsFound: 0,
          recordsIngested: 0,
          dateRange: { from: '', to: '' },
          pages: 0,
        });
      }
    }

    return NextResponse.json(
      { data: { jobIds: jobs.map((j) => j.id), results, status: 'COMPLETED' } },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'POST /api/sync/providers failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/sync/providers?jobId=... Ã¢ÂÂ Check job status
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const jobId = req.nextUrl.searchParams.get('jobId');

    if (!jobId) {
      // Return recent sync jobs
      const jobs = await prisma.providerSyncJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return NextResponse.json({ data: jobs });
    }

    const job = await prisma.providerSyncJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Sync job not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: job });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'GET /api/sync/providers failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}
