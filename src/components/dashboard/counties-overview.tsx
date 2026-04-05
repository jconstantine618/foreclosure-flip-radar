"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowRight, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface CountyHealth {
  name: string;
  activeOpportunities: number;
  lastSyncTime: string;
  adapterHealthy: boolean;
}

interface Opportunity {
  id: string;
  property: {
    county: string;
  };
  updatedAt: string;
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function CountiesOverview() {
  const [counties, setCounties] = useState<CountyHealth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCounties = async () => {
      try {
        const response = await fetch("/api/opportunities?limit=100");
        if (!response.ok) throw new Error("Failed to fetch opportunities");

        const data = await response.json();
        const opportunities = data.data || [];

        // Group by county
        const countyMap = new Map<string, { count: number; latestDate: string }>();

        opportunities.forEach((opp: Opportunity) => {
          const county = opp.property.county;
          if (!county) return;

          const existing = countyMap.get(county) || { count: 0, latestDate: "" };
          existing.count++;

          // Keep the most recent updatedAt
          if (!existing.latestDate || new Date(opp.updatedAt) > new Date(existing.latestDate)) {
            existing.latestDate = opp.updatedAt;
          }

          countyMap.set(county, existing);
        });

        // Convert to CountyHealth array
        const countyArray = Array.from(countyMap.entries()).map(([name, data]) => ({
          name,
          activeOpportunities: data.count,
          lastSyncTime: data.latestDate,
          adapterHealthy: true,
        }));

        setCounties(countyArray);
      } catch (error) {
        console.error("Error fetching counties:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCounties();
  }, []);

  const displayCounties = counties.length > 0 ? counties : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPin className="h-5 w-5" />
          Counties Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {loading ? (
            <li className="text-sm text-muted-foreground">Loading counties...</li>
          ) : displayCounties.length === 0 ? (
            <li className="text-sm text-muted-foreground">No opportunities found</li>
          ) : (
            displayCounties.map((county) => (
            <li
              key={county.name}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div>
                <p className="text-sm font-semibold">{county.name} County</p>
                <p className="text-xs text-muted-foreground">
                  {county.activeOpportunities} active opportunities
                </p>
                <p className="text-xs text-muted-foreground">
                  Last sync: {formatRelativeTime(county.lastSyncTime)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-block h-3 w-3 rounded-full",
                    county.adapterHealthy ? "bg-green-500" : "bg-red-500"
                  )}
                  title={
                    county.adapterHealthy
                      ? "Adapter healthy"
                      : "Adapter unhealthy"
                  }
                />
                <span className="text-xs text-muted-foreground">
                  {county.adapterHealthy ? "Healthy" : "Error"}
                </span>
              </div>
            </li>
            ))
          )}
        </ul>
      </CardContent>
      <CardFooter>
        <Button variant="link" asChild className="ml-auto">
          <Link href="/admin">
            Admin Details <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
