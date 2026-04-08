// ---------------------------------------------------------------------------
// POST /api/enrich — Batch county-GIS enrichment for properties missing valuations
// Iterates through properties with null estimatedValue and fills in data from
// free county ArcGIS endpoints. Also recalculates flip scores after enrichment.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { lookupParcelByCoords } from "@/lib/providers/county/horry-arcgis";
import { lookupGreenvilleParcel } from "@/lib/providers/county/greenville-arcgis";
import { lookupGeorgetownParcel } from "@/lib/providers/county/georgetown-arcgis";
import { FlipScoringEngine } from "@/lib/scoring";

export const maxDuration = 300;

interface EnrichResult {
  county: string;
  total: number;
  enriched: number;
  failed: number;
  skipped: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const targetCounty: string | undefined = body.county;

    // Find properties missing valuations
    const where: Record<string, unknown> = {
      estimatedValue: null,
      latitude: { not: null },
      longitude: { not: null },
    };
    if (targetCounty) {
      where.county = { equals: targetCounty, mode: "insensitive" };
    }

    const properties = await prisma.property.findMany({
      where,
      select: {
        id: true,
        streetAddress: true,
        county: true,
        latitude: true,
        longitude: true,
      },
      take: 1000,
    });

    console.log(`[Enrich] Found ${properties.length} properties to enrich`);

    const scoringEngine = new FlipScoringEngine();
    const results: Record<string, EnrichResult> = {};

    for (const prop of properties) {
      const county = prop.county;
      if (!results[county]) {
        results[county] = { county, total: 0, enriched: 0, failed: 0, skipped: 0 };
      }
      results[county].total++;

      if (!prop.latitude || !prop.longitude) {
        results[county].skipped++;
        continue;
      }

      try {
        const updateData: Record<string, unknown> = {};
        let estimatedValue: number | null = null;

        if (county.toLowerCase() === "horry") {
          const data = await lookupParcelByCoords(prop.latitude, prop.longitude);
          if (data) {
            if (data.marketProp) { updateData.estimatedValue = data.marketProp; estimatedValue = data.marketProp; }
            if (data.marketLand) updateData.assessedValue = data.marketLand;
            if (data.saleDate) updateData.lastSaleDate = data.saleDate;
            if (data.acreage) updateData.lotSizeSqft = Math.round(data.acreage * 43560);
          }
        } else if (county.toLowerCase() === "greenville") {
          const data = await lookupGreenvilleParcel(prop.latitude, prop.longitude);
          if (data) {
            if (data.taxMarketValue) { updateData.estimatedValue = data.taxMarketValue; estimatedValue = data.taxMarketValue; }
            if (data.salePrice) updateData.lastSalePrice = data.salePrice;
            if (data.saleDate) updateData.lastSaleDate = data.saleDate;
            if (data.sqft) updateData.sqft = data.sqft;
            if (data.bedrooms) updateData.bedrooms = data.bedrooms;
            if (data.bathrooms) updateData.bathrooms = data.bathrooms;
            if (data.lotSize) updateData.lotSizeSqft = Math.round(data.lotSize * 43560);
            if (data.totalTax) updateData.taxAmount = data.totalTax;
            if (data.pin) updateData.parcelNumber = data.pin;
          }
        } else if (county.toLowerCase() === "georgetown") {
          const data = await lookupGeorgetownParcel(prop.latitude, prop.longitude);
          if (data) {
            // Georgetown lacks market value — use sale price as estimatedValue fallback
            if (data.salePrice) {
              updateData.lastSalePrice = data.salePrice;
              updateData.estimatedValue = data.salePrice;
              estimatedValue = data.salePrice;
            }
            if (data.saleDate) updateData.lastSaleDate = data.saleDate;
            if (data.totalLandArea) updateData.lotSizeSqft = Math.round(data.totalLandArea * 43560);
          }
        }

        if (Object.keys(updateData).length > 0) {
          // Update property with enriched data
          await prisma.property.update({
            where: { id: prop.id },
            data: updateData,
          });

          // Recalculate flip score if we got a valuation
          if (estimatedValue && estimatedValue > 0) {
            await recalcScore(prop.id, estimatedValue, scoringEngine);
          }

          results[county].enriched++;
          console.log(`[Enrich] ✓ ${prop.streetAddress} (${county}) — est: $${estimatedValue?.toLocaleString() ?? "n/a"}`);
        } else {
          results[county].failed++;
        }
      } catch (err) {
        results[county].failed++;
        console.warn(`[Enrich] ✗ ${prop.streetAddress} (${county}):`, err instanceof Error ? err.message : err);
      }

      // Small delay to be respectful to county GIS servers
      await new Promise((r) => setTimeout(r, 100));
    }

    const summary = Object.values(results);
    return NextResponse.json({ data: { results: summary, totalProcessed: properties.length } });
  } catch (err) {
    console.error("[Enrich] Fatal error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * Recalculate and persist the flip score for a property after enrichment.
 */
async function recalcScore(
  propertyId: string,
  estimatedValue: number,
  scoringEngine: FlipScoringEngine,
): Promise<void> {
  const dbProp = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!dbProp) return;

  const mortgageBalance = dbProp.mortgageBalance ?? 0;
  const listingPrice = estimatedValue * 0.7;
  const rehabEstimate = estimatedValue * 0.15;

  const opportunity = await prisma.opportunity.findUnique({ where: { propertyId } });
  const distressStage = opportunity?.distressStage ?? "PRE_FORECLOSURE";
  const daysUntilSale = opportunity?.daysUntilSale ?? null;

  const result = scoringEngine.calculateScore({
    estimatedValue,
    mortgageBalance,
    distressStage,
    arvEstimate: estimatedValue,
    arvConfidence: null,
    daysUntilSale,
    ownerOccupied: dbProp.ownerOccupied ?? null,
    absenteeOwner: dbProp.absenteeOwner ?? null,
    vacant: null,
    turnoverRate: null,
    yearBuilt: dbProp.yearBuilt ?? null,
    sqft: dbProp.sqft ?? null,
    propertyType: (dbProp.propertyType ?? null) as any,
    county: dbProp.county ?? null,
    purchasePrice: listingPrice,
    estimatedRehabCost: rehabEstimate,
    noticeCount: 0,
    lienCount: dbProp.taxDelinquent ? 1 : 0,
    partyCount: 0,
    hoaMonthlyAmount: dbProp.hoaAmount ?? null,
    isCondo: dbProp.propertyType === "CONDO",
    floodZone: dbProp.floodZone ?? null,
    projectedMonths: null,
  });

  await prisma.opportunity.updateMany({
    where: { propertyId },
    data: {
      flipScore: result.score,
      estimatedARV: estimatedValue,
      maxAllowableOffer: result.estimates.estimatedMaxBid,
      targetPurchasePrice: result.estimates.targetPurchasePrice,
      estimatedRehabCost: result.estimates.roughRehabReserve,
      projectedGrossMargin: result.estimates.projectedGrossMargin,
      projectedNetMargin: result.estimates.projectedNetMargin,
      projectedDaysToFlip: result.estimates.projectedDaysToFlip,
    },
  });
}
