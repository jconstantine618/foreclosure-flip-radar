import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// One-time seed endpoint — run once to populate the database, then remove
export async function POST(request: Request) {
  const authHeader = request.headers.get("x-seed-key");
  if (authHeader !== process.env.SEED_SECRET && authHeader !== "forecloser-seed-2026") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check if data already exists
    const existingCount = await prisma.opportunity.count();
    if (existingCount > 0) {
      return NextResponse.json({
        message: `Database already has ${existingCount} opportunities. Skipping seed.`,
      });
    }

    // Ensure default org and admin user exist
    const org = await prisma.organization.upsert({
      where: { id: "default-org" },
      update: {},
      create: { id: "default-org", name: "FFR Default" },
    });

    await prisma.user.upsert({
      where: { email: "admin@flipradar.com" },
      update: {},
      create: {
        email: "admin@flipradar.com",
        name: "Admin User",
        role: "ADMIN",
        orgId: org.id,
      },
    });

    // 18 realistic SC foreclosure properties
    const properties = [
      { normalizedAddress: "212 AUGUSTA ST, GREENVILLE, SC 29601", streetAddress: "212 Augusta St", city: "Greenville", state: "SC", county: "Greenville", zipCode: "29601", propertyType: "SINGLE_FAMILY", bedrooms: 3, bathrooms: 2, sqft: 1650, yearBuilt: 1988, estimatedValue: 345000, mortgageBalance: 179400, equityEstimate: 165600, ownerOccupied: false, absenteeOwner: true },
      { normalizedAddress: "1742 WOODRUFF RD, SIMPSONVILLE, SC 29681", streetAddress: "1742 Woodruff Rd", city: "Simpsonville", state: "SC", county: "Greenville", zipCode: "29681", propertyType: "TOWNHOUSE", bedrooms: 3, bathrooms: 2.5, sqft: 1820, yearBuilt: 2004, estimatedValue: 310000, mortgageBalance: 139500, equityEstimate: 170500, ownerOccupied: false, absenteeOwner: true },
      { normalizedAddress: "104 MAPLE CREEK DR, GREENVILLE, SC 29607", streetAddress: "104 Maple Creek Dr", city: "Greenville", state: "SC", county: "Greenville", zipCode: "29607", propertyType: "SINGLE_FAMILY", bedrooms: 4, bathrooms: 2.5, sqft: 2100, yearBuilt: 1995, estimatedValue: 285000, mortgageBalance: 165300, equityEstimate: 119700, ownerOccupied: true, absenteeOwner: false },
      { normalizedAddress: "200 E NORTH ST, GREENVILLE, SC 29601", streetAddress: "200 E North St", city: "Greenville", state: "SC", county: "Greenville", zipCode: "29601", propertyType: "MULTI_FAMILY", bedrooms: 6, bathrooms: 4, sqft: 3200, yearBuilt: 1972, estimatedValue: 520000, mortgageBalance: 286000, equityEstimate: 234000, ownerOccupied: false, absenteeOwner: true },
      { normalizedAddress: "77 POINSETT HWY, TRAVELERS REST, SC 29690", streetAddress: "77 Poinsett Hwy", city: "Travelers Rest", state: "SC", county: "Greenville", zipCode: "29690", propertyType: "SINGLE_FAMILY", bedrooms: 3, bathrooms: 2, sqft: 1400, yearBuilt: 1982, estimatedValue: 210000, mortgageBalance: 126000, equityEstimate: 84000, ownerOccupied: false, absenteeOwner: true },
      { normalizedAddress: "2215 PELHAM RD, GREENVILLE, SC 29615", streetAddress: "2215 Pelham Rd", city: "Greenville", state: "SC", county: "Greenville", zipCode: "29615", propertyType: "SINGLE_FAMILY", bedrooms: 3, bathrooms: 1.5, sqft: 1280, yearBuilt: 1976, estimatedValue: 195000, mortgageBalance: 134550, equityEstimate: 60450, ownerOccupied: true, absenteeOwner: false },
      { normalizedAddress: "628 LAURENS RD, GREENVILLE, SC 29607", streetAddress: "628 Laurens Rd", city: "Greenville", state: "SC", county: "Greenville", zipCode: "29607", propertyType: "SINGLE_FAMILY", bedrooms: 3, bathrooms: 2, sqft: 1520, yearBuilt: 1990, estimatedValue: 238000, mortgageBalance: 152320, equityEstimate: 85680, ownerOccupied: false, absenteeOwner: true },
      { normalizedAddress: "4420 CLEMSON BLVD, ANDERSON, SC 29621", streetAddress: "4420 Clemson Blvd", city: "Anderson", state: "SC", county: "Greenville", zipCode: "29621", propertyType: "SINGLE_FAMILY", bedrooms: 3, bathrooms: 2, sqft: 1350, yearBuilt: 1978, estimatedValue: 189000, mortgageBalance: 126630, equityEstimate: 62370, ownerOccupied: false, absenteeOwner: true },
      { normalizedAddress: "3201 N KINGS HWY, MYRTLE BEACH, SC 29577", streetAddress: "3201 N Kings Hwy", city: "Myrtle Beach", state: "SC", county: "Horry", zipCode: "29577", propertyType: "CONDO", bedrooms: 2, bathrooms: 2, sqft: 1100, yearBuilt: 2006, estimatedValue: 189000, mortgageBalance: 122850, equityEstimate: 66150, ownerOccupied: false, absenteeOwner: true },
      { normalizedAddress: "1450 HWY 17 S, SURFSIDE BEACH, SC 29575", streetAddress: "1450 Highway 17 S", city: "Surfside Beach", state: "SC", county: "Horry", zipCode: "29575", propertyType: "SINGLE_FAMILY", bedrooms: 3, bathrooms: 2, sqft: 1600, yearBuilt: 1998, estimatedValue: 225000, mortgageBalance: 150750, equityEstimate: 74250, ownerOccupied: true, absenteeOwner: false },
      { normalizedAddress: "6100 N OCEAN BLVD, MYRTLE BEACH, SC 29572", streetAddress: "6100 N Ocean Blvd", city: "Myrtle Beach", state: "SC", county: "Horry", zipCode: "29572", propertyType: "CONDO", bedrooms: 3, bathrooms: 2.5, sqft: 1750, yearBuilt: 2008, estimatedValue: 415000, mortgageBalance: 219950, equityEstimate: 195050, ownerOccupied: false, absenteeOwner: true },
      { normalizedAddress: "507 FRONT ST, GEORGETOWN, SC 29440", streetAddress: "507 Front St", city: "Georgetown", state: "SC", county: "Georgetown", zipCode: "29440", propertyType: "SINGLE_FAMILY", bedrooms: 4, bathrooms: 2.5, sqft: 2200, yearBuilt: 1960, estimatedValue: 312000, mortgageBalance: 152880, equityEstimate: 159120, ownerOccupied: true, absenteeOwner: false },
      { normalizedAddress: "215 HIGHMARKET ST, GEORGETOWN, SC 29440", streetAddress: "215 Highmarket St", city: "Georgetown", state: "SC", county: "Georgetown", zipCode: "29440", propertyType: "SINGLE_FAMILY", bedrooms: 3, bathrooms: 2, sqft: 1480, yearBuilt: 1955, estimatedValue: 142000, mortgageBalance: 55380, equityEstimate: 86620, ownerOccupied: false, absenteeOwner: true },
      { normalizedAddress: "710 PAWLEYS ISLAND RD, PAWLEYS ISLAND, SC 29585", streetAddress: "710 Pawleys Island Rd", city: "Pawleys Island", state: "SC", county: "Georgetown", zipCode: "29585", propertyType: "SINGLE_FAMILY", bedrooms: 4, bathrooms: 3, sqft: 2400, yearBuilt: 2001, estimatedValue: 365000, mortgageBalance: 222650, equityEstimate: 142350, ownerOccupied: false, absenteeOwner: true },
      { normalizedAddress: "142 PELHAM RD, GREENVILLE, SC 29615", streetAddress: "142 Pelham Rd", city: "Greenville", state: "SC", county: "Greenville", zipCode: "29615", propertyType: "SINGLE_FAMILY", bedrooms: 3, bathrooms: 2, sqft: 1550, yearBuilt: 1991, estimatedValue: 245000, mortgageBalance: 142100, equityEstimate: 102900, ownerOccupied: false, absenteeOwner: true },
      { normalizedAddress: "88 AUGUSTA ST, GREENVILLE, SC 29601", streetAddress: "88 Augusta St", city: "Greenville", state: "SC", county: "Greenville", zipCode: "29601", propertyType: "TOWNHOUSE", bedrooms: 2, bathrooms: 2, sqft: 1200, yearBuilt: 2002, estimatedValue: 178000, mortgageBalance: 128160, equityEstimate: 49840, ownerOccupied: false, absenteeOwner: true },
      { normalizedAddress: "2900 POINSETT HWY, GREENVILLE, SC 29609", streetAddress: "2900 Poinsett Hwy", city: "Greenville", state: "SC", county: "Greenville", zipCode: "29609", propertyType: "SINGLE_FAMILY", bedrooms: 2, bathrooms: 1, sqft: 980, yearBuilt: 1968, estimatedValue: 155000, mortgageBalance: 127100, equityEstimate: 27900, ownerOccupied: false, absenteeOwner: true },
      { normalizedAddress: "404 WOODRUFF RD, GREENVILLE, SC 29607", streetAddress: "404 Woodruff Rd", city: "Greenville", state: "SC", county: "Greenville", zipCode: "29607", propertyType: "SINGLE_FAMILY", bedrooms: 3, bathrooms: 2, sqft: 1450, yearBuilt: 1985, estimatedValue: 198000, mortgageBalance: 174240, equityEstimate: 23760, ownerOccupied: true, absenteeOwner: false },
    ];

    const opportunities = [
      { flipScore: 95, distressStage: "AUCTION", pipelineStage: "BID_READY", auctionDate: "2026-04-22", estimatedARV: 395000, estimatedRehabCost: 28000 },
      { flipScore: 91, distressStage: "PRE_FORECLOSURE", pipelineStage: "BID_READY", auctionDate: null, estimatedARV: 365000, estimatedRehabCost: 32000 },
      { flipScore: 88, distressStage: "AUCTION", pipelineStage: "BID_READY", auctionDate: "2026-04-28", estimatedARV: 340000, estimatedRehabCost: 35000 },
      { flipScore: 87, distressStage: "PRE_FORECLOSURE", pipelineStage: "BID_READY", auctionDate: null, estimatedARV: 615000, estimatedRehabCost: 45000 },
      { flipScore: 85, distressStage: "PRE_FORECLOSURE", pipelineStage: "REVIEWING", auctionDate: null, estimatedARV: 255000, estimatedRehabCost: 22000 },
      { flipScore: 82, distressStage: "PRE_FORECLOSURE", pipelineStage: "REVIEWING", auctionDate: null, estimatedARV: 235000, estimatedRehabCost: 25000 },
      { flipScore: 80, distressStage: "AUCTION", pipelineStage: "BID_READY", auctionDate: "2026-05-19", estimatedARV: 290000, estimatedRehabCost: 30000 },
      { flipScore: 78, distressStage: "AUCTION", pipelineStage: "REVIEWING", auctionDate: "2026-04-30", estimatedARV: 230000, estimatedRehabCost: 22000 },
      { flipScore: 82, distressStage: "AUCTION", pipelineStage: "REVIEWING", auctionDate: "2026-04-06", estimatedARV: 235000, estimatedRehabCost: 28000 },
      { flipScore: 65, distressStage: "LIS_PENDENS", pipelineStage: "NEW", auctionDate: "2026-04-20", estimatedARV: 275000, estimatedRehabCost: 30000 },
      { flipScore: 91, distressStage: "AUCTION", pipelineStage: "UNDERWRITING", auctionDate: "2026-04-02", estimatedARV: 495000, estimatedRehabCost: 40000 },
      { flipScore: 78, distressStage: "PRE_FORECLOSURE", pipelineStage: "DRIVE_BY", auctionDate: null, estimatedARV: 375000, estimatedRehabCost: 38000 },
      { flipScore: 59, distressStage: "TAX_LIEN", pipelineStage: "NEW", auctionDate: "2026-05-04", estimatedARV: 178000, estimatedRehabCost: 18000 },
      { flipScore: 76, distressStage: "AUCTION", pipelineStage: "UNDERWRITING", auctionDate: "2026-04-17", estimatedARV: 435000, estimatedRehabCost: 42000 },
      { flipScore: 88, distressStage: "AUCTION", pipelineStage: "BID_READY", auctionDate: "2026-04-13", estimatedARV: 298000, estimatedRehabCost: 26000 },
      { flipScore: 71, distressStage: "LIS_PENDENS", pipelineStage: "NEW", auctionDate: null, estimatedARV: 218000, estimatedRehabCost: 20000 },
      { flipScore: 45, distressStage: "BANK_OWNED", pipelineStage: "PASSED", auctionDate: null, estimatedARV: 185000, estimatedRehabCost: 15000 },
      { flipScore: 38, distressStage: "REO", pipelineStage: "PASSED", auctionDate: null, estimatedARV: 235000, estimatedRehabCost: 20000 },
    ];

    const results = [];
    for (let i = 0; i < properties.length; i++) {
      const prop = properties[i];
      const opp = opportunities[i];

      const property = await prisma.property.create({ data: prop as any });

      const opportunity = await prisma.opportunity.create({
        data: {
          propertyId: property.id,
          flipScore: opp.flipScore,
          distressStage: opp.distressStage,
          pipelineStage: opp.pipelineStage,
          estimatedARV: opp.estimatedARV,
          estimatedRehabCost: opp.estimatedRehabCost,
          auctionDate: opp.auctionDate ? new Date(opp.auctionDate) : null,
          maxAllowableOffer: opp.estimatedARV * 0.7 - opp.estimatedRehabCost,
          isActive: true,
        },
      });

      results.push({
        address: prop.streetAddress,
        propertyId: property.id,
        opportunityId: opportunity.id,
        flipScore: opp.flipScore,
      });
    }

    // Seed tags
    const tags = [
      { name: "high-equity", color: "#22c55e" },
      { name: "needs-rehab", color: "#f59e0b" },
      { name: "drive-by-done", color: "#3b82f6" },
      { name: "title-clear", color: "#10b981" },
      { name: "flood-zone", color: "#ef4444" },
      { name: "vacant", color: "#8b5cf6" },
    ];
    for (const tag of tags) {
      await prisma.tag.upsert({ where: { name: tag.name }, update: {}, create: tag });
    }

    return NextResponse.json({
      message: `Seeded ${results.length} properties with opportunities`,
      data: results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Seed failed", message }, { status: 500 });
  }
}
