import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { initializeProviders, providerRegistry } from "@/lib/providers";
import { BatchDataPropertyProvider } from "@/lib/providers/batchdata/provider";

// ---------------------------------------------------------------------------
// GET /api/properties/[id]/comps â Fetch comparable sales on demand
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
        const { id: propertyId } = await params;
    const forceRefresh = req.nextUrl.searchParams.get("refresh") === "true";

    // 1. Look up the subject property
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: { comparableSales: { orderBy: { salePrice: "desc" } } },
    });

    if (!property) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 },
      );
    }

    // 2. Return cached comps if they exist and refresh isn't forced
    //    (cache comps for 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const hasFreshComps =
      property.comparableSales.length > 0 &&
      property.comparableSales[0].fetchedAt > oneDayAgo;

    if (hasFreshComps && !forceRefresh) {
      const arvStats = calculateARV(property.comparableSales);
      return NextResponse.json({
        data: {
          propertyId,
          comps: property.comparableSales,
          arv: arvStats,
          cached: true,
        },
      });
    }

    // 3. Fetch fresh comps from BatchData
    initializeProviders();
    const provider = providerRegistry.getPropertyProvider("batchdata");

    if (!provider) {
      return NextResponse.json(
        { error: "BatchData provider is not configured" },
        { status: 422 },
      );
    }

    const batchProvider = provider as BatchDataPropertyProvider;

    const { comps, totalFound } = await batchProvider.getComparables({
      street: property.streetAddress,
      city: property.city,
      state: property.state,
      zip: property.zipCode,
      take: 15,
      distanceMiles: 1,
    });

    logger.info(
      { propertyId, compsReturned: comps.length, totalFound },
      "Fetched comparable sales",
    );

    // 4. Delete old comps and store new ones
    await prisma.comparableSale.deleteMany({
      where: { propertyId },
    });

    if (comps.length > 0) {
      await prisma.comparableSale.createMany({
        data: comps.map((c: any) => ({
          propertyId,
          address: c.address,
          city: c.city ?? null,
          state: c.state ?? null,
          zipCode: c.zipCode ?? null,
          salePrice: c.salePrice,
          saleDate: c.saleDate ? new Date(c.saleDate) : null,
          sqft: c.sqft ?? null,
          bedrooms: c.bedrooms ?? null,
          bathrooms: c.bathrooms ?? null,
          yearBuilt: c.yearBuilt ?? null,
          lotSizeSqft: c.lotSizeSqft ?? null,
          distanceMiles: c.distanceMiles ?? null,
          pricePerSqft: c.pricePerSqft ?? null,
          provider: c.rawData?.county ? "batchdata+county" : "batchdata",
          externalId: c.externalId ?? null,
          rawData: c.rawData ?? null,
        })),
      });
    }

    // 5. Calculate ARV from comps
    const storedComps = await prisma.comparableSale.findMany({
      where: { propertyId },
      orderBy: { salePrice: "desc" },
    });

    const arvStats = calculateARV(storedComps);

    // 6. Update the property's estimatedValue with the ARV
    if (arvStats.median) {
      await prisma.property.update({
        where: { id: propertyId },
        data: { estimatedValue: arvStats.median },
      });
    }

    return NextResponse.json({
      data: {
        propertyId,
        comps: storedComps,
        arv: arvStats,
        totalFound,
        cached: false,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, "GET /api/properties/[id]/comps failed");
    return NextResponse.json(
      { error: "Internal server error", message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// ARV calculation helpers
// ---------------------------------------------------------------------------

interface ARVStats {
  median: number | null;
  mean: number | null;
  low: number | null;
  high: number | null;
  medianPricePerSqft: number | null;
  compCount: number;
}

function calculateARV(
  comps: Array<{ salePrice: number; pricePerSqft?: number | null }>,
): ARVStats {
  if (comps.length === 0) {
    return {
      median: null,
      mean: null,
      low: null,
      high: null,
      medianPricePerSqft: null,
      compCount: 0,
    };
  }

  const prices = comps.map((c) => c.salePrice).sort((a, b) => a - b);
  const ppsf = comps
    .map((c) => c.pricePerSqft)
    .filter((v): v is number => v != null && v > 0)
    .sort((a, b) => a - b);

  return {
    median: median(prices),
    mean: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    low: prices[0],
    high: prices[prices.length - 1],
    medianPricePerSqft: ppsf.length > 0 ? median(ppsf) : null,
    compCount: comps.length,
  };
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}
