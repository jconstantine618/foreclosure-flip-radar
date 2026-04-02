import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// GET /api/opportunities/[id] – Single opportunity with all relations
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const opportunity = await prisma.opportunity.findUnique({
      where: { id },
      include: {
        property: {
          include: {
            countyNotices: { orderBy: { createdAt: 'desc' } },
            sourceRecords: { orderBy: { fetchedAt: 'desc' } },
            notes: { orderBy: { createdAt: 'desc' } },
            tags: true,
          },
        },
        auctionEvents: { orderBy: { auctionDate: 'asc' } },
        caseRecords: { orderBy: { createdAt: 'desc' } },
        underwritingSnapshots: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });

    if (!opportunity) {
      return NextResponse.json(
        { error: 'Opportunity not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: opportunity });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'GET /api/opportunities/[id] failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/opportunities/[id] – Update opportunity fields
// ---------------------------------------------------------------------------

const UpdateOpportunitySchema = z.object({
  pipelineStage: z
    .enum([
      'NEW',
      'REVIEWING',
      'DRIVE_BY',
      'UNDERWRITING',
      'BID_READY',
      'PASSED',
      'WON',
      'DISPOSITION',
    ])
    .optional(),
  distressStage: z
    .enum([
      'PRE_FORECLOSURE',
      'AUCTION',
      'REO',
      'TAX_LIEN',
      'LIS_PENDENS',
      'BANK_OWNED',
      'OTHER',
    ])
    .optional(),
  flipScore: z.number().min(0).max(100).optional(),
  estimatedARV: z.number().optional().nullable(),
  estimatedRehabCost: z.number().optional().nullable(),
  maxAllowableOffer: z.number().optional().nullable(),
  targetPurchasePrice: z.number().optional().nullable(),
  projectedGrossMargin: z.number().optional().nullable(),
  projectedNetMargin: z.number().optional().nullable(),
  projectedDaysToFlip: z.number().int().optional().nullable(),
  auctionDate: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = UpdateOpportunitySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', message: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const existing = await prisma.opportunity.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json(
        { error: 'Opportunity not found' },
        { status: 404 },
      );
    }

    const updateData: Record<string, unknown> = { ...parsed.data };

    // Convert auctionDate string to Date if present
    if (updateData.auctionDate !== undefined) {
      updateData.auctionDate = updateData.auctionDate
        ? new Date(updateData.auctionDate as string)
        : null;
    }

    const updated = await prisma.opportunity.update({
      where: { id },
      data: updateData,
      include: { property: true },
    });

    logger.info(
      { opportunityId: id, fields: Object.keys(parsed.data) },
      'Opportunity updated',
    );

    return NextResponse.json({ data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'PATCH /api/opportunities/[id] failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}
