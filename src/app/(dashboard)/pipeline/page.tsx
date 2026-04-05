"use client";

import { useMemo, useState, useEffect } from "react";
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


export default function PipelinePage() {
  const [cards, setCards] = useState<PipelineCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOpportunities = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(
          "/api/opportunities?limit=100&sort=flipScore&order=desc"
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch opportunities: ${response.status}`);
        }
        const data = await response.json();

        // Map API response to PipelineCard shape
        const mappedCards: PipelineCard[] = (data.data || data || []).map(
          (opp: any) => {
            const daysInStage = Math.floor(
              (Date.now() - new Date(opp.updatedAt).getTime()) / 86400000
            );
            return {
              id: opp.id,
              address: opp.property?.streetAddress || "Unknown",
              city: opp.property?.city || "",
              county: opp.property?.county || "",
              score: opp.flipScore || 0,
              estimatedValue: opp.property?.estimatedValue || 0,
              stage: opp.pipelineStage as PipelineStage,
              daysInStage: Math.max(0, daysInStage),
            };
          }
        );

        setCards(mappedCards);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setCards([]);
      } finally {
        setLoading(false);
      }
    };

    fetchOpportunities();
  }, []);

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
    cards.forEach((card) => {
      map[card.stage].push(card);
    });
    return map;
  }, [cards]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Pipeline"
          description="Track properties through your acquisition workflow. Drag-and-drop coming soon."
        />
        <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-300 p-12 text-muted-foreground">
          Loading opportunities...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Pipeline"
          description="Track properties through your acquisition workflow. Drag-and-drop coming soon."
        />
        <div className="flex items-center justify-center rounded-lg border border-dashed border-red-300 bg-red-50 p-12 text-red-700">
          Error loading opportunities: {error}
        </div>
      </div>
    );
  }

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
        {cards.length} properties across {STAGES.length} stages
      </div>
    </div>
  );
}
