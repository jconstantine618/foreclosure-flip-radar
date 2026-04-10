"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Clock, DollarSign, GripVertical, Filter, X, Search, SlidersHorizontal } from "lucide-react";

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

interface Filters {
  search: string;
  county: string;
  minScore: string;
  minValue: string;
  maxValue: string;
  maxAge: string;
  sortBy: "score" | "value" | "age" | "address";
}

const DEFAULT_FILTERS: Filters = {
  search: "",
  county: "",
  minScore: "",
  minValue: "",
  maxValue: "",
  maxAge: "",
  sortBy: "score",
};

// ---------- stage config ----------
const STAGE_CONFIG: Record<
  PipelineStage,
  { label: string; color: string; bgColor: string; borderColor: string; dropBg: string }
> = {
  NEW: { label: "New", color: "text-blue-700", bgColor: "bg-blue-50", borderColor: "border-blue-200", dropBg: "bg-blue-100" },
  REVIEWING: { label: "Reviewing", color: "text-purple-700", bgColor: "bg-purple-50", borderColor: "border-purple-200", dropBg: "bg-purple-100" },
  DRIVE_BY: { label: "Drive-By", color: "text-indigo-700", bgColor: "bg-indigo-50", borderColor: "border-indigo-200", dropBg: "bg-indigo-100" },
  UNDERWRITING: { label: "Underwriting", color: "text-amber-700", bgColor: "bg-amber-50", borderColor: "border-amber-200", dropBg: "bg-amber-100" },
  BID_READY: { label: "Bid Ready", color: "text-orange-700", bgColor: "bg-orange-50", borderColor: "border-orange-200", dropBg: "bg-orange-100" },
  PASSED: { label: "Passed", color: "text-gray-700", bgColor: "bg-gray-50", borderColor: "border-gray-200", dropBg: "bg-gray-100" },
  WON: { label: "Won", color: "text-green-700", bgColor: "bg-green-50", borderColor: "border-green-200", dropBg: "bg-green-100" },
  DISPOSITION: { label: "Disposition", color: "text-teal-700", bgColor: "bg-teal-50", borderColor: "border-teal-200", dropBg: "bg-teal-100" },
};

const STAGES: PipelineStage[] = ["NEW", "PASSED", "REVIEWING", "DRIVE_BY", "UNDERWRITING", "BID_READY", "WON", "DISPOSITION"];

// ---------- helpers ----------
function fmt(n: number) { return "$" + n.toLocaleString("en-US"); }

function scoreColor(score: number) {
  if (score >= 80) return "bg-green-500/15 text-green-700";
  if (score >= 60) return "bg-amber-500/15 text-amber-700";
  return "bg-red-500/15 text-red-700";
}

async function updatePipelineStage(id: string, stage: PipelineStage): Promise<boolean> {
  try {
    const res = await fetch(`/api/opportunities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipelineStage: stage }),
    });
    return res.ok;
  } catch { return false; }
}

export default function PipelinePage() {
  const [cards, setCards] = useState<PipelineCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedCard, setDraggedCard] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null);
  const [savingCard, setSavingCard] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  useEffect(() => {
    const fetchOpportunities = async () => {
      try {
        setLoading(true); setError(null);
        const response = await fetch("/api/opportunities?limit=100&sort=flipScore&order=desc");
        if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
        const data = await response.json();
        const mappedCards: PipelineCard[] = (data.data || data || []).map((opp: any) => {
          const daysInStage = Math.floor((Date.now() - new Date(opp.updatedAt).getTime()) / 86400000);
          return {
            id: opp.id, address: opp.property?.streetAddress || "Unknown",
            city: opp.property?.city || "", county: opp.property?.county || "",
            score: opp.flipScore || 0, estimatedValue: opp.property?.estimatedValue || 0,
            stage: opp.pipelineStage as PipelineStage, daysInStage: Math.max(0, daysInStage),
          };
        });
        setCards(mappedCards);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error"); setCards([]);
      } finally { setLoading(false); }
    };
    fetchOpportunities();
  }, []);

  // Unique counties for dropdown
  const counties = useMemo(() => {
    const set = new Set(cards.map((c) => c.county).filter(Boolean));
    return Array.from(set).sort();
  }, [cards]);

  // Apply filters
  const filteredCards = useMemo(() => {
    return cards.filter((c) => {
      if (filters.search && !c.address.toLowerCase().includes(filters.search.toLowerCase()) &&
          !c.city.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.county && c.county !== filters.county) return false;
      if (filters.minScore && c.score < Number(filters.minScore)) return false;
      if (filters.minValue && c.estimatedValue < Number(filters.minValue)) return false;
      if (filters.maxValue && c.estimatedValue > Number(filters.maxValue)) return false;
      if (filters.maxAge && c.daysInStage > Number(filters.maxAge)) return false;
      return true;
    });
  }, [cards, filters]);

  // Sort within each stage
  const sortedCards = useMemo(() => {
    const sorted = [...filteredCards];
    sorted.sort((a, b) => {
      switch (filters.sortBy) {
        case "score": return b.score - a.score;
        case "value": return b.estimatedValue - a.estimatedValue;
        case "age": return b.daysInStage - a.daysInStage;
        case "address": return a.address.localeCompare(b.address);
        default: return 0;
      }
    });
    return sorted;
  }, [filteredCards, filters.sortBy]);

  // Group by stage
  const grouped = useMemo(() => {
    const map: Record<PipelineStage, PipelineCard[]> = {
      NEW: [], REVIEWING: [], DRIVE_BY: [], UNDERWRITING: [],
      BID_READY: [], PASSED: [], WON: [], DISPOSITION: [],
    };
    sortedCards.forEach((c) => map[c.stage].push(c));
    return map;
  }, [sortedCards]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.county) count++;
    if (filters.minScore) count++;
    if (filters.minValue) count++;
    if (filters.maxValue) count++;
    if (filters.maxAge) count++;
    return count;
  }, [filters]);

  // ---- Drag handlers ----
  const handleDragStart = useCallback((e: React.DragEvent, cardId: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", cardId);
    setDraggedCard(cardId);
  }, []);

  const handleDragEnd = useCallback(() => { setDraggedCard(null); setDragOverStage(null); }, []);

  const handleDragOver = useCallback((e: React.DragEvent, stage: PipelineStage) => {
    e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverStage(stage);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as HTMLElement | null;
    if (!related || !e.currentTarget.contains(related)) setDragOverStage(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetStage: PipelineStage) => {
    e.preventDefault(); setDragOverStage(null);
    const cardId = e.dataTransfer.getData("text/plain");
    if (!cardId) return;
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.stage === targetStage) { setDraggedCard(null); return; }
    const toLabel = STAGE_CONFIG[targetStage].label;
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, stage: targetStage, daysInStage: 0 } : c)));
    setDraggedCard(null); setSavingCard(cardId);
    const ok = await updatePipelineStage(cardId, targetStage);
    setSavingCard(null);
    if (ok) { setToast({ message: `${card.address} → ${toLabel}`, type: "success" }); }
    else {
      setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, stage: card.stage, daysInStage: card.daysInStage } : c)));
      setToast({ message: `Failed to move ${card.address}`, type: "error" });
    }
  }, [cards]);

  const updateFilter = (key: keyof Filters, value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const clearFilters = () => setFilters(DEFAULT_FILTERS);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Pipeline" description="Track properties through your acquisition workflow." />
        <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-300 p-12 text-muted-foreground">Loading opportunities...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Pipeline" description="Track properties through your acquisition workflow." />
        <div className="flex items-center justify-center rounded-lg border border-dashed border-red-300 bg-red-50 p-12 text-red-700">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Pipeline" description="Drag cards between columns to move properties through your workflow." />

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-3 shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>{toast.message}</div>
      )}

      {/* Filter bar */}
      <div className="rounded-lg border bg-white p-3 shadow-sm">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input type="text" placeholder="Search address..."
              value={filters.search} onChange={(e) => updateFilter("search", e.target.value)}
              className="h-9 w-full rounded-md border border-gray-200 bg-gray-50 pl-8 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {/* Sort */}
          <select value={filters.sortBy} onChange={(e) => updateFilter("sortBy", e.target.value)}
            className="h-9 rounded-md border border-gray-200 bg-gray-50 px-2 text-sm focus:border-blue-400 focus:outline-none">
            <option value="score">Sort: Score</option>
            <option value="value">Sort: Value</option>
            <option value="age">Sort: Age</option>
            <option value="address">Sort: Address</option>
          </select>

          {/* Toggle advanced filters */}
          <button onClick={() => setShowFilters(!showFilters)}
            className={`flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors ${
              showFilters || activeFilterCount > 0
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}>
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge className="ml-1 h-5 w-5 rounded-full bg-blue-600 p-0 text-[10px] text-white flex items-center justify-center">
                {activeFilterCount}
              </Badge>
            )}
          </button>

          {activeFilterCount > 0 && (
            <button onClick={clearFilters}
              className="flex h-9 items-center gap-1 rounded-md border border-gray-200 px-3 text-sm text-gray-500 hover:bg-gray-50">
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}

          {/* Showing count */}
          <span className="ml-auto text-xs text-muted-foreground">
            {filteredCards.length === cards.length
              ? `${cards.length} properties`
              : `${filteredCards.length} of ${cards.length}`}
          </span>
        </div>

        {/* Expanded filter row */}
        {showFilters && (
          <div className="mt-3 flex flex-wrap items-end gap-3 border-t pt-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">County</label>
              <select value={filters.county} onChange={(e) => updateFilter("county", e.target.value)}
                className="h-9 rounded-md border border-gray-200 bg-gray-50 px-2 text-sm focus:border-blue-400 focus:outline-none">
                <option value="">All Counties</option>
                {counties.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Min Score</label>
              <input type="number" placeholder="0" min="0" max="100"
                value={filters.minScore} onChange={(e) => updateFilter("minScore", e.target.value)}
                className="h-9 w-20 rounded-md border border-gray-200 bg-gray-50 px-2 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Min Value</label>
              <input type="number" placeholder="$0" step="10000"
                value={filters.minValue} onChange={(e) => updateFilter("minValue", e.target.value)}
                className="h-9 w-28 rounded-md border border-gray-200 bg-gray-50 px-2 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Max Value</label>
              <input type="number" placeholder="No max" step="10000"
                value={filters.maxValue} onChange={(e) => updateFilter("maxValue", e.target.value)}
                className="h-9 w-28 rounded-md border border-gray-200 bg-gray-50 px-2 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Max Age (days)</label>
              <input type="number" placeholder="Any" min="0"
                value={filters.maxAge} onChange={(e) => updateFilter("maxAge", e.target.value)}
                className="h-9 w-20 rounded-md border border-gray-200 bg-gray-50 px-2 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Board */}
      <div className="w-full overflow-x-auto">
        <div className="flex gap-4 pb-4" style={{ minWidth: "1860px" }}>
          {STAGES.map((stage) => {
            const config = STAGE_CONFIG[stage];
            const stageCards = grouped[stage];
            const isDropTarget = dragOverStage === stage;
            const isDragging = draggedCard !== null;
            return (
              <div key={stage}
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
                <div className="flex items-center justify-between p-3 pb-2">
                  <h3 className={`text-sm font-semibold ${config.color}`}>{config.label}</h3>
                  <Badge variant="secondary" className="text-xs">{stageCards.length}</Badge>
                </div>
                <div className="flex min-h-[120px] flex-col gap-2 p-2 pt-0">
                  {stageCards.length === 0 ? (
                    <div className={`flex-1 rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground ${
                      isDropTarget ? "border-blue-400 bg-blue-50/50" : "border-gray-300"
                    }`}>{isDropTarget ? "Drop here" : "No properties"}</div>
                  ) : (
                    stageCards.map((card) => {
                      const isBeingDragged = draggedCard === card.id;
                      const isSaving = savingCard === card.id;
                      return (
                        <div key={card.id} draggable
                          onDragStart={(e) => handleDragStart(e, card.id)}
                          onDragEnd={handleDragEnd}
                          className={`group relative transition-all duration-150 ${
                            isBeingDragged ? "opacity-40 scale-95" : ""} ${isSaving ? "opacity-70" : ""}`}>
                          <Card className={`cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md ${
                            isSaving ? "ring-2 ring-blue-300" : ""}`}>
                            <CardContent className="p-3">
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-40 transition-opacity">
                                <GripVertical className="h-4 w-4 text-gray-400" />
                              </div>
                              <div className="mb-2 flex items-start justify-between">
                                <div className="min-w-0 flex-1">
                                  <Link href={`/opportunities/${card.id}`} className="hover:underline"
                                    onClick={(e) => e.stopPropagation()}>
                                    <p className="truncate text-sm font-medium">{card.address}</p>
                                  </Link>
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <MapPin className="h-3 w-3" />{card.city}, {card.county}
                                  </div>
                                </div>
                                <Badge className={`ml-2 shrink-0 text-xs ${scoreColor(card.score)}`}>{card.score}</Badge>
                              </div>
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <DollarSign className="h-3 w-3" />{fmt(card.estimatedValue)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />{card.daysInStage}d
                                </span>
                              </div>
                              {isSaving && <div className="mt-1 text-[10px] text-blue-500 font-medium">Saving...</div>}
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

      <div className="text-sm text-muted-foreground">
        {filteredCards.length === cards.length
          ? `${cards.length} properties across ${STAGES.length} stages`
          : `Showing ${filteredCards.length} of ${cards.length} properties across ${STAGES.length} stages`}
      </div>
    </div>
  );
}
