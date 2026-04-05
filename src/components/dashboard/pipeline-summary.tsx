"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  NEW: { label: "New", color: "bg-blue-500" },
  REVIEWING: { label: "Reviewing", color: "bg-yellow-500" },
  DRIVE_BY: { label: "Drive-By", color: "bg-orange-500" },
  UNDERWRITING: { label: "Underwriting", color: "bg-purple-500" },
  BID_READY: { label: "Bid Ready", color: "bg-green-500" },
  PASSED: { label: "Passed", color: "bg-gray-400" },
  WON: { label: "Won", color: "bg-emerald-600" },
  DISPOSITION: { label: "Disposition", color: "bg-teal-500" },
};

interface PipelineSummaryProps {
  pipeline: Record<string, number> | null;
}

export function PipelineSummary({ pipeline }: PipelineSummaryProps) {
  const stages = pipeline
    ? Object.entries(STAGE_LABELS).map(([key, meta]) => ({
        stage: key,
        label: meta.label,
        count: pipeline[key] ?? 0,
        color: meta.color,
      }))
    : Object.entries(STAGE_LABELS).map(([key, meta]) => ({
        stage: key,
        label: meta.label,
        count: 0,
        color: meta.color,
      }));

  const total = stages.reduce((sum, s) => sum + s.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline Summary</CardTitle>
        <CardDescription>Properties by stage ({total} total)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {stages.map((stage) => (
            <div key={stage.stage} className="flex items-center gap-3">
              <div className="w-24 text-sm font-medium">{stage.label}</div>
              <div className="flex-1">
                <div className="h-6 w-full rounded-full bg-muted overflow-hidden">
                  {total > 0 && stage.count > 0 && (
                    <div
                      className={`h-full rounded-full ${stage.color}`}
                      style={{ width: `${(stage.count / total) * 100}%` }}
                    />
                  )}
                </div>
              </div>
              <div className="w-8 text-right text-sm font-semibold">
                {stage.count}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
