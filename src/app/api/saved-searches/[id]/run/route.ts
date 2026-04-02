import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Placeholder user resolution
// ---------------------------------------------------------------------------

const PLACEHOLDER_USER_ID = 'system';

async function resolveUserId(_req: NextRequest): Promise<string> {
  return PLACEHOLDER_USER_ID;
}

// ---------------------------------------------------------------------------
// POST /api/saved-searches/[id]/run – Execute a saved search
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await resolveUserId(req);

    const savedSearch = await prisma.savedSearch.findUnique({ where: { id } });

    if (!savedSearch || savedSearch.userId !== userId) {
      return NextResponse.json(
        { error: 'Saved search not found' },
        { status: 404 },
      );
    }

    const filters = savedSearch.filters as Record<string, any> | null;

    // Build dynamic where clause from saved filters
    const where: Prisma.OpportunityWhereInput = { isActive: true };
    const propertyWhere: Prisma.PropertyWhereInput = {};
    let hasPropertyFilter = false;

    if (filters) {
      if (filters.stage) {
        where.distressStage = filters.stage;
      }

      if (filters.pipelineStage) {
        where.pipelineStage = filters.pipelineStage;
      }

      if (filters.minScore !== undefined || filters.maxScore !== undefined) {
        where.flipScore = {};
        if (filters.minScore !== undefined) where.flipScore.gte = Number(filters.minScore);
        if (filters.maxScore !== undefined) where.flipScore.lte = Number(filters.maxScore);
      }

      if (filters.county) {
        propertyWhere.county = { equals: filters.county, mode: 'insensitive' };
        hasPropertyFilter = true;
      }

      if (filters.propertyType) {
        propertyWhere.propertyType = filters.propertyType;
        hasPropertyFilter = true;
      }

      if (filters.hasNotice === true) {
        propertyWhere.countyNotices = { some: {} };
        hasPropertyFilter = true;
      }
    }

    if (hasPropertyFilter) {
      where.property = propertyWhere;
    }

    const page = Number(filters?.page) || 1;
    const limit = Math.min(Number(filters?.limit) || 25, 100);
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
              estimatedValue: true,
              equityEstimate: true,
            },
          },
        },
        orderBy: { flipScore: 'desc' },
        skip,
        take: limit,
      }),
      prisma.opportunity.count({ where }),
    ]);

    // Update the saved search metadata
    await prisma.savedSearch.update({
      where: { id },
      data: {
        resultCount: total,
        lastRunAt: new Date(),
      },
    });

    logger.info(
      { searchId: id, resultCount: total },
      'Saved search executed',
    );

    return NextResponse.json({
      data: opportunities,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'POST /api/saved-searches/[id]/run failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}
