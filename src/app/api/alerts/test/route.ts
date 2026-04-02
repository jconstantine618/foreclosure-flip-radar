import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { AlertDispatcher } from '@/lib/alerts';

// ---------------------------------------------------------------------------
// POST /api/alerts/test – Send a test alert
// ---------------------------------------------------------------------------

const TestAlertSchema = z.object({
  alertType: z.enum([
    'NEW_OPPORTUNITY',
    'HOT_LEAD',
    'AUCTION_APPROACHING',
    'STATUS_CHANGED',
    'DAILY_DIGEST',
  ]),
  channel: z.enum(['EMAIL', 'SMS', 'SLACK', 'WEBHOOK']),
  recipientEmail: z.string().email(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = TestAlertSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', message: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { alertType, channel, recipientEmail } = parsed.data;

    // Create a test alert event record
    const alertEvent = await prisma.alertEvent.create({
      data: {
        alertType,
        channel,
        status: 'PENDING',
        payload: {
          test: true,
          recipientEmail,
          message: `This is a test ${alertType} alert sent via ${channel}.`,
          opportunitySummary: {
            address: '123 Test Street, Greenville, SC 29601',
            flipScore: 85,
            listingPrice: 150000,
            estimatedValue: 250000,
            distressStage: 'PRE_FORECLOSURE',
            auctionDate: new Date(Date.now() + 14 * 86_400_000).toISOString(),
          },
        },
      },
    });

    // Dispatch the test alert
    const dispatcher = new AlertDispatcher();

    try {
      await dispatcher.dispatch({
        id: alertEvent.id,
        channel,
        alertType,
        payload: alertEvent.payload,
      });

      await prisma.alertEvent.update({
        where: { id: alertEvent.id },
        data: { status: 'SENT', sentAt: new Date() },
      });

      logger.info(
        { alertEventId: alertEvent.id, channel, recipientEmail },
        'Test alert sent successfully',
      );

      return NextResponse.json({
        data: { success: true, alertEventId: alertEvent.id },
      });
    } catch (dispatchErr) {
      const errMsg = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);

      await prisma.alertEvent.update({
        where: { id: alertEvent.id },
        data: { status: 'FAILED', error: errMsg },
      });

      logger.error(
        { alertEventId: alertEvent.id, err: errMsg },
        'Test alert dispatch failed',
      );

      return NextResponse.json(
        { data: { success: false, error: errMsg, alertEventId: alertEvent.id } },
        { status: 502 },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'POST /api/alerts/test failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}
