"use client";

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

// TODO: Replace with real data from API/database
interface CountyHealth {
  name: string;
  activeOpportunities: number;
  lastSyncTime: string;
  adapterHealthy: boolean;
}

const MOCK_COUNTIES: CountyHealth[] = [
  {
    name: "Greenville",
    activeOpportunities: 34,
    lastSyncTime: "2026-04-01T08:15:00Z",
    adapterHealthy: true,
  },
  {
    name: "Horry",
    activeOpportunities: 47,
    lastSyncTime: "2026-04-01T07:45:00Z",
    adapterHealthy: true,
  },
  {
    name: "Georgetown",
    activeOpportunities: 18,
    lastSyncTime: "2026-03-31T22:30:00Z",
    adapterHealthy: false,
  },
];

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
          {MOCK_COUNTIES.map((county) => (
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
          ))}
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
