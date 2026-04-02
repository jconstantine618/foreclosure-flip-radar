"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  RotateCcw,
} from "lucide-react";

// ---------- helpers ----------
function fmt(n: number) {
  return "$" + n.toLocaleString("en-US");
}

// ---------- types ----------
type Stage =
  | "PRE_FORECLOSURE"
  | "AUCTION"
  | "REO"
  | "BANK_OWNED"
  | "SHORT_SALE";

type Pipeline =
  | "NEW"
  | "RESEARCHING"
  | "BID_READY"
  | "BID_SUBMITTED"
  | "WON"
  | "LOST"
  | "CLOSED";

type PropertyType =
  | "Single Family"
  | "Townhouse"
  | "Condo"
  | "Multi-Family"
  | "Vacant Land";

interface Opportunity {
  id: string;
  address: string;
  city: string;
  county: string;
  type: PropertyType;
  score: number;
  stage: Stage;
  pipeline: Pipeline;
  estimatedValue: number;
  equityPercent: number;
  auctionDate: string | null;
  hasCountyNotice: boolean;
}

// ---------- mock data ----------
const MOCK_DATA: Opportunity[] = [
  { id: "1", address: "104 Maple Creek Dr", city: "Greenville", county: "Greenville", type: "Single Family", score: 88, stage: "AUCTION", pipeline: "BID_READY", estimatedValue: 285000, equityPercent: 42, auctionDate: "2026-04-28", hasCountyNotice: true },
  { id: "2", address: "2215 Pelham Rd", city: "Greenville", county: "Greenville", type: "Single Family", score: 82, stage: "PRE_FORECLOSURE", pipeline: "RESEARCHING", estimatedValue: 195000, equityPercent: 31, auctionDate: null, hasCountyNotice: true },
  { id: "3", address: "503 Ocean Blvd", city: "Myrtle Beach", county: "Horry", type: "Condo", score: 76, stage: "AUCTION", pipeline: "NEW", estimatedValue: 224000, equityPercent: 28, auctionDate: "2026-05-05", hasCountyNotice: false },
  { id: "4", address: "1742 Woodruff Rd", city: "Simpsonville", county: "Greenville", type: "Townhouse", score: 91, stage: "PRE_FORECLOSURE", pipeline: "BID_READY", estimatedValue: 310000, equityPercent: 55, auctionDate: null, hasCountyNotice: true },
  { id: "5", address: "89 Church St", city: "Georgetown", county: "Georgetown", type: "Single Family", score: 67, stage: "REO", pipeline: "RESEARCHING", estimatedValue: 148000, equityPercent: 100, auctionDate: null, hasCountyNotice: false },
  { id: "6", address: "334 N Main St", city: "Mauldin", county: "Greenville", type: "Multi-Family", score: 74, stage: "AUCTION", pipeline: "NEW", estimatedValue: 415000, equityPercent: 38, auctionDate: "2026-05-12", hasCountyNotice: true },
  { id: "7", address: "7801 Kings Hwy", city: "Myrtle Beach", county: "Horry", type: "Single Family", score: 69, stage: "SHORT_SALE", pipeline: "RESEARCHING", estimatedValue: 175000, equityPercent: 15, auctionDate: null, hasCountyNotice: false },
  { id: "8", address: "212 Augusta St", city: "Greenville", county: "Greenville", type: "Single Family", score: 95, stage: "AUCTION", pipeline: "BID_SUBMITTED", estimatedValue: 345000, equityPercent: 48, auctionDate: "2026-04-22", hasCountyNotice: true },
  { id: "9", address: "1500 Hwy 17 S", city: "Surfside Beach", county: "Horry", type: "Condo", score: 58, stage: "BANK_OWNED", pipeline: "NEW", estimatedValue: 199000, equityPercent: 100, auctionDate: null, hasCountyNotice: false },
  { id: "10", address: "45 Front St", city: "Georgetown", county: "Georgetown", type: "Single Family", score: 72, stage: "PRE_FORECLOSURE", pipeline: "RESEARCHING", estimatedValue: 162000, equityPercent: 22, auctionDate: null, hasCountyNotice: true },
  { id: "11", address: "628 Laurens Rd", city: "Greenville", county: "Greenville", type: "Single Family", score: 80, stage: "AUCTION", pipeline: "BID_READY", estimatedValue: 238000, equityPercent: 36, auctionDate: "2026-05-19", hasCountyNotice: true },
  { id: "12", address: "910 Sea Mountain Hwy", city: "North Myrtle Beach", county: "Horry", type: "Townhouse", score: 63, stage: "REO", pipeline: "NEW", estimatedValue: 265000, equityPercent: 100, auctionDate: null, hasCountyNotice: false },
  { id: "13", address: "77 Poinsett Hwy", city: "Travelers Rest", county: "Greenville", type: "Single Family", score: 85, stage: "PRE_FORECLOSURE", pipeline: "RESEARCHING", estimatedValue: 210000, equityPercent: 40, auctionDate: null, hasCountyNotice: true },
  { id: "14", address: "1205 Fraser St", city: "Georgetown", county: "Georgetown", type: "Vacant Land", score: 51, stage: "AUCTION", pipeline: "NEW", estimatedValue: 55000, equityPercent: 100, auctionDate: "2026-05-26", hasCountyNotice: true },
  { id: "15", address: "4420 Clemson Blvd", city: "Anderson", county: "Greenville", type: "Single Family", score: 78, stage: "AUCTION", pipeline: "RESEARCHING", estimatedValue: 189000, equityPercent: 33, auctionDate: "2026-04-30", hasCountyNotice: true },
  { id: "16", address: "200 E North St", city: "Greenville", county: "Greenville", type: "Multi-Family", score: 87, stage: "PRE_FORECLOSURE", pipeline: "BID_READY", estimatedValue: 520000, equityPercent: 45, auctionDate: null, hasCountyNotice: true },
  { id: "17", address: "315 3rd Ave S", city: "Myrtle Beach", county: "Horry", type: "Condo", score: 62, stage: "SHORT_SALE", pipeline: "NEW", estimatedValue: 142000, equityPercent: 12, auctionDate: null, hasCountyNotice: false },
  { id: "18", address: "88 Verdae Blvd", city: "Greenville", county: "Greenville", type: "Townhouse", score: 73, stage: "AUCTION", pipeline: "RESEARCHING", estimatedValue: 275000, equityPercent: 29, auctionDate: "2026-06-02", hasCountyNotice: true },
];

const STAGE_LABELS: Record<Stage, string> = {
  PRE_FORECLOSURE: "Pre-Foreclosure",
  AUCTION: "Auction",
  REO: "REO",
  BANK_OWNED: "Bank Owned",
  SHORT_SALE: "Short Sale",
};

const STAGE_VARIANTS: Record<Stage, "default" | "warning" | "destructive" | "info" | "success" | "secondary"> = {
  PRE_FORECLOSURE: "warning",
  AUCTION: "destructive",
  REO: "info",
  BANK_OWNED: "secondary",
  SHORT_SALE: "success",
};

const PIPELINE_LABELS: Record<Pipeline, string> = {
  NEW: "New",
  RESEARCHING: "Researching",
  BID_READY: "Bid Ready",
  BID_SUBMITTED: "Bid Submitted",
  WON: "Won",
  LOST: "Lost",
  CLOSED: "Closed",
};

const PAGE_SIZE = 8;

type SortKey = keyof Pick<Opportunity, "address" | "county" | "type" | "score" | "stage" | "pipeline" | "estimatedValue" | "equityPercent" | "auctionDate">;

function scoreColor(score: number) {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

export default function OpportunitiesPage() {
  // filters
  const [county, setCounty] = useState("ALL");
  const [stage, setStage] = useState("ALL");
  const [minScore, setMinScore] = useState("");
  const [propertyType, setPropertyType] = useState("ALL");
  const [hasNotice, setHasNotice] = useState(false);
  const [search, setSearch] = useState("");

  // applied filters (only update on Apply)
  const [appliedFilters, setAppliedFilters] = useState({
    county: "ALL",
    stage: "ALL",
    minScore: "",
    propertyType: "ALL",
    hasNotice: false,
    search: "",
  });

  // sort
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // pagination
  const [page, setPage] = useState(0);

  function applyFilters() {
    setAppliedFilters({ county, stage, minScore, propertyType, hasNotice, search });
    setPage(0);
  }

  function resetFilters() {
    setCounty("ALL");
    setStage("ALL");
    setMinScore("");
    setPropertyType("ALL");
    setHasNotice(false);
    setSearch("");
    setAppliedFilters({ county: "ALL", stage: "ALL", minScore: "", propertyType: "ALL", hasNotice: false, search: "" });
    setPage(0);
  }

  const filtered = useMemo(() => {
    const f = appliedFilters;
    return MOCK_DATA.filter((o) => {
      if (f.county !== "ALL" && o.county !== f.county) return false;
      if (f.stage !== "ALL" && o.stage !== f.stage) return false;
      if (f.minScore && o.score < Number(f.minScore)) return false;
      if (f.propertyType !== "ALL" && o.type !== f.propertyType) return false;
      if (f.hasNotice && !o.hasCountyNotice) return false;
      if (f.search && !o.address.toLowerCase().includes(f.search.toLowerCase())) return false;
      return true;
    });
  }, [appliedFilters]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "number" && typeof bVal === "number") return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortDir === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Opportunities"
        description="Browse and filter foreclosure investment opportunities across South Carolina."
        actions={
          <Button variant="outline" size="sm">
            <Download className="mr-1 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      {/* ---- filter bar ---- */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            {/* County */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">County</label>
              <Select value={county} onValueChange={setCounty}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Counties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Counties</SelectItem>
                  <SelectItem value="Greenville">Greenville</SelectItem>
                  <SelectItem value="Horry">Horry</SelectItem>
                  <SelectItem value="Georgetown">Georgetown</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Stage */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Stage</label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="All Stages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Stages</SelectItem>
                  <SelectItem value="PRE_FORECLOSURE">Pre-Foreclosure</SelectItem>
                  <SelectItem value="AUCTION">Auction</SelectItem>
                  <SelectItem value="REO">REO</SelectItem>
                  <SelectItem value="BANK_OWNED">Bank Owned</SelectItem>
                  <SelectItem value="SHORT_SALE">Short Sale</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Min Score */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Min Score</label>
              <Input
                type="number"
                placeholder="0"
                className="w-[80px]"
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
              />
            </div>

            {/* Property Type */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Property Type</label>
              <Select value={propertyType} onValueChange={setPropertyType}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  <SelectItem value="Single Family">Single Family</SelectItem>
                  <SelectItem value="Townhouse">Townhouse</SelectItem>
                  <SelectItem value="Condo">Condo</SelectItem>
                  <SelectItem value="Multi-Family">Multi-Family</SelectItem>
                  <SelectItem value="Vacant Land">Vacant Land</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Has County Notice */}
            <div className="flex items-center gap-2 pb-0.5">
              <input
                id="hasNotice"
                type="checkbox"
                checked={hasNotice}
                onChange={(e) => setHasNotice(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="hasNotice" className="text-sm text-muted-foreground whitespace-nowrap">
                Has County Notice
              </label>
            </div>

            {/* Search */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Address</label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search address..."
                  className="w-[180px] pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Buttons */}
            <Button size="sm" onClick={applyFilters}>
              Apply
            </Button>
            <Button size="sm" variant="ghost" onClick={resetFilters}>
              <RotateCcw className="mr-1 h-3 w-3" />
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---- results table ---- */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("address")}>
                  <span className="inline-flex items-center">Address <SortIcon col="address" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("county")}>
                  <span className="inline-flex items-center">County <SortIcon col="county" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("type")}>
                  <span className="inline-flex items-center">Type <SortIcon col="type" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("score")}>
                  <span className="inline-flex items-center">Score <SortIcon col="score" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("stage")}>
                  <span className="inline-flex items-center">Stage <SortIcon col="stage" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("pipeline")}>
                  <span className="inline-flex items-center">Pipeline <SortIcon col="pipeline" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("estimatedValue")}>
                  <span className="inline-flex items-center justify-end">Est. Value <SortIcon col="estimatedValue" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("equityPercent")}>
                  <span className="inline-flex items-center justify-end">Equity% <SortIcon col="equityPercent" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("auctionDate")}>
                  <span className="inline-flex items-center">Auction Date <SortIcon col="auctionDate" /></span>
                </TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                    No opportunities match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      <div>{o.address}</div>
                      <div className="text-xs text-muted-foreground">{o.city}, SC</div>
                    </TableCell>
                    <TableCell>{o.county}</TableCell>
                    <TableCell className="whitespace-nowrap">{o.type}</TableCell>
                    <TableCell>
                      <span className={`font-bold ${scoreColor(o.score)}`}>{o.score}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STAGE_VARIANTS[o.stage]}>{STAGE_LABELS[o.stage]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{PIPELINE_LABELS[o.pipeline]}</Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">{fmt(o.estimatedValue)}</TableCell>
                    <TableCell className="text-right">{o.equityPercent}%</TableCell>
                    <TableCell className="whitespace-nowrap">{o.auctionDate ?? "\u2014"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/opportunities/${o.id}`}>
                          <Eye className="mr-1 h-4 w-4" />
                          View
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ---- pagination ---- */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {sorted.length === 0 ? 0 : page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length} results
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
