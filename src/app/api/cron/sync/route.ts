import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Vercel route config
// ---------------------------------------------------------------------------
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// GET /api/cron/sync – Vercel Cron Job (every 6 hours)
//
// Triggers incremental BatchData sync for each monitored county ONE AT A TIME.
// Each county gets its own fetch call so it runs as a separate invocation
// and stays well within function timeout limits.
// ---------------------------------------------------------------------------

const MONITORED_COUNTIES = ['Greenville', 'Horry', 'Georgetown'];

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000');

  const syncUrl = `${baseUrl}/api/sync/providers`;

  logger.info(
    { counties: MONITORED_COUNTIES },
    'Cron: starting incremental BatchData sync (per-county)',
  );

  const results: Array<{ county: string; status: string; data?: any; error?: string }> = [];

  // Fire one request per county sequentially so each gets its own timeout budget
  for (const county of MONITORED_COUNTIES) {
    try {
      const response = await fetch(syncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'BATCHDATA',
          counties: [county],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        logger.error(
          { county, status: response.status, body: text },
          'Cron: sync failed for county',
        );
        results.push({ county, status: 'FAILED', error: text });
      } else {
        const data = await response.json();
        const countyResult = data?.data?.results?.[0];
        results.push({
          county,
          status: countyResult?.status || 'COMPLETED',
          data: countyResult,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ county, err: message }, 'Cron: county sync threw');
      results.push({ county, status: 'ERROR', error: message });
    }
  }

  logger.info({ results }, 'Cron: all county syncs finished');

  return NextResponse.json({
    ok: true,
    message: 'Incremental sync completed (per-county)',
    results,
  });
}
