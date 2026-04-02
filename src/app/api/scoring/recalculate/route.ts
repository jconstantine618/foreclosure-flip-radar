import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { FlipScoringEngine, loadWeightsFromDb } from '@/lib/scoring';
import type { ExtendedFlipScoreInput } from '@/types';

// ---------------------------------------------------------------------------
// POST /api/scoring/recalculate – Recalculate flip scores
// ---------------------------------------------------------------------------

const RecalculateSchema = z.object({
  opportunityIds: z.array(z.string()).optional(),
});

/** Build an ExtendedFlipScoreInput from DB opportunity + property data. */
function buildScoreInput(
  opp: {
    estimatedARV: number | null;
    estimatedRehabCost: number | null;
    maxAllowableOffer: number | null;
    distressStage: string;
    daysUntilSale: number | null;
    auctionDate: Date | null;
    property: {
      estimatedValue: number | null;
      mortgageBalance: number | null;
      ownerOccupied: boolean;
      absenteeOwner: boolean;
      yearBuilt: number | null;
      sqft: number | null;
      propertyType: string;
      county: string;
      floodZone: boolean;
      hoaAmount: number | null;
      _count?: { countyNotices: number };
    };
  },
  noticeCount: number,
): ExtendedFlipScoreInput {
  const p = opp.property;
  const estimatedValue = p.estimatedValue ?? 100_000;
  const mortgageBalance = p.mortgageBalance ?? 0;
  const purchasePrice = opp.maxAllowableOffer ?? estimatedValue * 0.7;

  let daysUntilSale: number | null = opp.daysUntilSale ?? null;
  if (daysUntilSale == null && opp.auctionDate) {
    daysUntilSale = Math.max(
      0,
      Math.round((new Date(opp.auctionDate).getTime() - Date.now()) / 86_400_000),
    );
  }

  return {
    estimatedValue,
    mortgageBalance,
    distressStage: opp.distressStage as any,
    arvEstimate: opp.estimatedARV ?? estimatedValue,
    arvConfidence: opp.estimatedARV ? 0.7 : 0.3,
    daysUntilSale,
    ownerOccupied: p.ownerOccupied,
    absenteeOwner: p.absenteeOwner,
    vacant: null,
    turnoverRate: null,
    yearBuilt: p.yearBuilt,
    sqft: p.sqft,
    propertyType: p.propertyType as any,
    county: p.county,
    purchasePrice,
    estimatedRehabCost: opp.estimatedRehabCost ?? 25_000,
    noticeCount,
    lienCount: null,
    partyCount: null,
    hoaMonthlyAmount: p.hoaAmount,
    isCondo: p.propertyType === 'CONDO',
    floodZone: p.floodZone,
    projectedMonths: null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RecalculateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', message: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { opportunityIds } = parsed.data;

    // Load weights from DB (falls back to defaults)
    const weights = await loadWeightsFromDb(prisma);
    const engine = new FlipScoringEngine(weights);

    // Build query
    const where = opportunityIds?.length
      ? { id: { in: opportunityIds }, isActive: true }
      : { isActive: true };

    const opportunities = await prisma.opportunity.findMany({
      where,
      include: {
        property: {
          include: {
            _count: { select: { countyNotices: true } },
          },
        },
      },
    });

    let updated = 0;

    for (const opp of opportunities) {
      try {
        const noticeCount = (opp.property as any)._count?.countyNotices ?? 0;
        const input = buildScoreInput(opp as any, noticeCount);
        const result = engine.calculateScore(input);

        await prisma.opportunity.update({
          where: { id: opp.id },
          data: {
            flipScore: result.score,
            estimatedARV: result.estimates.projectedResalePrice,
            maxAllowableOffer: result.estimates.estimatedMaxBid,
            targetPurchasePrice: result.estimates.targetPurchasePrice,
            projectedGrossMargin: result.estimates.projectedGrossMargin,
            projectedNetMargin: result.estimates.projectedNetMargin,
            projectedDaysToFlip: result.estimates.projectedDaysToFlip,
          },
        });

        updated++;
      } catch (scoreErr) {
        logger.warn(
          { opportunityId: opp.id, err: String(scoreErr) },
          'Score recalculation failed for opportunity',
        );
      }
    }

    logger.info(
      { processed: opportunities.length, updated },
      'Score recalculation completed',
    );

    return NextResponse.json({
      data: { processed: opportunities.length, updated },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'POST /api/scoring/recalculate failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}
