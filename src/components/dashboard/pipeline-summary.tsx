"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowRight, GitBranch } from "lucide-react";

// TODO: Replace with real pipeline counts from API/database
interface PipelineStage {
  key: string;
  label: string;
  count: number;
  color: string;
}

const MOCK_PIPELINE: PipelineStage[] = [
  { key: "NEW", label: "NEW", count: 23, color: "bg-blue-500/15 text-blue-700" },
  { key: "REVIEWING", label: "REVIEWING", count: 12, color: "bg-indigo-500/15 text-indigo-700" },
  { key: "DRIVE_BY", label: "DRIVE BY", count: 7, color: "bg-violet-500/15 text-violet-700" },
  { key: "UNDERWRITING", label: "UNDERWRITING", count: 5, color: "bg-purple-500/15 text-purple-700" },
  { key: "BID_READY", label: "BID READY", count: 3, color: "bg-amber-500/15 text-amber-700" },
  { key: "WON", label: "WON", count: 1, color: "bg-green-500/15 text-green-700" },
];

export function PipelineSummary() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <GitBranch className="h-5 w-5" />
          Pipeline Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          {MOCK_PIPELINE.map((stage) => (
            <div
              key={stage.key}
              className="flex items-center gap-2 rounded-lg border px-3 py-2"
            >
              <Badge className={stage.color} variant="outline">
                {stage.label}
              </Badge>
              <span className="text-lg font-bold">{stage.count}</span>
            </div>
          ))}
        </div>

        {/* Horizontal bar visualization */}
        <div className="mt-4 flex h-4 w-full overflow-hidden rounded-full">
          {MOCK_PIPELINE.map((stage) => {
            const total = MOCK_PIPELINE.reduce((s, p) => s + p.count, 0);
            const widthPct = (stage.count / total) * 100;
            const bgColors: Record<string, string> = {
              NEW: "bg-blue-500",
              REVIEWING: "bg-indigo-500",
              DRIVE_BY: "bg-violet-500",
              UNDERWRITING: "bg-purple-500",
              BID_READY: "bg-amber-500",
              WON: "bg-green-500",
            };
            return (
              <div
                key={stage.key}
                className={`${bgColors[stage.key] ?? "bg-gray-400"} h-full`}
                style={{ width: `${widthPct}%` }}
                title={`${stage.label}: ${stage.count}`}
              />
            );
          })}
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="link" asChild className="ml-auto">
          <Link href="/pipeline">
            View Pipeline <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
