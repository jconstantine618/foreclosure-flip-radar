import { describe, it, expect } from 'vitest';
import { normalizeAddress, parseAddress, normalizeName } from '@/lib/county-adapters/normalizer';

describe('Address Normalizer', () => {
  it('should normalize street suffixes', () => {
    expect(normalizeAddress('123 Main Street')).toBe('123 MAIN ST');
    expect(normalizeAddress('456 Oak Avenue')).toBe('456 OAK AVE');
    expect(normalizeAddress('789 Beach Boulevard')).toBe('789 BEACH BLVD');
  });

  it('should parse full addresses', () => {
    const result = parseAddress('123 Main St, Greenville, SC 29601');
    expect(result).toBeTruthy();
    expect(result?.street).toBe('123 MAIN ST');
    expect(result?.city).toBe('GREENVILLE');
    expect(result?.state).toBe('SC');
    expect(result?.zip).toBe('29601');
  });

  it('should normalize names', () => {
    expect(normalizeName('John  Smith Jr.')).toBe('JOHN SMITH JR');
    expect(normalizeName('JANE DOE')).toBe('JANE DOE');
  });
});
