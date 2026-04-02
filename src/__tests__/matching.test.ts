import { describe, it, expect } from 'vitest';
import { EntityMatcher } from '@/lib/matching/matcher';

describe('EntityMatcher', () => {
  const matcher = new EntityMatcher();

  it('should match identical addresses with high confidence', () => {
    const result = matcher.matchProperty(
      { normalizedAddress: '123 MAIN ST, GREENVILLE, SC 29601', county: 'Greenville' },
      [{ id: 'p1', normalizedAddress: '123 MAIN ST, GREENVILLE, SC 29601', county: 'Greenville' }]
    );
    expect(result.matched).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('should match fuzzy addresses', () => {
    const result = matcher.matchProperty(
      { normalizedAddress: '123 MAIN STREET, GREENVILLE, SC 29601', county: 'Greenville' },
      [{ id: 'p1', normalizedAddress: '123 MAIN ST, GREENVILLE, SC 29601', county: 'Greenville' }]
    );
    expect(result.matched).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('should match by parcel number', () => {
    const result = matcher.matchProperty(
      { normalizedAddress: 'DIFFERENT ADDRESS', parcelNumber: 'APN-123-456', county: 'Greenville' },
      [{ id: 'p1', normalizedAddress: '123 MAIN ST', parcelNumber: 'APN-123-456', county: 'Greenville' }]
    );
    expect(result.matched).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('should not match completely different properties', () => {
    const result = matcher.matchProperty(
      { normalizedAddress: '999 DIFFERENT RD, COLUMBIA, SC 29201', county: 'Richland' },
      [{ id: 'p1', normalizedAddress: '123 MAIN ST, GREENVILLE, SC 29601', county: 'Greenville' }]
    );
    expect(result.matched).toBe(false);
  });

  it('should normalize addresses consistently', () => {
    const a = matcher.normalizeForComparison('123 Main Street, Apt 4B');
    const b = matcher.normalizeForComparison('123 MAIN ST APT 4B');
    expect(a).toBe(b);
  });
});
