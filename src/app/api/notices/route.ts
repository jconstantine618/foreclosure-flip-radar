import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/notices — List CountyNotice records with optional filters
 *
 * Query params:
 *   county   - filter by county name
 *   type     - filter by noticeType (e.g. MASTER_IN_EQUITY)
 *   matched  - "true" to only include notices linked to a property
 *   limit    - max results (default 200)
 *   offset   - pagination offset
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const county = searchParams.get("county") || undefined;
    const noticeType = searchParams.get("type") || undefined;
    const matchedOnly = searchParams.get("matched") === "true";
    const limit = Math.min(Number(searchParams.get("limit") || 200), 500);
    const offset = Number(searchParams.get("offset") || 0);

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (county) where.county = county;
    if (noticeType) where.noticeType = noticeType;
    if (matchedOnly) where.propertyId = { not: null };

    const [notices, total] = await Promise.all([
      prisma.countyNotice.findMany({
        where,
        orderBy: { saleDate: "asc" },
        take: limit,
        skip: offset,
        include: {
          property: {
            select: {
              id: true,
              streetAddress: true,
              city: true,
              county: true,
              state: true,
              zipCode: true,
              estimatedValue: true,
            },
          },
        },
      }),
      prisma.countyNotice.count({ where }),
    ]);

    // Find the opportunity ID for each matched property so we can link to detail pages
    const propertyIds = notices
      .map((n) => n.propertyId)
      .filter((id): id is string => id !== null);

    const opportunities =
      propertyIds.length > 0
        ? await prisma.opportunity.findMany({
            where: { propertyId: { in: propertyIds } },
            select: { id: true, propertyId: true, flipScore: true },
          })
        : [];

    const oppByPropertyId = new Map(
      opportunities.map((o) => [o.propertyId, o])
    );

    const data = notices.map((n) => {
      const opp = n.propertyId ? oppByPropertyId.get(n.propertyId) : null;
      return {
        id: n.id,
        county: n.county,
        noticeType: n.noticeType,
        caseNumber: n.caseNumber,
        address: n.address,
        plaintiff: n.plaintiff,
        defendant: n.defendant,
        saleDate: n.saleDate?.toISOString().split("T")[0] ?? null,
        sourceUrl: n.sourceUrl,
        matchedPropertyId: n.propertyId,
        opportunityId: opp?.id ?? null,
        flipScore: opp?.flipScore ?? null,
        property: n.property,
        createdAt: n.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ data, total, limit, offset });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/notices]", message);
    return NextResponse.json(
      { error: "Internal server error", message },
      { status: 500 }
    );
  }
}
