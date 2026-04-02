import { PageHeader } from "@/components/layout/page-header";
import { StatsCard } from "@/components/layout/stats-card";
import { RecentOpportunities } from "@/components/dashboard/recent-opportunities";
import { NoticesFeed } from "@/components/dashboard/notices-feed";
import { AuctionCalendar } from "@/components/dashboard/auction-calendar";
import { CountiesOverview } from "@/components/dashboard/counties-overview";
import { PipelineSummary } from "@/components/dashboard/pipeline-summary";
import {
  Target,
  Flame,
  Gavel,
  Sparkles,
} from "lucide-react";

// TODO: Replace with real data fetched from API/database
const MOCK_STATS = {
  totalOpportunities: 99,
  totalChange: "+12 from last week",
  hotLeads: 31, // score > 75
  hotLeadsChange: "+5 from last week",
  auctionsThisWeek: 4,
  auctionsChange: "2 more than last week",
  newToday: 6,
  newTodayChange: "+2 from yesterday",
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Dashboard"
        description="Foreclosure Flip Radar - Overview"
      />

      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Opportunities"
          value={MOCK_STATS.totalOpportunities}
          change={MOCK_STATS.totalChange}
          changeType="positive"
          icon={<Target className="h-5 w-5" />}
        />
        <StatsCard
          title="Hot Leads (Score > 75)"
          value={MOCK_STATS.hotLeads}
          change={MOCK_STATS.hotLeadsChange}
          changeType="positive"
          icon={<Flame className="h-5 w-5" />}
        />
        <StatsCard
          title="Auctions This Week"
          value={MOCK_STATS.auctionsThisWeek}
          change={MOCK_STATS.auctionsChange}
          changeType="neutral"
          icon={<Gavel className="h-5 w-5" />}
        />
        <StatsCard
          title="New Today"
          value={MOCK_STATS.newToday}
          change={MOCK_STATS.newTodayChange}
          changeType="positive"
          icon={<Sparkles className="h-5 w-5" />}
        />
      </div>

      {/* Pipeline Summary */}
      <PipelineSummary />

      {/* Two-Column Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column - 2/3 width */}
        <div className="space-y-6 lg:col-span-2">
          <RecentOpportunities />
          <NoticesFeed />
        </div>

        {/* Right Column - 1/3 width */}
        <div className="space-y-6">
          <AuctionCalendar />
          <CountiesOverview />
        </div>
      </div>
    </div>
  );
}
