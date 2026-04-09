// ---------------------------------------------------------------------------
// Flip Scoring Engine
// ---------------------------------------------------------------------------

import type {
  ExtendedFlipScoreInput,
  ExtendedFlipScoreWeights,
  ExtendedFlipScoreBreakdown,
  ExtendedFlipScoreResult,
} from '@/types';

const DEFAULT_WEIGHTS: ExtendedFlipScoreWeights = {
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
 * Clamps a value between min and max (inclusive).
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class FlipScoringEngine {
  private weights: ExtendedFlipScoreWeights;

  constructor(weights?: Partial<ExtendedFlipScoreWeights>) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  /**
   * Calculate a composite flip score (0-100) with full breakdown and
   * financial projections.
   */
  calculateScore(input: ExtendedFlipScoreInput): ExtendedFlipScoreResult {
    const breakdown = this.computeBreakdown(input);
    const estimates = this.computeFinancials(input);

    // Weighted sum: each factor score (0-100) * its weight, then normalise
    // so the total falls within 0-100.
    const totalWeight = Object.values(this.weights).reduce((s, w) => s + w, 0);

    const weightedSum =
      breakdown.equityScore * this.weights.equityScore +
      breakdown.distressUrgency * this.weights.distressUrgency +
      breakdown.arvConfidence * this.weights.arvConfidence +
      breakdown.daysUntilSale * this.weights.daysUntilSale +
      breakdown.occupancyRisk * this.weights.occupancyRisk +
      breakdown.neighborhoodTurnover * this.weights.neighborhoodTurnover +
      breakdown.rehabComplexity * this.weights.rehabComplexity +
      breakdown.listToMarketSpeed * this.weights.listToMarketSpeed +
      breakdown.spreadAfterCosts * this.weights.spreadAfterCosts +
      breakdown.titleComplexity * this.weights.titleComplexity +
      breakdown.condoHoaPenalty * this.weights.condoHoaPenalty +
      breakdown.floodZoneRisk * this.weights.floodZoneRisk;

    const score = totalWeight > 0
      ? clamp(Math.round(weightedSum / totalWeight), 0, 100)
      : 0;

    return { score, breakdown, estimates };
  }

  // -------------------------------------------------------------------------
  // Individual scoring factors (each returns 0-100)
  // -------------------------------------------------------------------------

  private computeBreakdown(input: ExtendedFlipScoreInput): ExtendedFlipScoreBreakdown {
    return {
      equityScore: this.scoreEquity(input),
      distressUrgency: this.scoreDistressUrgency(input),
      arvConfidence: this.scoreArvConfidence(input),
      daysUntilSale: this.scoreDaysUntilSale(input),
      occupancyRisk: this.scoreOccupancyRisk(input),
      neighborhoodTurnover: this.scoreNeighborhoodTurnover(input),
      rehabComplexity: this.scoreRehabComplexity(input),
      listToMarketSpeed: this.scoreListToMarketSpeed(input),
      spreadAfterCosts: this.scoreSpreadAfterCosts(input),
      titleComplexity: this.scoreTitleComplexity(input),
      condoHoaPenalty: this.scoreCondoHoaPenalty(input),
      floodZoneRisk: this.scoreFloodZoneRisk(input),
    };
  }

  /**
   * 1. Equity score: higher equity % = higher score.
   *    0% equity -> 0, 50%+ equity -> 100, linear in between.
   */
  private scoreEquity(input: ExtendedFlipScoreInput): number {
    if (input.estimatedValue <= 0) return 0;
    const equityPct =
      (input.estimatedValue - input.mortgageBalance) / input.estimatedValue;
    if (equityPct <= 0) return 0;
    if (equityPct >= 0.5) return 100;
    return clamp(Math.round((equityPct / 0.5) * 100), 0, 100);
  }

  /**
   * 2. Distress urgency: map distress stage to a score.
   */
  private scoreDistressUrgency(input: ExtendedFlipScoreInput): number {
    const map: Record<string, number> = {
      AUCTION_SCHEDULED: 100,
      TAX_LIEN: 100,
      PRE_FORECLOSURE: 70,
      LIS_PENDENS: 60,
      NOTICE_OF_SALE: 90,
      NOTICE_OF_DEFAULT: 65,
      REO: 50,
      BANK_OWNED: 50,
      PROBATE: 45,
      BANKRUPTCY: 40,
    };
    return map[input.distressStage] ?? 30;
  }

  /**
   * 3. ARV confidence: based on whether an ARV estimate is provided
   *    and its confidence level.
   */
  private scoreArvConfidence(input: ExtendedFlipScoreInput): number {
    if (input.arvEstimate == null || input.arvEstimate <= 0) return 30;
    if (input.arvConfidence != null) {
      return clamp(Math.round(input.arvConfidence * 100), 0, 100);
    }
    // ARV provided but no confidence -> moderate score
    return 60;
  }

  /**
   * 4. Days until sale: closer sale = more urgency = higher score.
   */
  private scoreDaysUntilSale(input: ExtendedFlipScoreInput): number {
    if (input.daysUntilSale == null) return 40;
    const d = input.daysUntilSale;
    if (d <= 7) return 100;
    if (d <= 14) return 85;
    if (d <= 30) return 70;
    if (d <= 60) return 50;
    if (d <= 90) return 30;
    return 15;
  }

  /**
   * 5. Occupancy risk: owner-occupied = harder eviction (low score).
   *    Vacant / absentee = easier (high score). Unknown = middle.
   */
  private scoreOccupancyRisk(input: ExtendedFlipScoreInput): number {
    if (input.vacant === true) return 90;
    if (input.absenteeOwner === true) return 90;
    if (input.ownerOccupied === true) return 30;
    return 60; // unknown
  }

  /**
   * 6. Neighborhood turnover: placeholder. Uses turnoverRate if
   *    provided (0-1 mapped to 0-100), otherwise defaults to 50.
   */
  private scoreNeighborhoodTurnover(input: ExtendedFlipScoreInput): number {
    if (input.turnoverRate != null) {
      return clamp(Math.round(input.turnoverRate * 100), 0, 100);
    }
    return 50;
  }

  /**
   * 7. Rehab complexity: inverse complexity based on year built,
   *    sqft, and property type. Newer/smaller/SFH = easier = higher score.
   */
  private scoreRehabComplexity(input: ExtendedFlipScoreInput): number {
    let score = 50; // baseline

    // Year built: newer is easier
    if (input.yearBuilt != null) {
      const age = new Date().getFullYear() - input.yearBuilt;
      if (age <= 10) score += 20;
      else if (age <= 25) score += 10;
      else if (age <= 50) score += 0;
      else if (age <= 80) score -= 10;
      else score -= 20;
    }

    // Sqft: smaller is easier
    if (input.sqft != null) {
      if (input.sqft <= 1200) score += 15;
      else if (input.sqft <= 2000) score += 5;
      else if (input.sqft <= 3000) score -= 5;
      else score -= 15;
    }

    // Property type: SFH / townhouse easier than multi / condo
    if (input.propertyType != null) {
      const typeMap: Record<string, number> = {
        SINGLE_FAMILY: 10,
        TOWNHOUSE: 5,
        CONDO: -5,
        MANUFACTURED: -10,
        MULTI_FAMILY: -15,
        LAND: -20,
        COMMERCIAL: -20,
        OTHER: 0,
        DUPLEX: -10,
      };
      score += typeMap[input.propertyType] ?? 0;
    }

    return clamp(score, 0, 100);
  }

  /**
   * 8. List-to-market speed: placeholder heuristic based on county.
   *    Greenville / Horry counties in SC are strong flip markets.
   */
  private scoreListToMarketSpeed(input: ExtendedFlipScoreInput): number {
    if (input.county == null) return 50;
    const upper = input.county.toUpperCase();
    if (upper.includes('GREENVILLE')) return 70;
    if (upper.includes('HORRY')) return 70;
    if (upper.includes('CHARLESTON')) return 65;
    if (upper.includes('RICHLAND')) return 60;
    if (upper.includes('LEXINGTON')) return 60;
    return 50;
  }

  /**
   * 9. Spread after costs: the key financial metric.
   *    Calculates the projected profit spread as a % of purchase price.
   */
  private scoreSpreadAfterCosts(input: ExtendedFlipScoreInput): number {
    const arv = input.arvEstimate ?? input.estimatedValue;
    if (arv <= 0 || input.purchasePrice <= 0) return 0;

    const months = input.projectedMonths ?? 4;
    const holdingCosts = 2500 * months;
    const closingCosts = arv * 0.06;
    const totalCosts =
      input.purchasePrice +
      input.estimatedRehabCost +
      holdingCosts +
      closingCosts;

    const spread = arv - totalCosts;
    const spreadPct = spread / input.purchasePrice;

    if (spreadPct >= 0.3) return 100;
    if (spreadPct >= 0.2) return 80;
    if (spreadPct >= 0.1) return 60;
    if (spreadPct >= 0.05) return 40;
    return 20;
  }

  /**
   * 10. Title complexity: more notices / liens / parties = lower score.
   */
  private scoreTitleComplexity(input: ExtendedFlipScoreInput): number {
    const notices = input.noticeCount ?? 0;
    const liens = input.lienCount ?? 0;
    const parties = input.partyCount ?? 0;

    const complexityPoints = notices * 10 + liens * 15 + parties * 5;

    // 0 points = 100, 100+ points = 0
    return clamp(100 - complexityPoints, 0, 100);
  }

  /**
   * 11. Condo/HOA penalty: condos and high HOA amounts reduce score.
   */
  private scoreCondoHoaPenalty(input: ExtendedFlipScoreInput): number {
    let score = 100;

    if (input.isCondo === true) {
      score -= 30;
    }

    if (input.hoaMonthlyAmount != null && input.hoaMonthlyAmount > 0) {
      if (input.hoaMonthlyAmount > 500) score -= 50;
      else if (input.hoaMonthlyAmount > 300) score -= 30;
      else if (input.hoaMonthlyAmount > 150) score -= 15;
      else score -= 5;
    }

    return clamp(score, 0, 100);
  }

  /**
   * 12. Flood zone risk: granular scoring based on FEMA zone code.
   * VE/V (coastal high-velocity) = most severe penalty.
   * AE/A/AO/AH (100-yr floodplain) = significant penalty.
   * X with SFHA subtype or "D" = moderate penalty.
   * X (minimal risk) = no penalty.
   */
  private scoreFloodZoneRisk(input: ExtendedFlipScoreInput): number {
    const code = (input.floodZoneCode || "").toUpperCase().trim();

    // If we have a zone code, use granular scoring
    if (code) {
      if (code.startsWith("V")) return 10;  // Coastal flood — severe
      if (code === "AE" || code === "A99") return 25; // 100-yr w/ BFE
      if (code.startsWith("A")) return 20;  // 100-yr floodplain
      if (code === "D") return 60;           // Undetermined
      if (code === "X") return 100;          // Minimal risk
      return 50; // Unknown code — moderate caution
    }

    // Fallback to boolean if no zone code available
    return input.floodZone === true ? 20 : 100;
  }

  // -------------------------------------------------------------------------
  // Financial projections
  // -------------------------------------------------------------------------

  private computeFinancials(
    input: ExtendedFlipScoreInput,
  ): ExtendedFlipScoreResult['estimates'] {
    const arv = input.arvEstimate ?? input.estimatedValue;

    // 70% rule: max bid = ARV * 0.70 - rehab cost
    const estimatedMaxBid = arv * 0.7 - input.estimatedRehabCost;

    // Target purchase at 85% of max bid
    const targetPurchasePrice = estimatedMaxBid * 0.85;

    // 15% contingency on rehab
    const roughRehabReserve = input.estimatedRehabCost * 1.15;

    const projectedResalePrice = arv;

    // Market speed + rehab time
    const projectedDaysToFlip = this.estimateDaysToFlip(input);
    const projectedMonths = input.projectedMonths ?? Math.ceil(projectedDaysToFlip / 30);

    // Gross = resale - purchase - rehab
    const projectedGrossMargin =
      projectedResalePrice - input.purchasePrice - input.estimatedRehabCost;

    // Net = gross - closing costs (6% of resale) - holding costs ($2500/mo)
    const closingCosts = projectedResalePrice * 0.06;
    const holdingCosts = 2500 * projectedMonths;
    const projectedNetMargin =
      projectedGrossMargin - closingCosts - holdingCosts;

    return {
      estimatedMaxBid: Math.round(estimatedMaxBid),
      targetPurchasePrice: Math.round(targetPurchasePrice),
      roughRehabReserve: Math.round(roughRehabReserve),
      projectedResalePrice: Math.round(projectedResalePrice),
      projectedGrossMargin: Math.round(projectedGrossMargin),
      projectedNetMargin: Math.round(projectedNetMargin),
      projectedDaysToFlip,
    };
  }

  /**
   * Estimate days to flip based on market speed + rehab scope.
   * Range: 90-180 days.
   */
  private estimateDaysToFlip(input: ExtendedFlipScoreInput): number {
    let baseDays = 120; // default

    // Market speed adjustment by county
    if (input.county != null) {
      const upper = input.county.toUpperCase();
      if (upper.includes('GREENVILLE') || upper.includes('HORRY')) {
        baseDays -= 15; // faster market
      }
      if (upper.includes('CHARLESTON')) {
        baseDays -= 10;
      }
    }

    // Rehab cost adjustment: higher rehab = more time
    if (input.estimatedRehabCost > 60000) baseDays += 30;
    else if (input.estimatedRehabCost > 30000) baseDays += 15;
    else if (input.estimatedRehabCost < 10000) baseDays -= 15;

    // Sqft adjustment
    if (input.sqft != null) {
      if (input.sqft > 3000) baseDays += 15;
      else if (input.sqft < 1200) baseDays -= 10;
    }

    // Age adjustment
    if (input.yearBuilt != null) {
      const age = new Date().getFullYear() - input.yearBuilt;
      if (age > 80) baseDays += 20;
      else if (age > 50) baseDays += 10;
    }

    return clamp(baseDays, 90, 180);
  }
}
