import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  GreenvilleMIEAdapter,
  HorryMIEAdapter,
  HorryUpsetBidAdapter,
  SCPublicNoticesAdapter,
} from '@/lib/county-adapters';
import type { CountyAdapter } from '@/lib/county-adapters/types';

// ---------------------------------------------------------------------------
// POST /api/sync/county – Trigger a county adapter sync run
// ---------------------------------------------------------------------------

const AdapterName = z.enum([
  'greenville-mie',
  'horry-mie',
  'horry-upset',
  'sc-public-notices',
]);

const TriggerCountySyncSchema = z.object({
  adapter: AdapterName,
  county: z.string().optional(),
});

function resolveAdapter(name: string): CountyAdapter {
  switch (name) {
    case 'greenville-mie':
      return new GreenvilleMIEAdapter();
    case 'horry-mie':
      return new HorryMIEAdapter();
    case 'horry-upset':
      return new HorryUpsetBidAdapter();
    case 'sc-public-notices':
      return new SCPublicNoticesAdapter();
    default:
      throw new Error(`Unknown adapter: ${name}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = TriggerCountySyncSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', message: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { adapter: adapterName, county } = parsed.data;
    const adapter = resolveAdapter(adapterName);

    const run = await prisma.countyAdapterRun.create({
      data: {
        adapterName,
        county: county ?? adapter.county,
        status: 'PENDING',
      },
    });

    // Fire-and-forget: run adapter asynchronously
    (async () => {
      try {
        await prisma.countyAdapterRun.update({
          where: { id: run.id },
          data: { status: 'RUNNING', startedAt: new Date() },
        });

        const rawNotices = await adapter.fetchNotices();

        let processed = 0;
        const errors: string[] = [];

        for (const raw of rawNotices) {
          try {
            const normalized = adapter.parseNotice(raw);

            await prisma.countyNotice.create({
              data: {
                county: normalized.county,
                noticeType: (normalized.noticeType as any) ?? 'OTHER',
                caseNumber: normalized.caseNumber,
                saleDate: normalized.auctionDate
                  ? new Date(normalized.auctionDate)
                  : null,
                address: normalized.address,
                plaintiff: normalized.lenderName,
                defendant: normalized.borrowerName,
                sourceUrl: normalized.documentUrl,
                rawContent:
                  typeof normalized.rawData === 'object'
                    ? JSON.stringify(normalized.rawData)
                    : null,
                parsed: normalized as any,
              },
            });

            processed++;
          } catch (parseErr) {
            const msg =
              parseErr instanceof Error ? parseErr.message : String(parseErr);
            errors.push(msg);
          }
        }

        await prisma.countyAdapterRun.update({
          where: { id: run.id },
          data: {
            status: errors.length > 0 && processed === 0 ? 'FAILED' : 'COMPLETED',
            recordsFound: rawNotices.length,
            recordsProcessed: processed,
            errors: errors.length > 0 ? errors : undefined,
            completedAt: new Date(),
          },
        });

        logger.info(
          {
            runId: run.id,
            adapter: adapterName,
            found: rawNotices.length,
            processed,
          },
          'County adapter sync completed',
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ runId: run.id, err: message }, 'County adapter sync failed');

        await prisma.countyAdapterRun
          .update({
            where: { id: run.id },
            data: {
              status: 'FAILED',
              errors: [message],
              completedAt: new Date(),
            },
          })
          .catch(() => {});
      }
    })();

    return NextResponse.json(
      { data: { runId: run.id, status: 'STARTED' } },
      { status: 202 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'POST /api/sync/county failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/sync/county?runId=... – Check adapter run status
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const runId = req.nextUrl.searchParams.get('runId');

    if (!runId) {
      const runs = await prisma.countyAdapterRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return NextResponse.json({ data: runs });
    }

    const run = await prisma.countyAdapterRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      return NextResponse.json(
        { error: 'Adapter run not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: run });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'GET /api/sync/county failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}
