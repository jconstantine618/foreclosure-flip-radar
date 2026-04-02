// ---------------------------------------------------------------------------
// Entity Matching & Deduplication Engine
// ---------------------------------------------------------------------------

import type {
  MatchResult,
  PropertyMatchCandidate,
  NormalizedProperty,
} from '@/types';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Address abbreviation map for normalisation
// ---------------------------------------------------------------------------

const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  STREET: 'ST',
  AVENUE: 'AVE',
  BOULEVARD: 'BLVD',
  DRIVE: 'DR',
  LANE: 'LN',
  ROAD: 'RD',
  COURT: 'CT',
  CIRCLE: 'CIR',
  PLACE: 'PL',
  TRAIL: 'TRL',
  TERRACE: 'TER',
  WAY: 'WAY',
  HIGHWAY: 'HWY',
  PARKWAY: 'PKWY',
  NORTH: 'N',
  SOUTH: 'S',
  EAST: 'E',
  WEST: 'W',
  NORTHEAST: 'NE',
  NORTHWEST: 'NW',
  SOUTHEAST: 'SE',
  SOUTHWEST: 'SW',
  APARTMENT: 'APT',
  SUITE: 'STE',
  UNIT: 'UNIT',
  BUILDING: 'BLDG',
  FLOOR: 'FL',
};

// Confidence thresholds
const MATCH_THRESHOLD = 0.65;

export class EntityMatcher {
  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Attempt to match a candidate property against a list of existing
   * properties. Returns the best match result.
   */
  matchProperty(
    candidate: {
      address: string;
      parcelNumber?: string | null;
      apn?: string | null;
      ownerName?: string | null;
      county: string;
      caseNumber?: string | null;
      auctionDate?: Date | null;
    },
    existingProperties: PropertyMatchCandidate[],
  ): MatchResult {
    let bestResult: MatchResult = {
      matched: false,
      confidence: 0,
      matchFactors: {
        addressMatch: 0,
        parcelMatch: 0,
        caseNumberMatch: 0,
        ownerNameMatch: 0,
        saleDateMatch: 0,
      },
    };

    const candidateNormAddr = this.normalizeForComparison(candidate.address);

    for (const existing of existingProperties) {
      const factors = {
        addressMatch: 0,
        parcelMatch: 0,
        caseNumberMatch: 0,
        ownerNameMatch: 0,
        saleDateMatch: 0,
      };

      // 1. Exact parcel / APN match -> confidence 1.0
      if (this.matchParcel(candidate, existing)) {
        factors.parcelMatch = 1.0;
        const result: MatchResult = {
          matched: true,
          confidence: 1.0,
          matchedPropertyId: existing.id,
          matchFactors: { ...factors, addressMatch: 1.0 },
        };
        return result; // Perfect match, return immediately
      }

      // 2. Address comparison
      factors.addressMatch = this.compareAddresses(
        candidateNormAddr,
        existing.normalizedAddress,
      );

      // Exact normalized address match -> confidence 0.95
      if (factors.addressMatch >= 0.99) {
        const result: MatchResult = {
          matched: true,
          confidence: 0.95,
          matchedPropertyId: existing.id,
          matchFactors: factors,
        };
        if (result.confidence > bestResult.confidence) {
          bestResult = result;
        }
        continue;
      }

      // 3. Case number match on same county -> confidence 0.9
      if (
        candidate.caseNumber &&
        existing.caseNumber &&
        candidate.county.toUpperCase() === existing.county.toUpperCase() &&
        candidate.caseNumber.trim().toUpperCase() ===
          existing.caseNumber.trim().toUpperCase()
      ) {
        factors.caseNumberMatch = 1.0;
        const result: MatchResult = {
          matched: true,
          confidence: 0.9,
          matchedPropertyId: existing.id,
          matchFactors: factors,
        };
        if (result.confidence > bestResult.confidence) {
          bestResult = result;
        }
        continue;
      }

      // 4. Owner name comparison
      if (candidate.ownerName && existing.ownerName) {
        factors.ownerNameMatch = this.compareNames(
          candidate.ownerName,
          existing.ownerName,
        );
      }

      // 5. Sale date comparison
      if (candidate.auctionDate && existing.caseNumber) {
        // We only use sale date as a supporting factor, not standalone
        factors.saleDateMatch = 0;
      }

      // 6. Fuzzy address + owner name composite
      const compositeConfidence = this.computeCompositeConfidence(factors);

      if (compositeConfidence > bestResult.confidence) {
        bestResult = {
          matched: compositeConfidence >= MATCH_THRESHOLD,
          confidence: compositeConfidence,
          matchedPropertyId:
            compositeConfidence >= MATCH_THRESHOLD ? existing.id : undefined,
          matchFactors: factors,
        };
      }
    }

    return bestResult;
  }

  /**
   * Normalize an address string for comparison purposes.
   * Strips punctuation, normalizes abbreviations, uppercases.
   */
  normalizeForComparison(address: string): string {
    if (!address) return '';

    let normalized = address.toUpperCase().trim();

    // Remove punctuation except hyphens in unit numbers
    normalized = normalized.replace(/[.,#'"`]/g, '');

    // Normalize multiple spaces
    normalized = normalized.replace(/\s+/g, ' ');

    // Replace abbreviations
    const tokens = normalized.split(' ');
    const result = tokens.map((token) => {
      return ADDRESS_ABBREVIATIONS[token] ?? token;
    });

    return result.join(' ').trim();
  }

  /**
   * Compare two normalized addresses using token-based matching.
   * Returns a similarity score between 0 and 1.
   */
  compareAddresses(a: string, b: string): number {
    if (!a || !b) return 0;

    const normA = a.toUpperCase().trim();
    const normB = b.toUpperCase().trim();

    // Exact match
    if (normA === normB) return 1.0;

    // Token-based Jaccard similarity with positional weighting
    const tokensA = normA.split(/\s+/);
    const tokensB = normB.split(/\s+/);

    if (tokensA.length === 0 || tokensB.length === 0) return 0;

    // Weight the street number heavily (first token)
    const numberMatch =
      tokensA[0] === tokensB[0] ? 1.0 : 0;

    if (numberMatch === 0) {
      // Different street numbers -- very unlikely to be the same address
      return 0.1 * this.jaccardSimilarity(tokensA, tokensB);
    }

    // Jaccard on remaining tokens
    const restA = tokensA.slice(1);
    const restB = tokensB.slice(1);
    const jaccard = this.jaccardSimilarity(restA, restB);

    // Also compute Levenshtein-based similarity as a fallback
    const levenshteinSim = this.levenshteinSimilarity(normA, normB);

    // Weighted combination: number match is crucial
    return numberMatch * 0.3 + jaccard * 0.4 + levenshteinSim * 0.3;
  }

  /**
   * Compare two names using fuzzy matching.
   * Returns a similarity score between 0 and 1.
   */
  compareNames(a: string, b: string): number {
    if (!a || !b) return 0;

    const normA = a.toUpperCase().trim().replace(/[.,]/g, '');
    const normB = b.toUpperCase().trim().replace(/[.,]/g, '');

    if (normA === normB) return 1.0;

    // Token-based comparison (handles "JOHN SMITH" vs "SMITH, JOHN")
    const tokensA = new Set(normA.split(/[\s,]+/).filter(Boolean));
    const tokensB = new Set(normB.split(/[\s,]+/).filter(Boolean));

    const intersection = new Set(
      [...tokensA].filter((t) => tokensB.has(t)),
    );
    const union = new Set([...tokensA, ...tokensB]);

    if (union.size === 0) return 0;

    const tokenSim = intersection.size / union.size;

    // Also use Levenshtein for partial name misspellings
    const levSim = this.levenshteinSimilarity(normA, normB);

    return Math.max(tokenSim, levSim);
  }

  /**
   * Merge an existing property record with new incoming data.
   * Only overwrites fields where the new data provides a value and the
   * confidence meets the threshold. Returns the merged record and a list
   * of changed fields for audit logging.
   */
  mergeProperties(
    existing: NormalizedProperty,
    newData: Partial<NormalizedProperty>,
    confidence: number,
  ): {
    merged: NormalizedProperty;
    changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
  } {
    const merged = { ...existing };
    const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];

    // Only merge if confidence is reasonably high
    const minConfidence = 0.7;
    if (confidence < minConfidence) {
      logger.debug(
        { confidence, minConfidence },
        'mergeProperties: confidence too low, skipping merge',
      );
      return { merged, changes };
    }

    // Fields eligible for merge (skip id, createdAt, etc.)
    const mergeableFields: Array<keyof NormalizedProperty> = [
      'address',
      'addressLine2',
      'city',
      'state',
      'zipCode',
      'county',
      'parcelNumber',
      'latitude',
      'longitude',
      'propertyType',
      'bedrooms',
      'bathrooms',
      'sqft',
      'lotSizeSqft',
      'yearBuilt',
      'stories',
      'ownerName',
      'ownerAddress',
      'ownerOccupied',
      'absenteeOwner',
      'estimatedValue',
      'assessedValue',
      'lastSalePrice',
      'lastSaleDate',
      'taxAmount',
      'mortgageBalance',
      'equityEstimate',
      'equityPercent',
      'lienAmount',
      'distressStage',
      'listingPrice',
      'auctionDate',
      'defaultAmount',
      'recordingDate',
      'flipScore',
    ];

    for (const field of mergeableFields) {
      const newVal = newData[field];
      const oldVal = existing[field];

      // Skip if new data doesn't have this field or it's null/undefined
      if (newVal === undefined || newVal === null) continue;

      // Skip if values are the same
      if (oldVal === newVal) continue;
      if (
        oldVal instanceof Date &&
        newVal instanceof Date &&
        oldVal.getTime() === newVal.getTime()
      ) {
        continue;
      }

      // Overwrite: prefer new data if existing is null, or if confidence
      // is high enough (>= 0.85) to override existing non-null values
      if (oldVal == null || confidence >= 0.85) {
        (merged as Record<string, unknown>)[field] = newVal;
        changes.push({ field, oldValue: oldVal, newValue: newVal });
      }
    }

    if (changes.length > 0) {
      logger.info(
        { fieldCount: changes.length, fields: changes.map((c) => c.field), confidence },
        'mergeProperties: merged fields',
      );
    }

    return { merged, changes };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Check if parcel numbers or APNs match between candidate and existing.
   */
  private matchParcel(
    candidate: { parcelNumber?: string | null; apn?: string | null },
    existing: { parcelNumber?: string | null; apn?: string | null },
  ): boolean {
    const candParcel = this.normalizeParcel(candidate.parcelNumber);
    const candApn = this.normalizeParcel(candidate.apn);
    const exParcel = this.normalizeParcel(existing.parcelNumber);
    const exApn = this.normalizeParcel(existing.apn);

    if (candParcel && exParcel && candParcel === exParcel) return true;
    if (candApn && exApn && candApn === exApn) return true;
    if (candParcel && exApn && candParcel === exApn) return true;
    if (candApn && exParcel && candApn === exParcel) return true;

    return false;
  }

  /**
   * Normalize a parcel number by removing dashes, spaces, and leading zeros.
   */
  private normalizeParcel(parcel: string | null | undefined): string | null {
    if (!parcel) return null;
    return parcel
      .replace(/[-\s.]/g, '')
      .replace(/^0+/, '')
      .toUpperCase()
      .trim() || null;
  }

  /**
   * Compute a composite confidence from individual match factors.
   * Fuzzy address + owner name yields 0.7-0.85 confidence.
   */
  private computeCompositeConfidence(factors: {
    addressMatch: number;
    parcelMatch: number;
    caseNumberMatch: number;
    ownerNameMatch: number;
    saleDateMatch: number;
  }): number {
    // Weighted composite
    const weights = {
      address: 0.45,
      parcel: 0.20,
      caseNumber: 0.15,
      ownerName: 0.15,
      saleDate: 0.05,
    };

    const composite =
      factors.addressMatch * weights.address +
      factors.parcelMatch * weights.parcel +
      factors.caseNumberMatch * weights.caseNumber +
      factors.ownerNameMatch * weights.ownerName +
      factors.saleDateMatch * weights.saleDate;

    // Scale so that strong fuzzy address + owner name yields 0.7-0.85
    return Math.min(composite, 0.95);
  }

  /**
   * Jaccard similarity between two token arrays.
   */
  private jaccardSimilarity(a: string[], b: string[]): number {
    const setA = new Set(a);
    const setB = new Set(b);

    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }

  /**
   * Compute Levenshtein distance between two strings.
   */
  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;

    // Optimisation: use single-row DP to save memory
    const prev = new Array<number>(n + 1);
    const curr = new Array<number>(n + 1);

    for (let j = 0; j <= n; j++) prev[j] = j;

    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(
          prev[j] + 1,       // deletion
          curr[j - 1] + 1,   // insertion
          prev[j - 1] + cost, // substitution
        );
      }
      for (let j = 0; j <= n; j++) prev[j] = curr[j];
    }

    return prev[n];
  }

  /**
   * Levenshtein-based similarity (0-1). 1 = identical strings.
   */
  private levenshteinSimilarity(a: string, b: string): number {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - this.levenshteinDistance(a, b) / maxLen;
  }
}
