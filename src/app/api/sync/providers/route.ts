import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { providerRegistry, initializeProviders } from '@/lib/providers';

// ---------------------------------------------------------------------------
// POST /api/sync/providers – Trigger a provider sync for specified counties
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

    const { provider, counties, filters } = parsed.data;

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

    // Create a sync job record for each county
    const jobs = await Promise.all(
      counties.map((county) =>
        prisma.providerSyncJob.create({
          data: {
            provider,
            county,
            status: 'PENDING',
          },
        }),
      ),
    );

    // Run sync for each county sequentially (Vercel kills async tasks after response)
    const jobIds = jobs.map((j) => j.id);
    const results: Array<{ jobId: string; county: string; status: string; recordsFound: number }> = [];

    for (const job of jobs) {
      try {
        await prisma.providerSyncJob.update({
          where: { id: job.id },
          data: { status: 'RUNNING', startedAt: new Date() },
        });

        const startMs = Date.now();

        const searchResults = await propertyProvider.searchProperties({
          county: job.county ?? '',
          distressStages: filters?.distressStages as any,
          propertyTypes: filters?.propertyTypes as any,
          maxPrice: filters?.maxPrice,
          page: 1,
          limit: 100,
        });

        const durationMs = Date.now() - startMs;

        await prisma.providerSyncJob.update({
          where: { id: job.id },
          data: {
            status: 'COMPLETED',
            recordsFound: searchResults.total,
            recordsProcessed: searchResults.properties.length,
            completedAt: new Date(),
            duration: durationMs,
          },
        });

        results.push({
          jobId: job.id,
          county: job.county ?? '',
          status: 'COMPLETED',
          recordsFound: searchResults.total,
        });

        logger.info(
          { jobId: job.id, county: job.county, provider, records: searchResults.total },
          'Provider sync completed',
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
        });
      }
    }

    return NextResponse.json(
      { data: { jobIds, results, status: 'COMPLETED' } },
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
// GET /api/sync/providers?jobId=... – Check job status
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
