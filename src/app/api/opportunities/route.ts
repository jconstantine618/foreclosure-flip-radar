import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// GET /api/opportunities – Filtered, paginated opportunity list
// ---------------------------------------------------------------------------

const ListQuerySchema = z.object({
  county: z.string().optional(),
  stage: z.string().optional(),
  pipelineStage: z.string().optional(),
  minScore: z.coerce.number().optional(),
  maxScore: z.coerce.number().optional(),
  propertyType: z.string().optional(),
  hasNotice: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().default('flipScore'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export async function GET(req: NextRequest) {
  try {
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = ListQuerySchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', message: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const {
      county,
      stage,
      pipelineStage,
      minScore,
      maxScore,
      propertyType,
      hasNotice,
      page,
      limit,
      sort,
      order,
    } = parsed.data;

    // Build dynamic where clause
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

    // Property-level filters
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

    // Build orderBy
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

    const skip = (page - 1) * limit;

    const [opportunities, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        include: {
          property: {
            select: {
              id: true,
              streetAddress: true,
              city: true,
              county: true,
              state: true,
              zipCode: true,
              propertyType: true,
              bedrooms: true,
              bathrooms: true,
              sqft: true,
              yearBuilt: true,
              estimatedValue: true,
              equityEstimate: true,
              ownerName: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.opportunity.count({ where }),
    ]);

    return NextResponse.json({
      data: opportunities,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'GET /api/opportunities failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/opportunities – Manually create an opportunity (admin)
// ---------------------------------------------------------------------------

const CreateOpportunitySchema = z.object({
  propertyId: z.string().cuid(),
  distressStage: z.enum([
    'PRE_FORECLOSURE',
    'AUCTION',
    'REO',
    'TAX_LIEN',
    'LIS_PENDENS',
    'BANK_OWNED',
    'OTHER',
  ]),
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
    .default('NEW'),
  flipScore: z.number().min(0).max(100).optional(),
  estimatedARV: z.number().optional(),
  estimatedRehabCost: z.number().optional(),
  maxAllowableOffer: z.number().optional(),
  auctionDate: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateOpportunitySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', message: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Ensure property exists
    const property = await prisma.property.findUnique({
      where: { id: data.propertyId },
    });

    if (!property) {
      return NextResponse.json(
        { error: 'Property not found' },
        { status: 404 },
      );
    }

    // Check for existing opportunity
    const existing = await prisma.opportunity.findUnique({
      where: { propertyId: data.propertyId },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Opportunity already exists for this property' },
        { status: 409 },
      );
    }

    const opportunity = await prisma.opportunity.create({
      data: {
        propertyId: data.propertyId,
        distressStage: data.distressStage,
        pipelineStage: data.pipelineStage,
        flipScore: data.flipScore ?? 0,
        estimatedARV: data.estimatedARV,
        estimatedRehabCost: data.estimatedRehabCost,
        maxAllowableOffer: data.maxAllowableOffer,
        auctionDate: data.auctionDate ? new Date(data.auctionDate) : null,
        notes: data.notes,
      },
      include: { property: true },
    });

    logger.info(
      { opportunityId: opportunity.id, propertyId: data.propertyId },
      'Opportunity created manually',
    );

    return NextResponse.json({ data: opportunity }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'POST /api/opportunities failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}
