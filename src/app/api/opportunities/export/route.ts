import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// GET /api/opportunities/export – Export opportunities as CSV
// ---------------------------------------------------------------------------

const ExportQuerySchema = z.object({
  county: z.string().optional(),
  stage: z.string().optional(),
  pipelineStage: z.string().optional(),
  minScore: z.coerce.number().optional(),
  maxScore: z.coerce.number().optional(),
  propertyType: z.string().optional(),
  hasNotice: z.coerce.boolean().optional(),
  sort: z.string().default('flipScore'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

function escapeCSV(value: string | number | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(req: NextRequest) {
  try {
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = ExportQuerySchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', message: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { county, stage, pipelineStage, minScore, maxScore, propertyType, hasNotice, sort, order } =
      parsed.data;

    // Build dynamic where clause (mirrors the list endpoint)
    const where: Prisma.OpportunityWhereInput = { isActive: true };

    if (stage) {
      where.distressStage = stage as any;
    }

    if (pipelineStage) {
      where.pipelineStage = pipelineStage as any;
    }

    if (minScore !== undefined || maxScore !== undefined) {
      where.flipScore = {};
      if (minScore !== undefined) where.flipScore.gte = minScore;
      if (maxScore !== undefined) where.flipScore.lte = maxScore;
    }

    const propertyWhere: Prisma.PropertyWhereInput = {};
    let hasPropertyFilter = false;

    if (county) {
      propertyWhere.county = { equals: county, mode: 'insensitive' };
      hasPropertyFilter = true;
    }

    if (propertyType) {
      propertyWhere.propertyType = propertyType as any;
      hasPropertyFilter = true;
    }

    if (hasNotice === true) {
      propertyWhere.countyNotices = { some: {} };
      hasPropertyFilter = true;
    }

    if (hasPropertyFilter) {
      where.property = propertyWhere;
    }

    const allowedSortFields = [
      'flipScore',
      'createdAt',
      'updatedAt',
      'auctionDate',
      'estimatedARV',
      'projectedNetMargin',
    ];
    const orderByField = allowedSortFields.includes(sort) ? sort : 'flipScore';
    const orderBy = { [orderByField]: order } as Prisma.OpportunityOrderByWithRelationInput;

    const opportunities = await prisma.opportunity.findMany({
      where,
      include: {
        property: true,
        auctionEvents: { orderBy: { auctionDate: 'asc' }, take: 1 },
        caseRecords: { take: 1 },
      },
      orderBy,
      take: 5000, // Hard cap for CSV export
    });

    // Build CSV
    const headers = [
      'Address',
      'City',
      'County',
      'Zip',
      'Type',
      'Score',
      'Stage',
      'Pipeline',
      'EstValue',
      'Equity',
      'ARV',
      'RehabEst',
      'MaxOffer',
      'AuctionDate',
      'CaseNumber',
      'Source',
    ];

    const rows = opportunities.map((opp) => {
      const p = opp.property;
      const auctionDate = opp.auctionDate
        ? new Date(opp.auctionDate).toISOString().split('T')[0]
        : '';
      const caseNumber = opp.caseRecords?.[0]?.caseNumber ?? '';
      const source = opp.sourceUrl ?? '';

      return [
        escapeCSV(p.streetAddress),
        escapeCSV(p.city),
        escapeCSV(p.county),
        escapeCSV(p.zipCode),
        escapeCSV(p.propertyType),
        escapeCSV(opp.flipScore),
        escapeCSV(opp.distressStage),
        escapeCSV(opp.pipelineStage),
        escapeCSV(p.estimatedValue),
        escapeCSV(p.equityEstimate),
        escapeCSV(opp.estimatedARV),
        escapeCSV(opp.estimatedRehabCost),
        escapeCSV(opp.maxAllowableOffer),
        escapeCSV(auctionDate),
        escapeCSV(caseNumber),
        escapeCSV(source),
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');

    logger.info({ count: opportunities.length }, 'CSV export generated');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="opportunities-export-${Date.now()}.csv"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'GET /api/opportunities/export failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}
