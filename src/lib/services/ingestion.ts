// ---------------------------------------------------------------------------
// Ingestion Service -- orchestrates property/notice intake, dedup, scoring
// ---------------------------------------------------------------------------

import type { ProviderName, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { FlipScoringEngine } from '@/lib/scoring';
import { EntityMatcher } from '@/lib/matching';
import type {
  NormalizedProperty,
  NormalizedNotice,
  ExtendedFlipScoreInput,
  PropertyMatchCandidate,
  MatchResult,
} from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build an ExtendedFlipScoreInput from a NormalizedProperty merged with
 * database property data. Falls back to sensible defaults when values are
 * missing.
 */
function buildScoreInput(
  prop: NormalizedProperty,
  dbProperty: {
    estimatedValue?: number | null;
    mortgageBalance?: number | null;
    yearBuilt?: number | null;
    sqft?: number | null;
    county?: string | null;
    ownerOccupied?: boolean | null;
    absenteeOwner?: boolean | null;
    floodZone?: boolean | null;
    hoaAmount?: number | null;
    propertyType?: string | null;
    parcelNumber?: string | null;
  },
  noticeCount: number,
  lienCount: number,
): ExtendedFlipScoreInput {
  const estimatedValue = prop.estimatedValue ?? dbProperty.estimatedValue ?? 0;
  const mortgageBalance = prop.mortgageBalance ?? dbProperty.mortgageBalance ?? 0;
  const listingPrice = prop.listingPrice ?? estimatedValue * 0.7;
  const rehabEstimate = estimatedValue * 0.15; // rough default 15% of value

  return {
    estimatedValue,
    mortgageBalance,
    distressStage: prop.distressStage ?? 'PRE_FORECLOSURE',
    arvEstimate: estimatedValue > 0 ? estimatedValue : null,
    arvConfidence: null,
    daysUntilSale: prop.auctionDate
      ? Math.max(
          0,
          Math.ceil(
            (new Date(prop.auctionDate).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : null,
    ownerOccupied: prop.ownerOccupied ?? dbProperty.ownerOccupied ?? null,
    absenteeOwner: prop.absenteeOwner ?? dbProperty.absenteeOwner ?? null,
    vacant: null,
    turnoverRate: null,
    yearBuilt: prop.yearBuilt ?? dbProperty.yearBuilt ?? null,
    sqft: prop.sqft ?? dbProperty.sqft ?? null,
    propertyType: (prop.propertyType ?? dbProperty.propertyType ?? null) as ExtendedFlipScoreInput['propertyType'],
    county: prop.county ?? dbProperty.county ?? null,
    purchasePrice: listingPrice,
    estimatedRehabCost: rehabEstimate,
    noticeCount,
    lienCount,
    partyCount: 0,
    hoaMonthlyAmount: dbProperty.hoaAmount ?? null,
    isCondo: (prop.propertyType ?? dbProperty.propertyType) === 'CONDO',
    floodZone: dbProperty.floodZone ?? null,
    projectedMonths: null,
  };
}

// ---------------------------------------------------------------------------
// IngestionService
// ---------------------------------------------------------------------------

export class IngestionService {
  private scoringEngine: FlipScoringEngine;
  private matcher: EntityMatcher;

  constructor() {
    this.scoringEngine = new FlipScoringEngine();
    this.matcher = new EntityMatcher();
  }

  // -------------------------------------------------------------------------
  // Property ingestion
  // -------------------------------------------------------------------------

  /**
   * Ingest a normalized property record from a data provider. Handles
   * deduplication, database upsert, opportunity creation / update, flip
   * scoring, change detection, and alert triggering.
   */
  async ingestProperty(
    normalized: NormalizedProperty,
    source: ProviderName,
  ): Promise<void> {
    try {
      logger.info(
        { source, address: normalized.address, county: normalized.county },
        'ingestProperty: starting',
      );

      // 1. Normalize the address for matching
      const normalizedAddress = this.matcher.normalizeForComparison(
        normalized.address,
      );

      // 2. Match / dedupe against existing records in the same county
      const matchResult = await this.findMatch(normalized, normalizedAddress);

      let propertyId: string;

      if (matchResult.matched && matchResult.matchedPropertyId) {
        // ---- UPDATE existing property ----
        propertyId = matchResult.matchedPropertyId;

        const existing = await prisma.property.findUnique({
          where: { id: propertyId },
        });

        if (!existing) {
          logger.warn(
            { propertyId },
            'ingestProperty: matched property not found in DB',
          );
          propertyId = await this.createProperty(
            normalized,
            normalizedAddress,
            source,
          );
        } else {
          // Merge and detect changes
          const { changes } = this.matcher.mergeProperties(
            this.dbPropertyToNormalized(existing),
            normalized,
            matchResult.confidence,
          );

          // Build update payload from changes
          const updateData = this.buildUpdatePayload(normalized, existing);

          if (Object.keys(updateData).length > 0) {
            await prisma.property.update({
              where: { id: propertyId },
              data: updateData,
            });

            // 7. Store change events
            await this.recordChanges(propertyId, changes, source);
          }

          logger.info(
            { propertyId, confidence: matchResult.confidence, changesCount: changes.length },
            'ingestProperty: updated existing property',
          );
        }
      } else {
        // ---- CREATE new property ----
        propertyId = await this.createProperty(
          normalized,
          normalizedAddress,
          source,
        );
      }

      // 4. Create PropertySourceRecord
      await prisma.propertySourceRecord.create({
        data: {
          propertyId,
          provider: source,
          externalId: normalized.externalId ?? null,
          rawPayload: (normalized.rawData ?? {}) as Prisma.InputJsonValue,
          normalizedData: normalized as unknown as Prisma.InputJsonValue,
          fetchedAt: new Date(),
          confidence: matchResult.matched ? matchResult.confidence : 1.0,
        },
      });

      // 5. Create or update Opportunity
      await this.upsertOpportunity(propertyId, normalized, source);

      // 6. Calculate flip score
      await this.scoreProperty(propertyId, normalized);

      logger.info(
        { propertyId, source, address: normalized.address },
        'ingestProperty: completed',
      );
    } catch (err) {
      logger.error(
        { source, address: normalized.address, error: String(err) },
        'ingestProperty: failed',
      );
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Notice ingestion
  // -------------------------------------------------------------------------

  /**
   * Ingest a normalized county notice. Attempts to match the notice to an
   * existing property, creates the CountyNotice record, and creates or
   * updates an associated Opportunity when a match is found.
   */
  async ingestNotice(
    notice: NormalizedNotice,
    source: ProviderName,
  ): Promise<void> {
    try {
      logger.info(
        { source, county: notice.county, caseNumber: notice.caseNumber, noticeType: notice.noticeType },
        'ingestNotice: starting',
      );

      // 1. Try to match to an existing property
      let matchedPropertyId: string | null = null;
      let matchConfidence: number | null = null;

      if (notice.address || notice.parcelNumber) {
        const matchResult = await this.findNoticeMatch(notice);
        if (matchResult.matched && matchResult.matchedPropertyId) {
          matchedPropertyId = matchResult.matchedPropertyId;
          matchConfidence = matchResult.confidence;

          logger.info(
            { propertyId: matchedPropertyId, confidence: matchConfidence },
            'ingestNotice: matched to property',
          );
        }
      }

      // 2. Check for existing notice with same case number + county
      const existingNotice = notice.caseNumber
        ? await prisma.countyNotice.findFirst({
            where: {
              county: notice.county,
              caseNumber: notice.caseNumber,
            },
          })
        : null;

      let noticeId: string;

      if (existingNotice) {
        // Update existing notice
        const updated = await prisma.countyNotice.update({
          where: { id: existingNotice.id },
          data: {
            propertyId: matchedPropertyId ?? existingNotice.propertyId,
            saleDate: notice.auctionDate
              ? new Date(notice.auctionDate)
              : existingNotice.saleDate,
            address: notice.address ?? existingNotice.address,
            plaintiff: notice.lenderName ?? existingNotice.plaintiff,
            defendant: notice.borrowerName ?? existingNotice.defendant,
            rawContent: notice.rawData
              ? JSON.stringify(notice.rawData)
              : existingNotice.rawContent,
            parsed: notice.rawData
              ? (notice.rawData as Prisma.InputJsonValue)
              : (existingNotice.parsed as Prisma.InputJsonValue | undefined) ?? undefined,
            matchConfidence: matchConfidence ?? existingNotice.matchConfidence,
            sourceUrl: notice.documentUrl ?? existingNotice.sourceUrl,
          },
        });
        noticeId = updated.id;

        logger.info(
          { noticeId, caseNumber: notice.caseNumber },
          'ingestNotice: updated existing notice',
        );
      } else {
        // Create new notice
        const created = await prisma.countyNotice.create({
          data: {
            propertyId: matchedPropertyId,
            county: notice.county,
            noticeType: this.mapNoticeType(notice.noticeType),
            caseNumber: notice.caseNumber ?? null,
            saleDate: notice.auctionDate
              ? new Date(notice.auctionDate)
              : null,
            address: notice.address ?? null,
            plaintiff: notice.lenderName ?? null,
            defendant: notice.borrowerName ?? null,
            rawContent: notice.rawData
              ? JSON.stringify(notice.rawData)
              : null,
            parsed: notice.rawData
              ? (notice.rawData as Prisma.InputJsonValue)
              : undefined,
            matchConfidence: matchConfidence,
            sourceUrl: notice.documentUrl ?? null,
          },
        });
        noticeId = created.id;

        logger.info(
          { noticeId, caseNumber: notice.caseNumber },
          'ingestNotice: created new notice',
        );
      }

      // 3. Create / update opportunity if matched to a property
      if (matchedPropertyId) {
        const property = await prisma.property.findUnique({
          where: { id: matchedPropertyId },
        });

        if (property) {
          const normalizedProp: NormalizedProperty = {
            ...this.dbPropertyToNormalized(property),
            distressStage: this.noticeTypeToDistressStage(notice.noticeType),
            auctionDate: notice.auctionDate ?? undefined,
            defaultAmount: notice.defaultAmount ?? undefined,
          };

          await this.upsertOpportunity(
            matchedPropertyId,
            normalizedProp,
            source,
          );

          await this.scoreProperty(matchedPropertyId, normalizedProp);
        }
      }

      logger.info(
        { noticeId, source, matchedPropertyId },
        'ingestNotice: completed',
      );
    } catch (err) {
      logger.error(
        { source, county: notice.county, caseNumber: notice.caseNumber, error: String(err) },
        'ingestNotice: failed',
      );
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Private: matching helpers
  // -------------------------------------------------------------------------

  /**
   * Find a matching property in the database for a candidate.
   */
  private async findMatch(
    candidate: NormalizedProperty,
    normalizedAddress: string,
  ): Promise<MatchResult> {
    // Query candidate properties from the same county
    const candidates = await prisma.property.findMany({
      where: { county: { equals: candidate.county, mode: 'insensitive' } },
      select: {
        id: true,
        normalizedAddress: true,
        parcelNumber: true,
        apn: true,
        ownerName: true,
        county: true,
      },
      take: 500,
    });

    const matchCandidates: PropertyMatchCandidate[] = candidates.map((p) => ({
      id: p.id,
      normalizedAddress: p.normalizedAddress,
      parcelNumber: p.parcelNumber,
      apn: p.apn,
      ownerName: p.ownerName,
      county: p.county,
    }));

    return this.matcher.matchProperty(
      {
        address: normalizedAddress,
        parcelNumber: candidate.parcelNumber,
        apn: null,
        ownerName: candidate.ownerName,
        county: candidate.county,
      },
      matchCandidates,
    );
  }

  /**
   * Find a matching property for a county notice.
   */
  private async findNoticeMatch(notice: NormalizedNotice): Promise<MatchResult> {
    const candidates = await prisma.property.findMany({
      where: { county: { equals: notice.county, mode: 'insensitive' } },
      select: {
        id: true,
        normalizedAddress: true,
        parcelNumber: true,
        apn: true,
        ownerName: true,
        county: true,
      },
      take: 500,
    });

    const matchCandidates: PropertyMatchCandidate[] = candidates.map((p) => ({
      id: p.id,
      normalizedAddress: p.normalizedAddress,
      parcelNumber: p.parcelNumber,
      apn: p.apn,
      ownerName: p.ownerName,
      county: p.county,
    }));

    const normalizedAddress = notice.address
      ? this.matcher.normalizeForComparison(notice.address)
      : '';

    return this.matcher.matchProperty(
      {
        address: normalizedAddress,
        parcelNumber: notice.parcelNumber,
        apn: null,
        ownerName: notice.borrowerName,
        county: notice.county,
        caseNumber: notice.caseNumber,
        auctionDate: notice.auctionDate ? new Date(notice.auctionDate) : null,
      },
      matchCandidates,
    );
  }

  // -------------------------------------------------------------------------
  // Private: database operations
  // -------------------------------------------------------------------------

  /**
   * Create a new Property record in the database.
   */
  private async createProperty(
    normalized: NormalizedProperty,
    normalizedAddress: string,
    _source: ProviderName,
  ): Promise<string> {
    const property = await prisma.property.create({
      data: {
        normalizedAddress,
        streetAddress: normalized.address,
        city: normalized.city,
        state: normalized.state,
        county: normalized.county,
        zipCode: normalized.zipCode,
        latitude: normalized.latitude ?? null,
        longitude: normalized.longitude ?? null,
        parcelNumber: normalized.parcelNumber ?? null,
        propertyType: this.mapPropertyType(normalized.propertyType),
        bedrooms: normalized.bedrooms ?? null,
        bathrooms: normalized.bathrooms ?? null,
        sqft: normalized.sqft ?? null,
        lotSizeSqft: normalized.lotSizeSqft ?? null,
        yearBuilt: normalized.yearBuilt ?? null,
        estimatedValue: normalized.estimatedValue ?? null,
        assessedValue: normalized.assessedValue ?? null,
        lastSalePrice: normalized.lastSalePrice ?? null,
        lastSaleDate: normalized.lastSaleDate
          ? new Date(normalized.lastSaleDate)
          : null,
        ownerName: normalized.ownerName ?? null,
        ownerOccupied: normalized.ownerOccupied ?? false,
        absenteeOwner: normalized.absenteeOwner ?? false,
        mortgageBalance: normalized.mortgageBalance ?? null,
        equityEstimate: normalized.equityEstimate ?? null,
        taxAmount: normalized.taxAmount ?? null,
      },
    });

    logger.info(
      { propertyId: property.id, address: normalized.address },
      'createProperty: created new property',
    );

    return property.id;
  }

  /**
   * Create or update an Opportunity for a given property.
   */
  private async upsertOpportunity(
    propertyId: string,
    normalized: NormalizedProperty,
    _source: ProviderName,
  ): Promise<void> {
    const distressStage = this.mapDistressStage(
      normalized.distressStage ?? 'PRE_FORECLOSURE',
    );

    const daysUntilSale = normalized.auctionDate
      ? Math.max(
          0,
          Math.ceil(
            (new Date(normalized.auctionDate).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : null;

    const existing = await prisma.opportunity.findUnique({
      where: { propertyId },
    });

    if (existing) {
      await prisma.opportunity.update({
        where: { propertyId },
        data: {
          distressStage,
          auctionDate: normalized.auctionDate
            ? new Date(normalized.auctionDate)
            : existing.auctionDate,
          daysUntilSale: daysUntilSale ?? existing.daysUntilSale,
          estimatedARV: normalized.estimatedValue ?? existing.estimatedARV,
          isActive: true,
        },
      });

      logger.debug({ propertyId }, 'upsertOpportunity: updated');
    } else {
      await prisma.opportunity.create({
        data: {
          propertyId,
          distressStage,
          flipScore: 0,
          auctionDate: normalized.auctionDate
            ? new Date(normalized.auctionDate)
            : null,
          daysUntilSale,
          estimatedARV: normalized.estimatedValue ?? null,
          isActive: true,
        },
      });

      logger.debug({ propertyId }, 'upsertOpportunity: created');
    }
  }

  /**
   * Calculate and persist the flip score for a property.
   */
  private async scoreProperty(
    propertyId: string,
    normalized: NormalizedProperty,
  ): Promise<void> {
    const dbProperty = await prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!dbProperty) return;

    // Count notices and liens for title complexity
    const noticeCount = await prisma.countyNotice.count({
      where: { propertyId },
    });
    const lienCount = dbProperty.taxDelinquent ? 1 : 0;

    const scoreInput = buildScoreInput(
      normalized,
      dbProperty,
      noticeCount,
      lienCount,
    );

    const result = this.scoringEngine.calculateScore(scoreInput);

    // Persist score to Opportunity
    await prisma.opportunity.updateMany({
      where: { propertyId },
      data: {
        flipScore: result.score,
        maxAllowableOffer: result.estimates.estimatedMaxBid,
        targetPurchasePrice: result.estimates.targetPurchasePrice,
        estimatedRehabCost: result.estimates.roughRehabReserve,
        projectedGrossMargin: result.estimates.projectedGrossMargin,
        projectedNetMargin: result.estimates.projectedNetMargin,
        projectedDaysToFlip: result.estimates.projectedDaysToFlip,
      },
    });

    logger.info(
      { propertyId, score: result.score, maxBid: result.estimates.estimatedMaxBid, netMargin: result.estimates.projectedNetMargin },
      'scoreProperty: calculated flip score',
    );
  }

  /**
   * Record property change events for the audit trail.
   */
  private async recordChanges(
    propertyId: string,
    changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>,
    source: ProviderName,
  ): Promise<void> {
    if (changes.length === 0) return;

    const events = changes.map((change) => ({
      propertyId,
      field: change.field,
      oldValue: change.oldValue != null ? String(change.oldValue) : null,
      newValue: change.newValue != null ? String(change.newValue) : null,
      source,
      detectedAt: new Date(),
    }));

    await prisma.propertyChangeEvent.createMany({ data: events });

    logger.debug(
      { propertyId, count: events.length },
      'recordChanges: stored change events',
    );
  }

  // -------------------------------------------------------------------------
  // Private: conversion helpers
  // -------------------------------------------------------------------------

  /**
   * Build a partial update payload from normalized data, only including
   * fields where new data differs from existing.
   */
  private buildUpdatePayload(
    normalized: NormalizedProperty,
    existing: Record<string, unknown>,
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    const fieldMap: Array<[keyof NormalizedProperty, string]> = [
      ['latitude', 'latitude'],
      ['longitude', 'longitude'],
      ['parcelNumber', 'parcelNumber'],
      ['propertyType', 'propertyType'],
      ['bedrooms', 'bedrooms'],
      ['bathrooms', 'bathrooms'],
      ['sqft', 'sqft'],
      ['lotSizeSqft', 'lotSizeSqft'],
      ['yearBuilt', 'yearBuilt'],
      ['estimatedValue', 'estimatedValue'],
      ['assessedValue', 'assessedValue'],
      ['lastSalePrice', 'lastSalePrice'],
      ['ownerName', 'ownerName'],
      ['ownerOccupied', 'ownerOccupied'],
      ['absenteeOwner', 'absenteeOwner'],
      ['mortgageBalance', 'mortgageBalance'],
      ['equityEstimate', 'equityEstimate'],
      ['taxAmount', 'taxAmount'],
    ];

    for (const [normField, dbField] of fieldMap) {
      const newVal = normalized[normField];
      if (newVal != null && newVal !== existing[dbField]) {
        payload[dbField] = newVal;
      }
    }

    // Handle date fields separately
    if (normalized.lastSaleDate) {
      payload.lastSaleDate = new Date(normalized.lastSaleDate);
    }

    return payload;
  }

  /**
   * Convert a Prisma Property record to NormalizedProperty shape.
   */
  private dbPropertyToNormalized(dbProp: Record<string, unknown>): NormalizedProperty {
    return {
      id: dbProp.id as string,
      address: dbProp.streetAddress as string,
      city: dbProp.city as string,
      state: dbProp.state as string,
      zipCode: dbProp.zipCode as string,
      county: dbProp.county as string,
      parcelNumber: dbProp.parcelNumber as string | null,
      latitude: dbProp.latitude as number | null,
      longitude: dbProp.longitude as number | null,
      propertyType: dbProp.propertyType as NormalizedProperty['propertyType'],
      bedrooms: dbProp.bedrooms as number | null,
      bathrooms: dbProp.bathrooms as number | null,
      sqft: dbProp.sqft as number | null,
      lotSizeSqft: dbProp.lotSizeSqft as number | null,
      yearBuilt: dbProp.yearBuilt as number | null,
      stories: null,
      ownerName: dbProp.ownerName as string | null,
      ownerOccupied: dbProp.ownerOccupied as boolean | null,
      absenteeOwner: dbProp.absenteeOwner as boolean | null,
      estimatedValue: dbProp.estimatedValue as number | null,
      assessedValue: dbProp.assessedValue as number | null,
      lastSalePrice: dbProp.lastSalePrice as number | null,
      lastSaleDate: dbProp.lastSaleDate as Date | null,
      taxAmount: dbProp.taxAmount as number | null,
      mortgageBalance: dbProp.mortgageBalance as number | null,
      equityEstimate: dbProp.equityEstimate as number | null,
    };
  }

  /**
   * Map a NormalizedProperty distress stage string to the Prisma
   * DistressStage enum. The Prisma enum has a smaller set of values
   * than the Zod enum used in types.
   */
  private mapDistressStage(
    stage: string,
  ): 'PRE_FORECLOSURE' | 'AUCTION' | 'REO' | 'TAX_LIEN' | 'LIS_PENDENS' | 'BANK_OWNED' | 'OTHER' {
    const map: Record<string, 'PRE_FORECLOSURE' | 'AUCTION' | 'REO' | 'TAX_LIEN' | 'LIS_PENDENS' | 'BANK_OWNED' | 'OTHER'> = {
      PRE_FORECLOSURE: 'PRE_FORECLOSURE',
      AUCTION_SCHEDULED: 'AUCTION',
      NOTICE_OF_SALE: 'AUCTION',
      NOTICE_OF_DEFAULT: 'PRE_FORECLOSURE',
      REO: 'REO',
      BANK_OWNED: 'BANK_OWNED',
      TAX_LIEN: 'TAX_LIEN',
      LIS_PENDENS: 'LIS_PENDENS',
      PROBATE: 'OTHER',
      BANKRUPTCY: 'OTHER',
    };
    return map[stage] ?? 'OTHER';
  }

  /**
   * Map a NormalizedProperty propertyType to the Prisma PropertyType enum.
   */
  private mapPropertyType(
    type: string | null | undefined,
  ): 'SINGLE_FAMILY' | 'TOWNHOUSE' | 'CONDO' | 'DUPLEX' | 'MULTI_FAMILY' | 'OTHER' {
    if (!type) return 'SINGLE_FAMILY';
    const map: Record<string, 'SINGLE_FAMILY' | 'TOWNHOUSE' | 'CONDO' | 'DUPLEX' | 'MULTI_FAMILY' | 'OTHER'> = {
      SINGLE_FAMILY: 'SINGLE_FAMILY',
      TOWNHOUSE: 'TOWNHOUSE',
      CONDO: 'CONDO',
      DUPLEX: 'DUPLEX',
      MULTI_FAMILY: 'MULTI_FAMILY',
      MANUFACTURED: 'OTHER',
      LAND: 'OTHER',
      COMMERCIAL: 'OTHER',
      OTHER: 'OTHER',
    };
    return map[type] ?? 'SINGLE_FAMILY';
  }

  /**
   * Map a notice type string to a Prisma NoticeType enum value.
   */
  private mapNoticeType(
    noticeType: string,
  ): 'MASTER_IN_EQUITY' | 'UPSET_BID' | 'LIS_PENDENS' | 'TAX_SALE' | 'PUBLIC_NOTICE' | 'OTHER' {
    const upper = noticeType.toUpperCase();
    if (upper.includes('MASTER') || upper.includes('MIE')) return 'MASTER_IN_EQUITY';
    if (upper.includes('UPSET')) return 'UPSET_BID';
    if (upper.includes('LIS') || upper.includes('PENDENS')) return 'LIS_PENDENS';
    if (upper.includes('TAX')) return 'TAX_SALE';
    if (upper.includes('PUBLIC')) return 'PUBLIC_NOTICE';
    return 'OTHER';
  }

  /**
   * Map a notice type to a distress stage for scoring purposes.
   */
  private noticeTypeToDistressStage(
    noticeType: string,
  ): NormalizedProperty['distressStage'] {
    const upper = noticeType.toUpperCase();
    if (upper.includes('MASTER') || upper.includes('MIE')) return 'AUCTION_SCHEDULED';
    if (upper.includes('UPSET')) return 'AUCTION_SCHEDULED';
    if (upper.includes('LIS') || upper.includes('PENDENS')) return 'LIS_PENDENS';
    if (upper.includes('TAX')) return 'TAX_LIEN';
    return 'PRE_FORECLOSURE';
  }
}
