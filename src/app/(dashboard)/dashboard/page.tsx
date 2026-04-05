"use client";

import { useEffect, useState } from "react";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { PipelineSummary } from "@/components/dashboard/pipeline-summary";
import { RecentOpportunities } from "@/components/dashboard/recent-opportunities";

interface DashboardData {
  totalOpportunities: number;
  totalChange: string;
  hotLeads: number;
  hotLeadsChange: string;
  auctionsThisWeek: number;
  auctionsChange: string;
  newToday: number;
  newTodayChange: string;
  pipeline: Record<string, number>;
  generatedAt: string;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then((json) => {
        if (json.data) setData(json.data);
      })
      .catch((err) => console.error("Failed to load dashboard stats:", err))
      .finally(() => setLoading(false));
  }, []);

  const stats = data
    ? {
        totalOpportunities: { value: data.totalOpportunities, change: data.totalChange },
        hotLeads: { value: data.hotLeads, change: data.hotLeadsChange },
        auctionsThisWeek: { value: data.auctionsThisWeek, change: data.auctionsChange },
        newToday: { value: data.newToday, change: data.newTodayChange },
      }
    : {
        totalOpportunities: { value: 0, change: "Loading..." },
        hotLeads: { value: 0, change: "Loading..." },
        auctionsThisWeek: { value: 0, change: "Loading..." },
        newToday: { value: 0, change: "Loading..." },
      };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Your foreclosure investment pipeline at a glance.
        </p>
      </div>
      <StatsCards stats={stats} />
      <div className="grid gap-6 md:grid-cols-2">
        <PipelineSummary pipeline={data?.pipeline ?? null} />
      </div>
      <RecentOpportunities />
    </div>
  );
}
