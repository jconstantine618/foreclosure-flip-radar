import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

    const totalOpportunities = await prisma.property.count();
    const lastWeekTotal = await prisma.property.count({
      where: { createdAt: { lt: weekAgo } },
    });
    const totalChange = totalOpportunities - lastWeekTotal;

    const hotLeads = await prisma.property.count({
      where: { flipScore: { gt: 75 } },
    });
    const lastWeekHotLeads = await prisma.property.count({
      where: { flipScore: { gt: 75 }, createdAt: { lt: weekAgo } },
    });
    const hotLeadsChange = hotLeads - lastWeekHotLeads;

    const newToday = await prisma.property.count({
      where: { createdAt: { gte: todayStart } },
    });
    const newYesterday = await prisma.property.count({
      where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
    });
    const newTodayChange = newToday - newYesterday;

    const pipelineCounts = await prisma.property.groupBy({
      by: ["pipelineStage"],
      _count: { id: true },
    });

    const pipeline: Record<string, number> = {
      NEW: 0, REVIEWING: 0, DRIVE_BY: 0, UNDERWRITING: 0,
      BID_READY: 0, PASSED: 0, WON: 0, DISPOSITION: 0,
    };
    for (const row of pipelineCounts) {
      pipeline[row.pipelineStage] = row._count.id;
    }

    return NextResponse.json({
      data: {
        totalOpportunities,
        totalChange: totalChange >= 0 ? `+${totalChange} from last week` : `${totalChange} from last week`,
        hotLeads,
        hotLeadsChange: hotLeadsChange >= 0 ? `+${hotLeadsChange} from last week` : `${hotLeadsChange} from last week`,
        auctionsThisWeek: 0,
        auctionsChange: "\u2014",
        newToday,
        newTodayChange: newTodayChange >= 0 ? `+${newTodayChange} from yesterday` : `${newTodayChange} from yesterday`,
        pipeline,
        generatedAt: now.toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats", message },
      { status: 500 }
    );
  }
}
