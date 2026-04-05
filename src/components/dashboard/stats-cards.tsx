"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Flame, Gavel, TrendingUp } from "lucide-react";

interface StatItem {
  value: number;
  change: string;
}

interface StatsCardsProps {
  stats: {
    totalOpportunities: StatItem;
    hotLeads: StatItem;
    auctionsThisWeek: StatItem;
    newToday: StatItem;
  };
}

const STAT_CONFIG = [
  { key: "totalOpportunities" as const, label: "Total Opportunities", icon: Building2 },
  { key: "hotLeads" as const, label: "Hot Leads", icon: Flame },
  { key: "auctionsThisWeek" as const, label: "Auctions This Week", icon: Gavel },
  { key: "newToday" as const, label: "New Today", icon: TrendingUp },
];

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {STAT_CONFIG.map(({ key, label, icon: Icon }) => {
        const stat = stats[key];
        return (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.change}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
