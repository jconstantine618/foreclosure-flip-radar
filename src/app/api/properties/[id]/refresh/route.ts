import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { providerRegistry, initializeProviders } from '@/lib/providers';
import { FlipScoringEngine, loadWeightsFromDb } from '@/lib/scoring';
import { lookupGreenvilleParcel } from '@/lib/providers/county/greenville-arcgis';
import { lookupParcelByCoords } from '@/lib/providers/county/horry-arcgis';
import type { ExtendedFlipScoreInput } from '@/types';

// ---------------------------------------------------------------------------
// POST /api/properties/[id]/refresh – Manually refresh property from providers
// ---------------------------------------------------------------------------

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Load property
    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        sourceRecords: { orderBy: { fetchedAt: 'desc' }, take: 1 },
        opportunity: true,
        _count: { select: { countyNotices: true } },
      },
    });

    if (!property) {
      return NextResponse.json(
        { error: 'Property not found' },
        { status: 404 },
      );
    }

    // Ensure providers are initialised
    initializeProviders();

    const updates: Record<string, unknown> = {};
    const errors: string[] = [];

    // Attempt BatchData refresh
    const batchDataProvider = providerRegistry.getPropertyProvider('BatchData');
    if (batchDataProvider) {
      try {
        const details = await batchDataProvider.getPropertyDetails(id);
        if (details) {
          if (details.estimatedValue != null) updates.estimatedValue = details.estimatedValue;
          if (details.assessedValue != null) updates.assessedValue = details.assessedValue;
          if (details.mortgageBalance != null) updates.mortgageBalance = details.mortgageBalance;
          if (details.ownerName != null) updates.ownerName = details.ownerName;
          if (details.ownerOccupied != null) updates.ownerOccupied = details.ownerOccupied;
          if (details.absenteeOwner != null) updates.absenteeOwner = details.absenteeOwner;
          if (details.equityEstimate != null) updates.equityEstimate = details.equityEstimate;
          if (details.taxAmount != null) updates.taxAmount = details.taxAmount;
          if (details.bedrooms != null) updates.bedrooms = details.bedrooms;
          if (details.bathrooms != null) updates.bathrooms = details.bathrooms;
          if (details.sqft != null) updates.sqft = details.sqft;
          if (details.yearBuilt != null) updates.yearBuilt = details.yearBuilt;
          if (details.lastSalePrice != null) updates.lastSalePrice = details.lastSalePrice;
          if (details.lastSaleDate != null) updates.lastSaleDate = new Date(details.lastSaleDate);

          // Store source record
          await prisma.propertySourceRecord.create({
            data: {
              propertyId: id,
              provider: 'BATCHDATA',
              externalId: details.externalId ?? null,
              rawPayload: JSON.parse(JSON.stringify((details as any).rawData ?? {})),
              normalizedData: JSON.parse(JSON.stringify(details)),
              fetchedAt: new Date(),
            },
          });

          logger.info({ propertyId: id }, 'BatchData refresh successful');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`BatchData: ${msg}`);
        logger.warn({ propertyId: id, err: msg }, 'BatchData refresh failed');
      }
    }

    // County GIS enrichment — backfill beds/baths/sqft/value from county records
    if (property.latitude && property.longitude) {
      const county = (property.county ?? '').toLowerCase();
      try {
        if (county.includes('greenville')) {
          const gvl = await lookupGreenvilleParcel(property.latitude, property.longitude);
          if (gvl) {
            if (updates.bedrooms == null && gvl.bedrooms) updates.bedrooms = gvl.bedrooms;
            if (updates.bathrooms == null && gvl.bathrooms) updates.bathrooms = gvl.bathrooms;
            if (updates.sqft == null && gvl.sqft) updates.sqft = gvl.sqft;
            if (updates.assessedValue == null && gvl.taxMarketValue) updates.assessedValue = gvl.taxMarketValue;
            if (updates.lastSalePrice == null && gvl.salePrice && gvl.salePrice > 0) updates.lastSalePrice = gvl.salePrice;
            if (updates.lastSaleDate == null && gvl.saleDate) updates.lastSaleDate = gvl.saleDate;
            if (!property.parcelNumber && gvl.pin) updates.parcelNumber = gvl.pin;
            logger.info({ propertyId: id, county: 'Greenville' }, 'County GIS enrichment applied');
          }
        } else if (county.includes('horry')) {
          const horry = await lookupParcelByCoords(property.latitude, property.longitude);
          if (horry) {
            if (updates.assessedValue == null && horry.marketProp) updates.assessedValue = horry.marketProp;
            if (updates.lastSaleDate == null && horry.saleDate) updates.lastSaleDate = horry.saleDate;
            if (!property.parcelNumber && horry.tms) updates.parcelNumber = horry.tms;
            if (updates.ownerName == null && horry.ownerName) updates.ownerName = horry.ownerName;
            logger.info({ propertyId: id, county: 'Horry' }, 'County GIS enrichment applied');
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`County GIS: ${msg}`);
        logger.warn({ propertyId: id, err: msg }, 'County GIS enrichment failed');
      }
    }

    // BatchData address lookup — fills building details the distress search missed
    if (batchDataProvider && (updates.bedrooms == null || updates.sqft == null)) {
      try {
        const batchProv = batchDataProvider as any;
        if (batchProv.getClient) {
          const client = batchProv.getClient();
          const addr = `${property.streetAddress}, ${property.city}, ${property.state} ${property.zipCode}`;
          const found = await client.getPropertyByAddress(addr);
          if (found) {
            const r = found as Record<string, any>;
            const bd = r.building?.bedroomCount ?? r.building?.bedrooms ?? null;
            const ba = r.building?.bathroomCount ?? r.building?.bathrooms ?? null;
            const sf = r.building?.livingAreaSquareFeet ?? r.building?.squareFeet ?? null;
            const yb = r.building?.yearBuilt ?? null;
            const ls = r.lot?.lotSizeSquareFeet ?? null;
            if (updates.bedrooms == null && bd != null) updates.bedrooms = bd;
            if (updates.bathrooms == null && ba != null) updates.bathrooms = ba;
            if (updates.sqft == null && sf != null) updates.sqft = sf;
            if (updates.yearBuilt == null && yb != null) updates.yearBuilt = yb;
            if (updates.lotSizeSqft == null && ls != null) updates.lotSizeSqft = ls;
            logger.info({ propertyId: id }, 'BatchData address lookup enrichment applied');
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`BatchData address lookup: ${msg}`);
        logger.warn({ propertyId: id, err: msg }, 'BatchData address lookup failed');
      }
    }

    // Attempt ATTOM refresh (if enabled)
    const attomProvider = providerRegistry.getPropertyProvider('ATTOM');
    if (attomProvider) {
      try {
        const details = await attomProvider.getPropertyDetails(id);
        if (details) {
          // Only fill in missing values from ATTOM (BatchData takes priority)
          if (updates.estimatedValue == null && details.estimatedValue != null) {
            updates.estimatedValue = details.estimatedValue;
          }
          if (updates.assessedValue == null && details.assessedValue != null) {
            updates.assessedValue = details.assessedValue;
          }

          await prisma.propertySourceRecord.create({
            data: {
              propertyId: id,
              provider: 'ATTOM',
              externalId: details.externalId ?? null,
              rawPayload: JSON.parse(JSON.stringify((details as any).rawData ?? {})),
              normalizedData: JSON.parse(JSON.stringify(details)),
              fetchedAt: new Date(),
            },
          });

          logger.info({ propertyId: id }, 'ATTOM refresh successful');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`ATTOM: ${msg}`);
        logger.warn({ propertyId: id, err: msg }, 'ATTOM refresh failed');
      }
    }

    // Apply updates to property
    let updatedProperty = property;
    if (Object.keys(updates).length > 0) {
      updatedProperty = await prisma.property.update({
        where: { id },
        data: updates,
      }) as any;
    }

    // Recalculate flip score if opportunity exists
    if (property.opportunity) {
      try {
        const weights = await loadWeightsFromDb(prisma);
        const engine = new FlipScoringEngine(weights);

        const opp = property.opportunity;
        const p = updatedProperty;

        const input: ExtendedFlipScoreInput = {
          estimatedValue: (p.estimatedValue as number) ?? 100_000,
          mortgageBalance: (p.mortgageBalance as number) ?? 0,
          distressStage: opp.distressStage as any,
          arvEstimate: opp.estimatedARV ?? (p.estimatedValue as number) ?? 100_000,
          arvConfidence: opp.estimatedARV ? 0.7 : 0.3,
          daysUntilSale: opp.daysUntilSale ?? null,
          ownerOccupied: p.ownerOccupied,
          absenteeOwner: p.absenteeOwner,
          vacant: null,
          turnoverRate: null,
          yearBuilt: p.yearBuilt,
          sqft: p.sqft,
          propertyType: p.propertyType as any,
          county: p.county,
          purchasePrice: opp.maxAllowableOffer ?? (p.estimatedValue as number ?? 100_000) * 0.7,
          estimatedRehabCost: opp.estimatedRehabCost ?? 25_000,
          noticeCount: (property as any)._count?.countyNotices ?? 0,
          lienCount: null,
          partyCount: null,
          hoaMonthlyAmount: p.hoaAmount,
          isCondo: p.propertyType === 'CONDO',
          floodZone: p.floodZone,
          projectedMonths: null,
        };

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

        logger.info(
          { propertyId: id, newScore: result.score },
          'Flip score recalculated after refresh',
        );
      } catch (scoreErr) {
        const msg = scoreErr instanceof Error ? scoreErr.message : String(scoreErr);
        errors.push(`Scoring: ${msg}`);
        logger.warn({ propertyId: id, err: msg }, 'Score recalculation failed');
      }
    }

    // Reload the full property
    const refreshedProperty = await prisma.property.findUnique({
      where: { id },
      include: {
        opportunity: true,
        sourceRecords: { orderBy: { fetchedAt: 'desc' }, take: 5 },
      },
    });

    return NextResponse.json({
      data: refreshedProperty,
      message: errors.length > 0
        ? `Refresh completed with ${errors.length} warning(s)`
        : 'Refresh completed successfully',
      ...(errors.length > 0 && { errors }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'POST /api/properties/[id]/refresh failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}
