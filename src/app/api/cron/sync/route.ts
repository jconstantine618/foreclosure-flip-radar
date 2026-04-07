import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// GET /api/cron/sync – Vercel Cron Job (every 6 hours)
//
// Triggers incremental BatchData sync for all monitored counties.
// Protected by CRON_SECRET to prevent unauthorized access.
// ---------------------------------------------------------------------------

// Vercel Pro: allow up to 300 seconds per invocation
export const maxDuration = 300;

const MONITORED_COUNTIES = ['Greenville', 'Horry', 'Georgetown'];

/** Only pull distressed properties — this is a foreclosure radar, not an MLS. */
const DISTRESS_STAGES = [
  'PRE_FORECLOSURE',
  'NOTICE_OF_DEFAULT',
  'NOTICE_OF_SALE',
  'AUCTION_SCHEDULED',
  'TAX_LIEN',
  'REO',
  'BANK_OWNED',
];

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Build the internal URL for the sync endpoint
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      ?? (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000');

    const syncUrl = `${baseUrl}/api/sync/providers`;

    logger.info(
      { counties: MONITORED_COUNTIES },
      'Cron: starting incremental BatchData sync',
    );

    // Fire each county as a separate request so each gets its own 300 s budget.
    const allResults: Record<string, unknown>[] = [];

    for (const county of MONITORED_COUNTIES) {
      try {
        logger.info({ county }, 'Cron: syncing county');

        const response = await fetch(syncUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'BATCHDATA',
            counties: [county],
            filters: {
              distressStages: DISTRESS_STAGES,
            },
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          logger.error(
            { county, status: response.status, body: text },
            'Cron: sync failed for county',
          );
          allResults.push({ county, status: 'ERROR', error: text });
        } else {
          const data = await response.json();
          const countyResults = data?.data?.results ?? [];
          allResults.push(...countyResults);
          logger.info({ county, results: countyResults }, 'Cron: county sync done');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ county, err: msg }, 'Cron: county sync threw');
        allResults.push({ county, status: 'ERROR', error: msg });
      }
    }

    logger.info({ results: allResults }, 'Cron: incremental sync completed');

    return NextResponse.json({
      ok: true,
      message: 'Incremental sync completed',
      results: allResults,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'Cron sync failed');
    return NextResponse.json(
      { error: 'Cron sync failed', message },
      { status: 500 },
    );
  }
}
