// ---------------------------------------------------------------------------
// Scoring Job Processor -- recalculates flip scores for opportunities
// ---------------------------------------------------------------------------

import { Worker, Job } from 'bullmq';
import { connection } from '../queue';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { FlipScoringEngine } from '@/lib/scoring';
import type { ExtendedFlipScoreInput } from '@/types';

const log = logger.child({ worker: 'scoring' });

// ---------------------------------------------------------------------------
// Score recalculation handler
// ---------------------------------------------------------------------------

async function handleRecalculateScores(job: Job): Promise<void> {
  const { opportunityIds } = job.data as { opportunityIds?: string[] };

  log.info(
    { opportunityCount: opportunityIds?.length ?? 'all', jobId: job.id },
    'recalculate-scores: starting',
  );

  const scoringEngine = new FlipScoringEngine();
  let totalProcessed = 0;
  let totalErrors = 0;
  let totalChanged = 0;

  try {
    // Fetch opportunities to recalculate
    const opportunities = opportunityIds
      ? await prisma.opportunity.findMany({
          where: { id: { in: opportunityIds } },
          include: { property: true },
        })
      : await prisma.opportunity.findMany({
          where: { isActive: true },
          include: { property: true },
        });

    log.info({ count: opportunities.length }, 'recalculate-scores: opportunities loaded');

    const batchSize = 50;
    for (let i = 0; i < opportunities.length; i += batchSize) {
      const batch = opportunities.slice(i, i + batchSize);

      for (const opportunity of batch) {
        try {
          const property = opportunity.property;
          if (!property) {
            log.warn({ opportunityId: opportunity.id }, 'recalculate-scores: no property linked');
            continue;
          }

          // Count related notices and liens
          const noticeCount = await prisma.countyNotice.count({
            where: { propertyId: property.id },
          });
          const lienCount = property.taxDelinquent ? 1 : 0;

          // Build score input
          const estimatedValue = property.estimatedValue ?? 0;
          const mortgageBalance = property.mortgageBalance ?? 0;
          const listingPrice = estimatedValue * 0.7;
          const rehabEstimate = estimatedValue * 0.15;

          const scoreInput: ExtendedFlipScoreInput = {
            estimatedValue,
            mortgageBalance,
            distressStage: (opportunity.distressStage ?? 'PRE_FORECLOSURE') as any,
            arvEstimate: opportunity.estimatedARV ?? estimatedValue,
            arvConfidence: null,
            daysUntilSale: opportunity.daysUntilSale ?? null,
            ownerOccupied: property.ownerOccupied ?? null,
            absenteeOwner: property.absenteeOwner ?? null,
            vacant: null,
            turnoverRate: null,
            yearBuilt: property.yearBuilt ?? null,
            sqft: property.sqft ?? null,
            propertyType: (property.propertyType ?? null) as ExtendedFlipScoreInput['propertyType'],
            county: property.county ?? null,
            purchasePrice: listingPrice,
            estimatedRehabCost: rehabEstimate,
            noticeCount,
            lienCount,
            partyCount: 0,
            hoaMonthlyAmount: property.hoaAmount ?? null,
            isCondo: property.propertyType === 'CONDO',
            floodZone: property.floodZone ?? null,
            projectedMonths: null,
          };

          const result = scoringEngine.calculateScore(scoreInput);
          const oldScore = opportunity.flipScore ?? 0;
          const newScore = result.score;

          // Update opportunity with new score and financial projections
          await prisma.opportunity.update({
            where: { id: opportunity.id },
            data: {
              flipScore: newScore,
              maxAllowableOffer: result.estimates.estimatedMaxBid,
              targetPurchasePrice: result.estimates.targetPurchasePrice,
              estimatedRehabCost: result.estimates.roughRehabReserve,
              projectedGrossMargin: result.estimates.projectedGrossMargin,
              projectedNetMargin: result.estimates.projectedNetMargin,
              projectedDaysToFlip: result.estimates.projectedDaysToFlip,
            },
          });

          totalProcessed++;

          if (oldScore !== newScore) {
            totalChanged++;
            log.debug(
              {
                opportunityId: opportunity.id,
                oldScore,
                newScore,
                delta: newScore - oldScore,
              },
              'recalculate-scores: score changed',
            );
          }
        } catch (err) {
          totalErrors++;
          log.error(
            { opportunityId: opportunity.id, err: String(err) },
            'recalculate-scores: failed to recalculate score',
          );
        }
      }

      // Update job progress
      const progress = Math.round(((i + batch.length) / opportunities.length) * 100);
      await job.updateProgress(progress);
    }

    log.info(
      { totalProcessed, totalChanged, totalErrors, jobId: job.id },
      'recalculate-scores: completed',
    );
  } catch (err) {
    log.error({ err: String(err), jobId: job.id }, 'recalculate-scores: fatal error');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Worker registration
// ---------------------------------------------------------------------------

export function createScoringWorker(): Worker {
  const worker = new Worker(
    'scoring',
    async (job: Job) => {
      switch (job.name) {
        case 'recalculate-scores':
          await handleRecalculateScores(job);
          break;
        default:
          log.warn({ jobName: job.name }, 'scoring: unknown job name');
      }
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on('completed', (job) => {
    log.info({ jobId: job.id, jobName: job.name }, 'scoring: job completed');
  });

  worker.on('failed', (job, err) => {
    log.error(
      { jobId: job?.id, jobName: job?.name, err: String(err) },
      'scoring: job failed',
    );
  });

  return worker;
}
