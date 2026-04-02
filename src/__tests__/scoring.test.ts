import { describe, it, expect } from 'vitest';
import { FlipScoringEngine } from '@/lib/scoring/engine';

describe('FlipScoringEngine', () => {
  const engine = new FlipScoringEngine();

  it('should return a score between 0 and 100', () => {
    const result = engine.calculateScore({
      estimatedValue: 200000,
      mortgageBalance: 150000,
      distressStage: 'PRE_FORECLOSURE',
      propertyType: 'SINGLE_FAMILY',
      yearBuilt: 1990,
      sqft: 1500,
      ownerOccupied: false,
      absenteeOwner: true,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('should score high-equity auction properties highest', () => {
    const highEquity = engine.calculateScore({
      estimatedValue: 300000,
      mortgageBalance: 100000,
      distressStage: 'AUCTION',
      daysUntilSale: 14,
      propertyType: 'SINGLE_FAMILY',
      yearBuilt: 2000,
      sqft: 1500,
      ownerOccupied: false,
      absenteeOwner: true,
      arvEstimate: 320000,
      arvConfidence: 0.85,
      estimatedRehabCost: 25000,
    });

    const lowEquity = engine.calculateScore({
      estimatedValue: 200000,
      mortgageBalance: 190000,
      distressStage: 'LIS_PENDENS',
      propertyType: 'CONDO',
      yearBuilt: 1970,
      sqft: 800,
      ownerOccupied: true,
      hoaAmount: 600,
      floodZone: true,
    });

    expect(highEquity.score).toBeGreaterThan(lowEquity.score);
  });

  it('should apply condo/HOA penalty', () => {
    const withoutHOA = engine.calculateScore({
      estimatedValue: 200000,
      mortgageBalance: 120000,
      distressStage: 'AUCTION',
      propertyType: 'SINGLE_FAMILY',
    });

    const withHOA = engine.calculateScore({
      estimatedValue: 200000,
      mortgageBalance: 120000,
      distressStage: 'AUCTION',
      propertyType: 'CONDO',
      hoaAmount: 500,
    });

    expect(withoutHOA.score).toBeGreaterThan(withHOA.score);
  });

  it('should calculate financial projections', () => {
    const result = engine.calculateScore({
      estimatedValue: 250000,
      mortgageBalance: 150000,
      distressStage: 'AUCTION',
      arvEstimate: 280000,
      estimatedRehabCost: 30000,
      propertyType: 'SINGLE_FAMILY',
    });

    expect(result.estimatedMaxBid).toBeDefined();
    expect(result.targetPurchasePrice).toBeDefined();
    expect(result.projectedGrossMargin).toBeDefined();
    expect(result.projectedNetMargin).toBeDefined();
    expect(result.projectedDaysToFlip).toBeDefined();
    expect(result.estimatedMaxBid).toBeLessThan(result.projectedResalePrice || Infinity);
  });

  it('should respect custom weights', () => {
    const customEngine = new FlipScoringEngine({ equityScore: 30, spreadAfterCosts: 30 });
    const result = customEngine.calculateScore({
      estimatedValue: 200000,
      mortgageBalance: 100000,
      distressStage: 'AUCTION',
      propertyType: 'SINGLE_FAMILY',
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('should handle missing optional fields gracefully', () => {
    const result = engine.calculateScore({
      estimatedValue: 150000,
      distressStage: 'OTHER',
      propertyType: 'SINGLE_FAMILY',
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
