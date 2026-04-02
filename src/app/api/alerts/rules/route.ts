import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Placeholder user resolution
// ---------------------------------------------------------------------------

const PLACEHOLDER_USER_ID = 'system';

async function resolveUserId(_req: NextRequest): Promise<string> {
  return PLACEHOLDER_USER_ID;
}

// ---------------------------------------------------------------------------
// GET /api/alerts/rules – List user's alert rules
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);

    const rules = await prisma.alertRule.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ data: rules });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'GET /api/alerts/rules failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/alerts/rules – Create a new alert rule
// ---------------------------------------------------------------------------

const CreateAlertRuleSchema = z.object({
  name: z.string().min(1).max(200),
  alertType: z.enum([
    'NEW_OPPORTUNITY',
    'HOT_LEAD',
    'AUCTION_APPROACHING',
    'STATUS_CHANGED',
    'DAILY_DIGEST',
  ]),
  channel: z.enum(['EMAIL', 'SMS', 'SLACK', 'WEBHOOK']).default('EMAIL'),
  filters: z.record(z.unknown()).optional(),
  scoreThreshold: z.number().min(0).max(100).optional(),
  countyFilter: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    const body = await req.json();
    const parsed = CreateAlertRuleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', message: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;

    const rule = await prisma.alertRule.create({
      data: {
        userId,
        name: data.name,
        alertType: data.alertType,
        channel: data.channel,
        filters: data.filters ? JSON.parse(JSON.stringify(data.filters)) : undefined,
        scoreThreshold: data.scoreThreshold ?? undefined,
        countyFilter: data.countyFilter,
        isActive: data.isActive,
      },
    });

    logger.info({ userId, ruleId: rule.id }, 'Alert rule created');

    return NextResponse.json({ data: rule }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'POST /api/alerts/rules failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/alerts/rules – Update an alert rule
// ---------------------------------------------------------------------------

const UpdateAlertRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  alertType: z
    .enum([
      'NEW_OPPORTUNITY',
      'HOT_LEAD',
      'AUCTION_APPROACHING',
      'STATUS_CHANGED',
      'DAILY_DIGEST',
    ])
    .optional(),
  channel: z.enum(['EMAIL', 'SMS', 'SLACK', 'WEBHOOK']).optional(),
  filters: z.record(z.unknown()).optional().nullable(),
  scoreThreshold: z.number().min(0).max(100).optional().nullable(),
  countyFilter: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    const body = await req.json();
    const parsed = UpdateAlertRuleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', message: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { id, filters, scoreThreshold, ...rest } = parsed.data;

    // Verify ownership
    const existing = await prisma.alertRule.findUnique({ where: { id } });

    if (!existing || existing.userId !== userId) {
      return NextResponse.json(
        { error: 'Alert rule not found' },
        { status: 404 },
      );
    }

    const updateData: Record<string, unknown> = { ...rest };
    if (filters !== undefined) {
      updateData.filters = filters ? JSON.parse(JSON.stringify(filters)) : undefined;
    }
    if (scoreThreshold !== undefined) {
      updateData.scoreThreshold = scoreThreshold;
    }

    const updated = await prisma.alertRule.update({
      where: { id },
      data: updateData as any,
    });

    logger.info({ userId, ruleId: id }, 'Alert rule updated');

    return NextResponse.json({ data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'PATCH /api/alerts/rules failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/alerts/rules – Delete an alert rule
// ---------------------------------------------------------------------------

const DeleteAlertRuleSchema = z.object({
  id: z.string().min(1),
});

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    const body = await req.json();
    const parsed = DeleteAlertRuleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', message: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { id } = parsed.data;

    const existing = await prisma.alertRule.findUnique({ where: { id } });

    if (!existing || existing.userId !== userId) {
      return NextResponse.json(
        { error: 'Alert rule not found' },
        { status: 404 },
      );
    }

    await prisma.alertRule.delete({ where: { id } });

    logger.info({ userId, ruleId: id }, 'Alert rule deleted');

    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'DELETE /api/alerts/rules failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}
