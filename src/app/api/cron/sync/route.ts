import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

// Vercel route config — cron calls sync endpoint which needs extended time.
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// GET /api/cron/sync â Vercel Cron Job (every 6 hours)
//
// Triggers incremental BatchData sync for all monitored counties.
// Protected by CRON_SECRET to prevent unauthorized access.
// ---------------------------------------------------------------------------

const MONITORED_COUNTIES = ['Greenville', 'Horry', 'Georgetown'];

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

    const response = await fetch(syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'BATCHDATA',
        counties: MONITORED_COUNTIES,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error(
        { status: response.status, body: text },
        'Cron: sync endpoint returned error',
      );
      return NextResponse.json(
        { error: 'Sync endpoint error', status: response.status, body: text },
        { status: 502 },
      );
    }

    const data = await response.json();

    logger.info(
      { results: data?.data?.results },
      'Cron: incremental sync completed',
    );

    return NextResponse.json({
      ok: true,
      message: 'Incremental sync completed',
      results: data?.data?.results,
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
