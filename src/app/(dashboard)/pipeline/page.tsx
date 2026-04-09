"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Clock, DollarSign, GripVertical } from "lucide-react";

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
  { label: string; color: string; bgColor: string; borderColor: string; dropBg: string }
> = {
  NEW: {
    label: "New", color: "text-blue-700", bgColor: "bg-blue-50",
    borderColor: "border-blue-200", dropBg: "bg-blue-100",
  },
  REVIEWING: {
    label: "Reviewing", color: "text-purple-700", bgColor: "bg-purple-50",
    borderColor: "border-purple-200", dropBg: "bg-purple-100",
  },
  DRIVE_BY: {
    label: "Drive-By", color: "text-indigo-700", bgColor: "bg-indigo-50",
    borderColor: "border-indigo-200", dropBg: "bg-indigo-100",
  },
  UNDERWRITING: {
    label: "Underwriting", color: "text-amber-700", bgColor: "bg-amber-50",
    borderColor: "border-amber-200", dropBg: "bg-amber-100",
  },
  BID_READY: {
    label: "Bid Ready", color: "text-orange-700", bgColor: "bg-orange-50",
    borderColor: "border-orange-200", dropBg: "bg-orange-100",
  },
  PASSED: {
    label: "Passed", color: "text-gray-700", bgColor: "bg-gray-50",
    borderColor: "border-gray-200", dropBg: "bg-gray-100",
  },
  WON: {
    label: "Won", color: "text-green-700", bgColor: "bg-green-50",
    borderColor: "border-green-200", dropBg: "bg-green-100",
  },
  DISPOSITION: {
    label: "Disposition", color: "text-teal-700", bgColor: "bg-teal-50",
    borderColor: "border-teal-200", dropBg: "bg-teal-100",
  },
};

const STAGES: PipelineStage[] = [
  "NEW", "REVIEWING", "DRIVE_BY", "UNDERWRITING",
  "BID_READY", "PASSED", "WON", "DISPOSITION",
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

// ---------- API helper ----------
async function updatePipelineStage(id: string, stage: PipelineStage): Promise<boolean> {
  try {
    const res = await fetch(`/api/opportunities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipelineStage: stage }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default function PipelinePage() {
  const [cards, setCards] = useState<PipelineCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedCard, setDraggedCard] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null);
  const [savingCard, setSavingCard] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    const fetchOpportunities = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(
          "/api/opportunities?limit=100&sort=flipScore&order=desc"
        );
        if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
        const data = await response.json();

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
      NEW: [], REVIEWING: [], DRIVE_BY: [], UNDERWRITING: [],
      BID_READY: [], PASSED: [], WON: [], DISPOSITION: [],
    };
    cards.forEach((c) => map[c.stage].push(c));
    return map;
  }, [cards]);

  // ---- Drag handlers ----
  const handleDragStart = useCallback((e: React.DragEvent, cardId: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", cardId);
    setDraggedCard(cardId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedCard(null);
    setDragOverStage(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, stage: PipelineStage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving the column (not entering a child)
    const related = e.relatedTarget as HTMLElement | null;
    if (!related || !e.currentTarget.contains(related)) {
      setDragOverStage(null);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetStage: PipelineStage) => {
    e.preventDefault();
    setDragOverStage(null);
    const cardId = e.dataTransfer.getData("text/plain");
    if (!cardId) return;

    const card = cards.find((c) => c.id === cardId);
    if (!card || card.stage === targetStage) {
      setDraggedCard(null);
      return;
    }

    const fromLabel = STAGE_CONFIG[card.stage].label;
    const toLabel = STAGE_CONFIG[targetStage].label;

    // Optimistic update
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, stage: targetStage, daysInStage: 0 } : c))
    );
    setDraggedCard(null);
    setSavingCard(cardId);

    const ok = await updatePipelineStage(cardId, targetStage);
    setSavingCard(null);

    if (ok) {
      setToast({ message: `${card.address} → ${toLabel}`, type: "success" });
    } else {
      // Revert on failure
      setCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, stage: card.stage, daysInStage: card.daysInStage } : c))
      );
      setToast({ message: `Failed to move ${card.address}`, type: "error" });
    }
  }, [cards]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Pipeline" description="Track properties through your acquisition workflow." />
        <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-300 p-12 text-muted-foreground">
          Loading opportunities...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Pipeline" description="Track properties through your acquisition workflow." />
        <div className="flex items-center justify-center rounded-lg border border-dashed border-red-300 bg-red-50 p-12 text-red-700">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Pipeline" description="Drag cards between columns to move properties through your workflow." />

      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-3 shadow-lg text-sm font-medium transition-all ${
          toast.type === "success"
            ? "bg-green-600 text-white"
            : "bg-red-600 text-white"
        }`}>
          {toast.message}
        </div>
      )}

      <div className="w-full overflow-x-auto">
        <div className="flex gap-4 pb-4" style={{ minWidth: "1860px" }}>
          {STAGES.map((stage) => {
            const config = STAGE_CONFIG[stage];
            const stageCards = grouped[stage];
            const isDropTarget = dragOverStage === stage;
            const isDragging = draggedCard !== null;

            return (
              <div
                key={stage}
                onDragOver={(e) => handleDragOver(e, stage)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage)}
                className={`flex w-[220px] shrink-0 flex-col rounded-lg border-2 transition-all duration-150 ${
                  isDropTarget
                    ? `${config.borderColor} ${config.dropBg} ring-2 ring-offset-1 ring-blue-400 scale-[1.02]`
                    : isDragging
                      ? `${config.borderColor} ${config.bgColor} border-dashed`
                      : `${config.borderColor} ${config.bgColor}`
                }`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between p-3 pb-2">
                  <h3 className={`text-sm font-semibold ${config.color}`}>
                    {config.label}
                  </h3>
                  <Badge variant="secondary" className="text-xs">
                    {stageCards.length}
                  </Badge>
                </div>

                {/* Cards */}
                <div className="flex min-h-[120px] flex-col gap-2 p-2 pt-0">
                  {stageCards.length === 0 ? (
                    <div className={`flex-1 rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground ${
                      isDropTarget ? "border-blue-400 bg-blue-50/50" : "border-gray-300"
                    }`}>
                      {isDropTarget ? "Drop here" : "No properties"}
                    </div>
                  ) : (
                    stageCards.map((card) => {
                      const isBeingDragged = draggedCard === card.id;
                      const isSaving = savingCard === card.id;
                      return (
                        <div
                          key={card.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, card.id)}
                          onDragEnd={handleDragEnd}
                          className={`group relative transition-all duration-150 ${
                            isBeingDragged ? "opacity-40 scale-95" : ""
                          } ${isSaving ? "opacity-70" : ""}`}
                        >
                          <Card className={`cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md ${
                            isSaving ? "ring-2 ring-blue-300" : ""
                          }`}>
                            <CardContent className="p-3">
                              {/* Drag handle indicator */}
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-40 transition-opacity">
                                <GripVertical className="h-4 w-4 text-gray-400" />
                              </div>

                              <div className="mb-2 flex items-start justify-between">
                                <div className="min-w-0 flex-1">
                                  <Link href={`/opportunities/${card.id}`} className="hover:underline"
                                    onClick={(e) => e.stopPropagation()}>
                                    <p className="truncate text-sm font-medium">
                                      {card.address}
                                    </p>
                                  </Link>
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <MapPin className="h-3 w-3" />
                                    {card.city}, {card.county}
                                  </div>
                                </div>
                                <Badge className={`ml-2 shrink-0 text-xs ${scoreColor(card.score)}`}>
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
                              {isSaving && (
                                <div className="mt-1 text-[10px] text-blue-500 font-medium">Saving...</div>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      <div className="text-sm text-muted-foreground">
        {cards.length} properties across {STAGES.length} stages
      </div>
    </div>
  );
}
