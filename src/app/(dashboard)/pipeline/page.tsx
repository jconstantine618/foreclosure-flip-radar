"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MapPin, Clock, DollarSign } from "lucide-react";

// ---------- types ----------
type PipelineStage =
  | "NEW"
  | "REVIEWING"
  | "DRIVE_BY"
  | "UNDERWRITING"
  | "BID_READY"
  | "PASSED"
  | "WON"
  | "DISPOSITION";

interface PipelineCard {
  id: string;
  address: string;
  city: string;
  county: string;
  score: number;
  estimatedValue: number;
  stage: PipelineStage;
  daysInStage: number;
}

// ---------- stage config ----------
const STAGE_CONFIG: Record<
  PipelineStage,
  { label: string; color: string; bgColor: string; borderColor: string }
> = {
  NEW: {
    label: "New",
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  REVIEWING: {
    label: "Reviewing",
    color: "text-purple-700",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
  },
  DRIVE_BY: {
    label: "Drive-By",
    color: "text-indigo-700",
    bgColor: "bg-indigo-50",
    borderColor: "border-indigo-200",
  },
  UNDERWRITING: {
    label: "Underwriting",
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
  },
  BID_READY: {
    label: "Bid Ready",
    color: "text-orange-700",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
  },
  PASSED: {
    label: "Passed",
    color: "text-gray-700",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
  },
  WON: {
    label: "Won",
    color: "text-green-700",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
  },
  DISPOSITION: {
    label: "Disposition",
    color: "text-teal-700",
    bgColor: "bg-teal-50",
    borderColor: "border-teal-200",
  },
};

const STAGES: PipelineStage[] = [
  "NEW",
  "REVIEWING",
  "DRIVE_BY",
  "UNDERWRITING",
  "BID_READY",
  "PASSED",
  "WON",
  "DISPOSITION",
];

// ---------- helpers ----------
function fmt(n: number) {
  return "$" + n.toLocaleString("en-US");
}

function scoreColor(score: number) {
  if (score >= 80) return "bg-green-500/15 text-green-700";
  if (score >= 60) return "bg-amber-500/15 text-amber-700";
  return "bg-red-500/15 text-red-700";
}

// ---------- mock data ----------
const MOCK_PIPELINE: PipelineCard[] = [
  {
    id: "p1",
    address: "104 Maple Creek Dr",
    city: "Greenville",
    county: "Greenville",
    score: 88,
    estimatedValue: 245000,
    stage: "BID_READY",
    daysInStage: 2,
  },
  {
    id: "p2",
    address: "2215 Pelham Rd",
    city: "Greenville",
    county: "Greenville",
    score: 82,
    estimatedValue: 198000,
    stage: "UNDERWRITING",
    daysInStage: 4,
  },
  {
    id: "p3",
    address: "503 Ocean Blvd",
    city: "Myrtle Beach",
    county: "Horry",
    score: 76,
    estimatedValue: 310000,
    stage: "REVIEWING",
    daysInStage: 6,
  },
  {
    id: "p4",
    address: "7801 Kings Hwy",
    city: "Myrtle Beach",
    county: "Horry",
    score: 69,
    estimatedValue: 95000,
    stage: "NEW",
    daysInStage: 1,
  },
  {
    id: "p5",
    address: "628 Laurens Rd",
    city: "Greenville",
    county: "Greenville",
    score: 80,
    estimatedValue: 212000,
    stage: "DRIVE_BY",
    daysInStage: 3,
  },
  {
    id: "p6",
    address: "1500 Hwy 17 S",
    city: "Surfside Beach",
    county: "Horry",
    score: 58,
    estimatedValue: 178000,
    stage: "PASSED",
    daysInStage: 8,
  },
  {
    id: "p7",
    address: "334 N Main St",
    city: "Mauldin",
    county: "Greenville",
    score: 74,
    estimatedValue: 340000,
    stage: "REVIEWING",
    daysInStage: 2,
  },
  {
    id: "p8",
    address: "212 Augusta St",
    city: "Greenville",
    county: "Greenville",
    score: 95,
    estimatedValue: 415000,
    stage: "WON",
    daysInStage: 5,
  },
  {
    id: "p9",
    address: "910 Sea Mountain Hwy",
    city: "North Myrtle Beach",
    county: "Horry",
    score: 63,
    estimatedValue: 72000,
    stage: "NEW",
    daysInStage: 3,
  },
  {
    id: "p10",
    address: "4420 Clemson Blvd",
    city: "Anderson",
    county: "Greenville",
    score: 78,
    estimatedValue: 165000,
    stage: "UNDERWRITING",
    daysInStage: 7,
  },
  {
    id: "p11",
    address: "1822 Woodruff Rd",
    city: "Greenville",
    county: "Greenville",
    score: 91,
    estimatedValue: 289000,
    stage: "DISPOSITION",
    daysInStage: 12,
  },
  {
    id: "p12",
    address: "405 21st Ave N",
    city: "Myrtle Beach",
    county: "Horry",
    score: 72,
    estimatedValue: 225000,
    stage: "DRIVE_BY",
    daysInStage: 1,
  },
];

export default function PipelinePage() {
  const grouped = useMemo(() => {
    const map: Record<PipelineStage, PipelineCard[]> = {
      NEW: [],
      REVIEWING: [],
      DRIVE_BY: [],
      UNDERWRITING: [],
      BID_READY: [],
      PASSED: [],
      WON: [],
      DISPOSITION: [],
    };
    MOCK_PIPELINE.forEach((card) => {
      map[card.stage].push(card);
    });
    return map;
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        description="Track properties through your acquisition workflow. Drag-and-drop coming soon."
      />

      <ScrollArea className="w-full">
        <div className="flex gap-4 pb-4" style={{ minWidth: "1200px" }}>
          {STAGES.map((stage) => {
            const config = STAGE_CONFIG[stage];
            const cards = grouped[stage];
            return (
              <div
                key={stage}
                className={`flex w-[220px] shrink-0 flex-col rounded-lg border ${config.borderColor} ${config.bgColor}`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between p-3 pb-2">
                  <h3 className={`text-sm font-semibold ${config.color}`}>
                    {config.label}
                  </h3>
                  <Badge variant="secondary" className="text-xs">
                    {cards.length}
                  </Badge>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-2 p-2 pt-0">
                  {cards.length === 0 ? (
                    <div className="rounded-md border border-dashed border-gray-300 p-4 text-center text-xs text-muted-foreground">
                      No properties
                    </div>
                  ) : (
                    cards.map((card) => (
                      <Link
                        key={card.id}
                        href={`/opportunities/${card.id}`}
                        className="block"
                      >
                        <Card className="cursor-pointer transition-shadow hover:shadow-md">
                          <CardContent className="p-3">
                            <div className="mb-2 flex items-start justify-between">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                  {card.address}
                                </p>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3" />
                                  {card.city}, {card.county}
                                </div>
                              </div>
                              <Badge
                                className={`ml-2 shrink-0 text-xs ${scoreColor(card.score)}`}
                              >
                                {card.score}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <DollarSign className="h-3 w-3" />
                                {fmt(card.estimatedValue)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {card.daysInStage}d
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Summary */}
      <div className="text-sm text-muted-foreground">
        {MOCK_PIPELINE.length} properties across {STAGES.length} stages
      </div>
    </div>
  );
}
