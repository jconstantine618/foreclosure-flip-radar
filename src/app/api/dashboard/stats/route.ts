import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

    // Total active opportunities
    const totalOpportunities = await prisma.opportunity.count({
      where: { isActive: true },
    });
    const lastWeekTotal = await prisma.opportunity.count({
      where: { isActive: true, createdAt: { lt: weekAgo } },
    });
    const totalChange = totalOpportunities - lastWeekTotal;

    // Hot leads: flipScore > 75
    const hotLeads = await prisma.opportunity.count({
      where: { isActive: true, flipScore: { gt: 75 } },
    });
    const lastWeekHotLeads = await prisma.opportunity.count({
      where: { isActive: true, flipScore: { gt: 75 }, createdAt: { lt: weekAgo } },
    });
    const hotLeadsChange = hotLeads - lastWeekHotLeads;

    // New today
    const newToday = await prisma.opportunity.count({
      where: { createdAt: { gte: todayStart } },
    });
    const newYesterday = await prisma.opportunity.count({
      where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
    });
    const newTodayChange = newToday - newYesterday;

    // Pipeline breakdown by stage
    const pipelineCounts = await prisma.opportunity.groupBy({
      by: ["pipelineStage"],
      where: { isActive: true },
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
