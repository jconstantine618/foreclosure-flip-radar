// ---------------------------------------------------------------------------
// Flip Score Weights -- defaults, validation, and DB loading
// ---------------------------------------------------------------------------

import { z } from 'zod';
import type { ExtendedFlipScoreWeights } from '@/types';

export const DEFAULT_WEIGHTS: ExtendedFlipScoreWeights = {
  equityScore: 15,
  distressUrgency: 12,
  arvConfidence: 10,
  daysUntilSale: 10,
  occupancyRisk: 8,
  neighborhoodTurnover: 5,
  rehabComplexity: 10,
  listToMarketSpeed: 5,
  spreadAfterCosts: 15,
  titleComplexity: 5,
  condoHoaPenalty: 3,
  floodZoneRisk: 2,
};

/**
 * Zod schema for weight validation. Each weight must be a non-negative
 * number. The sum does not need to equal 100 -- the engine normalises
 * automatically.
 */
export const FlipScoreWeightsSchema = z.object({
  equityScore: z.number().min(0).max(100),
  distressUrgency: z.number().min(0).max(100),
  arvConfidence: z.number().min(0).max(100),
  daysUntilSale: z.number().min(0).max(100),
  occupancyRisk: z.number().min(0).max(100),
  neighborhoodTurnover: z.number().min(0).max(100),
  rehabComplexity: z.number().min(0).max(100),
  listToMarketSpeed: z.number().min(0).max(100),
  spreadAfterCosts: z.number().min(0).max(100),
  titleComplexity: z.number().min(0).max(100),
  condoHoaPenalty: z.number().min(0).max(100),
  floodZoneRisk: z.number().min(0).max(100),
});

/**
 * Validate a weights object. Returns the parsed weights on success, or
 * throws a ZodError detailing which fields are invalid.
 */
export function validateWeights(
  raw: unknown,
): ExtendedFlipScoreWeights {
  return FlipScoreWeightsSchema.parse(raw);
}

/**
 * Load scoring weights from the AdminSetting table in the database.
 * Falls back to DEFAULT_WEIGHTS when the setting does not exist or is
 * invalid.
 *
 * @param prisma  A PrismaClient instance (imported lazily to avoid
 *                hard-coupling to a singleton).
 */
export async function loadWeightsFromDb(
  prisma: {
    adminSetting: {
      findUnique: (args: {
        where: { key: string };
      }) => Promise<{ value: unknown } | null>;
    };
  },
): Promise<ExtendedFlipScoreWeights> {
  try {
    const row = await prisma.adminSetting.findUnique({
      where: { key: 'flip_score_weights' },
    });

    if (!row) return { ...DEFAULT_WEIGHTS };

    // The value column is Json -- merge with defaults so that newly
    // added weight keys are always present.
    const merged = { ...DEFAULT_WEIGHTS, ...(row.value as Record<string, unknown>) };
    return validateWeights(merged);
  } catch {
    // On any error (missing table, invalid JSON, etc.) fall back silently
    return { ...DEFAULT_WEIGHTS };
  }
}
