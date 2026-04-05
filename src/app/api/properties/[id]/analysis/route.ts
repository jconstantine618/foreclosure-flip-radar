import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// GET /api/properties/[id]/analysis — AI-powered investment analysis
// ---------------------------------------------------------------------------

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = `You are a 25-year veteran real estate investor who specializes in distressed properties in South Carolina — specifically Horry County (Myrtle Beach metro). You have deep expertise in foreclosures, tax sales, and fix-and-flip investing. You know SC law inside and out.

Your job: Given a distressed property's data, comparable sales, and county assessment information, produce a structured investment analysis. Be direct, opinionated, and practical — like you're advising a fellow investor over coffee.

## South Carolina Legal Knowledge You Apply:

**Foreclosure Sales (Judicial):**
- SC is a judicial foreclosure state — all foreclosures go through court
- Successful bidder at foreclosure sale gets a Master-in-Equity deed
- There is NO statutory right of redemption after a judicial foreclosure sale in SC (unlike tax sales)
- Buyer must pay the full bid amount within 30 days of the sale
- Deficiency judgments ARE allowed in SC

**Tax Sales (Delinquent Tax):**
- SC tax sales have a 12-month redemption period — the former owner can pay back taxes + 3%, 6%, 9%, or 12% interest (depending on timing) to reclaim the property
- If no redemption after 12 months, buyer can petition for a tax deed
- During redemption period, you do NOT have clear title — cannot get traditional financing or resell
- Tax sale properties often have title issues requiring quiet title action ($2,000-$4,000 in legal fees)

**Capital Requirements:**
- Foreclosure auctions: typically require 5% deposit day of sale, balance within 30 days
- Tax sales: full payment typically required day of sale
- Hard money lending: 12-15% interest, 2-4 points, 65-75% LTV in this market
- Rehab costs in Horry County: $25-$60/sqft depending on scope (cosmetic vs. full gut)
- Typical holding costs: insurance ($100-$200/mo), taxes ($150-$400/mo), utilities ($150-$250/mo), hard money interest

**The 70% Rule:** Never pay more than 70% of ARV minus estimated repair costs. This is the golden rule.
Formula: Maximum Purchase Price = (ARV × 0.70) - Estimated Repairs

**Selling Costs:** Budget 8-10% of sale price for closing costs + agent commissions on the exit.

## Output Format:

You MUST respond with valid JSON in this exact structure:
{
  "verdict": "STRONG_BUY | BUY | HOLD | PASS | HARD_PASS",
  "verdictEmoji": "🟢 | 🟡 | 🟠 | 🔴 | ⛔",
  "oneLiner": "A single punchy sentence summarizing the opportunity",
  "dealEconomics": {
    "estimatedARV": <number>,
    "maxPurchasePrice70Rule": <number>,
    "estimatedRehabCost": <number>,
    "estimatedRehabScope": "cosmetic | moderate | full_gut | unknown",
    "estimatedHoldingCosts": <number>,
    "estimatedSellingCosts": <number>,
    "estimatedProfit": <number>,
    "returnOnInvestment": <number as percentage>,
    "notes": "Brief explanation of the economics"
  },
  "scLegalConsiderations": {
    "saleType": "foreclosure | tax_sale | unknown",
    "redemptionRisk": "none | low | high",
    "titleRisk": "low | medium | high",
    "estimatedLegalCosts": <number>,
    "notes": "Key legal factors for this specific deal"
  },
  "riskAssessment": {
    "overallRisk": "LOW | MEDIUM | HIGH | VERY_HIGH",
    "factors": ["list", "of", "specific", "risk", "factors"],
    "mitigants": ["list", "of", "things", "that", "reduce", "risk"]
  },
  "recommendation": "A 2-3 sentence paragraph with your honest recommendation. Be specific about what you'd do — bid amount, rehab strategy, exit strategy, timeline."
}

IMPORTANT RULES:
- If ARV data is weak (few comps, wide range), say so and adjust your confidence
- If the property lacks a purchase price, estimate what it might sell for at auction based on the distress type and county assessment
- Use the county MarketProp assessment as a data point but note it often lags actual market value by 10-30%
- Always calculate the 70% rule and compare it to the likely purchase price
- Be conservative with rehab estimates when you don't have interior condition data
- If you don't have enough data to make a call, say HOLD and explain what data is missing`;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: propertyId } = await params;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured" },
        { status: 422 },
      );
    }

    // 1. Load property with comps and any existing analysis
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        comparableSales: { orderBy: { salePrice: "desc" } },
      },
    });

    if (!property) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 },
      );
    }

    // 2. Build the property context for Claude
    const comps = property.comparableSales;
    const arvStats = comps.length > 0 ? calculateARVStats(comps) : null;

    // Extract county data from rawData if available
    const countyData = comps
      .filter((c: any) => c.rawData?.county)
      .map((c: any) => ({
        address: c.address,
        marketProp: c.rawData.county.marketProp,
        marketLand: c.rawData.county.marketLand,
        marketImprv: c.rawData.county.marketImprv,
        acreage: c.rawData.county.acreage,
        landUseCode: c.rawData.county.landUseCode,
      }));

    const propertyContext = JSON.stringify({
      subject: {
        address: `${property.streetAddress}, ${property.city}, ${property.state} ${property.zipCode}`,
        propertyType: property.propertyType,
        county: property.county,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        sqft: property.sqft,
        yearBuilt: property.yearBuilt,
        lotSize: property.lotSizeSqft,
        estimatedValue: property.estimatedValue,
        assessedValue: property.assessedValue,
        mortgageBalance: property.mortgageBalance,
        taxDelinquent: property.taxDelinquent,
        lastSalePrice: property.lastSalePrice,
        lastSaleDate: property.lastSaleDate,
      },
      arvAnalysis: arvStats
        ? {
            median: arvStats.median,
            mean: arvStats.mean,
            low: arvStats.low,
            high: arvStats.high,
            compCount: arvStats.compCount,
            medianPricePerSqft: arvStats.medianPricePerSqft,
          }
        : null,
      comparableSales: comps.slice(0, 10).map((c) => ({
        address: c.address,
        salePrice: c.salePrice,
        saleDate: c.saleDate,
        sqft: c.sqft,
        bedrooms: c.bedrooms,
        bathrooms: c.bathrooms,
        yearBuilt: c.yearBuilt,
        distanceMiles: c.distanceMiles,
        provider: c.provider,
      })),
      countyAssessments: countyData.slice(0, 5),
    }, null, 2);

    // 3. Call Claude API
    logger.info({ propertyId }, "Requesting AI investment analysis");

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Analyze this distressed property investment opportunity:\n\n${propertyContext}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      logger.error(
        { status: response.status, body: errBody },
        "Claude API error",
      );
      return NextResponse.json(
        { error: "AI analysis failed", detail: errBody },
        { status: 502 },
      );
    }

    const claudeResponse = await response.json();
    const rawText =
      claudeResponse.content?.[0]?.text || "";

    // 4. Parse the JSON response from Claude
    let analysis;
    try {
      // Extract JSON from the response (Claude sometimes wraps in markdown)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      logger.error(
        { rawText: rawText.substring(0, 500) },
        "Failed to parse Claude analysis as JSON",
      );
      // Return the raw text if JSON parsing fails
      analysis = {
        verdict: "HOLD",
        verdictEmoji: "🟡",
        oneLiner: "Analysis generated but could not be structured",
        rawAnalysis: rawText,
      };
    }

    // 5. Return the analysis
    return NextResponse.json({
      data: {
        propertyId,
        address: `${property.streetAddress}, ${property.city}, ${property.state} ${property.zipCode}`,
        analysis,
        arvStats,
        compCount: comps.length,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { err: message },
      "GET /api/properties/[id]/analysis failed",
    );
    return NextResponse.json(
      { error: "Internal server error", message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// ARV helpers (duplicated from comps route for independence)
// ---------------------------------------------------------------------------

function calculateARVStats(
  comps: Array<{ salePrice: number; pricePerSqft?: number | null }>,
) {
  if (comps.length === 0) return null;

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
