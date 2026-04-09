// ---------------------------------------------------------------------------
// POST /api/notices/scrape — Scrape MIE foreclosure sales from all 3 counties,
// match entries to existing properties, create CountyNotice records, and
// update Opportunity distress stages + auction dates.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  scrapeAllCounties,
  type MIESaleEntry,
  type ScrapeAllResult,
} from "@/lib/providers/county/mie-scraper";
import { IngestionService } from "@/lib/services/ingestion";
import type { NormalizedNotice } from "@/types";
import type { ProviderName } from "@prisma/client";

export const maxDuration = 300;

interface ScrapeResult {
  county: string;
  scraped: number;
  ingested: number;
  matched: number;
  errors: string[];
}

/**
 * Map county name to the Prisma ProviderName enum.
 */
function countyToProvider(county: string): ProviderName {
  const upper = county.toUpperCase();
  if (upper === "GREENVILLE") return "GREENVILLE_MIE";
  if (upper === "HORRY") return "HORRY_MIE";
  // Georgetown doesn't have a dedicated enum value — use SC_PUBLIC_NOTICES
  return "SC_PUBLIC_NOTICES";
}

/**
 * Convert an MIESaleEntry from the scraper into a NormalizedNotice
 * that the IngestionService can process.
 */
function saleEntryToNotice(entry: MIESaleEntry): NormalizedNotice {
  return {
    county: entry.county,
    state: entry.state,
    noticeType: "MASTER_IN_EQUITY",
    caseNumber: entry.caseNumber || null,
    address: entry.address || null,
    borrowerName: entry.defendant,
    lenderName: entry.plaintiff,
    lawFirm: entry.lawFirm,
    auctionDate: entry.saleDate,
    documentUrl: entry.sourceUrl,
    rawData: {
      ...entry,
      scrapedAt: new Date().toISOString(),
    },
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json().catch(() => ({}));
    const targetCounty: string | undefined = body.county;

    console.log(`[Notices/Scrape] Starting MIE scrape${targetCounty ? ` for ${targetCounty}` : " for all counties"}`);

    // 1. Create a sync job record
    const syncJob = await prisma.providerSyncJob.create({
      data: {
        provider: targetCounty ? countyToProvider(targetCounty) : "SC_PUBLIC_NOTICES",
        county: targetCounty ?? "ALL",
        status: "RUNNING",
        startedAt: new Date(),
      },
    });

    // 2. Scrape all counties (or filter to target)
    let scrapeResults: ScrapeAllResult[];
    if (targetCounty) {
      // Import individual scrapers for targeted scrape
      const { scrapeGreenvilleSales, getGreenvilleSaleDates, scrapeHorrySales, scrapeGeorgetownSales } =
        await import("@/lib/providers/county/mie-scraper");

      const upper = targetCounty.toUpperCase();
      if (upper === "GREENVILLE") {
        const dates = await getGreenvilleSaleDates();
        const entries: MIESaleEntry[] = [];
        for (const d of dates.slice(0, 3)) {
          entries.push(...(await scrapeGreenvilleSales(d)));
        }
        scrapeResults = [{ county: "Greenville", entries }];
      } else if (upper === "HORRY") {
        const entries = await scrapeHorrySales();
        scrapeResults = [{ county: "Horry", entries }];
      } else if (upper === "GEORGETOWN") {
        const entries = await scrapeGeorgetownSales();
        scrapeResults = [{ county: "Georgetown", entries }];
      } else {
        return NextResponse.json(
          { error: `Unknown county: ${targetCounty}` },
          { status: 400 }
        );
      }
    } else {
      scrapeResults = await scrapeAllCounties();
    }

    // 3. Process scraped entries through IngestionService
    const ingestionService = new IngestionService();
    const results: ScrapeResult[] = [];
    let totalScraped = 0;
    let totalIngested = 0;
    let totalMatched = 0;

    for (const countyResult of scrapeResults) {
      const result: ScrapeResult = {
        county: countyResult.county,
        scraped: countyResult.entries.length,
        ingested: 0,
        matched: 0,
        errors: [],
      };

      if (countyResult.error) {
        result.errors.push(`Scrape error: ${countyResult.error}`);
      }

      const provider = countyToProvider(countyResult.county);

      for (const entry of countyResult.entries) {
        try {
          const notice = saleEntryToNotice(entry);
          await ingestionService.ingestNotice(notice, provider);
          result.ingested++;

          // Check if it was matched to a property
          // (we can check by looking at the most recent CountyNotice)
          if (entry.caseNumber) {
            const cn = await prisma.countyNotice.findFirst({
              where: {
                county: entry.county,
                caseNumber: entry.caseNumber,
                propertyId: { not: null },
              },
            });
            if (cn) result.matched++;
          }

        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result.errors.push(`${entry.caseNumber ?? entry.address}: ${msg}`);
          console.warn(`[Notices/Scrape] Failed to ingest ${entry.caseNumber}:`, msg);
        }

        // Small delay between ingestions
        await new Promise((r) => setTimeout(r, 50));
      }

      totalScraped += result.scraped;
      totalIngested += result.ingested;
      totalMatched += result.matched;
      results.push(result);
    }

    // 4. Update sync job with results
    const duration = Date.now() - startTime;
    await prisma.providerSyncJob.update({
      where: { id: syncJob.id },
      data: {
        status: "COMPLETED",
        recordsFound: totalScraped,
        recordsProcessed: totalIngested,
        completedAt: new Date(),
        duration,
        errors: results.flatMap((r) => r.errors).length > 0
          ? results.flatMap((r) => r.errors) as unknown as any
          : undefined,
      },
    });

    // 5. Also do a direct update pass: for any CountyNotice with a propertyId
    // and saleDate, ensure the linked Opportunity has AUCTION distress stage
    // and the auction date set. This catches cases where ingestNotice matched
    // but the distress stage wasn't updated (belt-and-suspenders).
    const noticesWithProperties = await prisma.countyNotice.findMany({
      where: {
        propertyId: { not: null },
        saleDate: { not: null },
        noticeType: "MASTER_IN_EQUITY",
      },
      select: {
        propertyId: true,
        saleDate: true,
        caseNumber: true,
      },
    });

    let directUpdates = 0;
    for (const cn of noticesWithProperties) {
      if (!cn.propertyId || !cn.saleDate) continue;

      const daysUntilSale = Math.max(
        0,
        Math.ceil((cn.saleDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      );

      await prisma.opportunity.updateMany({
        where: { propertyId: cn.propertyId },
        data: {
          distressStage: "AUCTION",
          auctionDate: cn.saleDate,
          daysUntilSale,
        },
      });
      directUpdates++;
    }

    console.log(`[Notices/Scrape] Complete — scraped: ${totalScraped}, ingested: ${totalIngested}, matched: ${totalMatched}, directUpdates: ${directUpdates}, duration: ${duration}ms`);

    return NextResponse.json({
      data: {
        syncJobId: syncJob.id,
        duration,
        totalScraped,
        totalIngested,
        totalMatched,
        directUpdates,
        counties: results,
      },
    });
  } catch (err) {
    console.error("[Notices/Scrape] Fatal error:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}

// GET handler for easy testing from browser
export async function GET() {
  // Return current state of county notices and upcoming auctions
  const [noticeCount, auctionCount, upcomingAuctions] = await Promise.all([
    prisma.countyNotice.count(),
    prisma.opportunity.count({
      where: { auctionDate: { not: null } },
    }),
    prisma.opportunity.findMany({
      where: {
        auctionDate: { gte: new Date() },
        isActive: true,
      },
      select: {
        id: true,
        distressStage: true,
        auctionDate: true,
        daysUntilSale: true,
        flipScore: true,
        property: {
          select: {
            streetAddress: true,
            city: true,
            county: true,
          },
        },
      },
      orderBy: { auctionDate: "asc" },
      take: 25,
    }),
  ]);

  return NextResponse.json({
    data: {
      totalNotices: noticeCount,
      opportunitiesWithAuction: auctionCount,
      upcomingAuctions: upcomingAuctions.map((a) => ({
        id: a.id,
        address: a.property.streetAddress,
        city: a.property.city,
        county: a.property.county,
        distressStage: a.distressStage,
        auctionDate: a.auctionDate,
        daysUntilSale: a.daysUntilSale,
        flipScore: a.flipScore,
      })),
    },
  });
}
