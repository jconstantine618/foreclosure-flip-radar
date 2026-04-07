"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import 
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
type DistressStage =
  | "PRE_FORECLOSURE"
  | "AUCTION"
  | "REO"
  | "TAX_LIEN"
  | "LIS_PENDENS"
  | "BANK_OWNED"
  | "OTHER";

type PipelineStage =
  | "NEW"
  | "REVIEWING"
  | "DRIVE_BY"
  | "UNDERWRITING"
  | "BID_READY"
  | "PASSED"
  | "WON"
  | "DISPOSITION";

type PropertyType =
  | "SINGLE_FAMILY"
  | "TOWNHOUSE"
  | "CONDO"
  | "DUPLEX"
  | "MULTI_FAMILY"
  | "OTHER";

interface Property {
  id: string;
  streetAddress: string;
  city: string;
  county: string;
  state: string;
  zipCode: string;
  propertyType: PropertyType;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  estimatedValue: number;
  equityEstimate: number;
  ownerName: string | null;
}

interface Opportunity {
  id: string;
  propertyId: string;
  flipScore: number;
  distressStage: DistressStage;
  pipelineStage: PipelineStage;
  estimatedARV: number;
  estimatedRehabCost: number;
  maxAllowableOffer: number;
  auctionDate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  property: Property;
}

interface ApiResponse {
  data: Opportunity[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const DISTRESS_STAGE_LABELS: Record<DistressStage, string> = {
  PRE_FORECLOSURE: "Pre-Foreclosure",
  AUCTION: "Auction",
  REO: "REO",
  TAX_LIEN: "Tax Lien",
  LIS_PENDENS: "Lis Pendens",
  BANK_OWNED: "Bank Owned",
  OTHER: "Other",
};

const DISTRESS_STAGE_VARIANTS: Record<DistressStage, "default" | "warning" | "destructive" | "info" | "success" | "secondary"> = {
  PRE_FORECLOSURE: "warning",
  AUCTION: "destructive",
  REO: "info",
  TAX_LIEN: "secondary",
  LIS_PENDENS: "warning",
  BANK_OWNED: "secondary",
  OTHER: "default",
};

const PIPELINE_LABELS: Record<PipelineStage, string> = {
  NEW: "New",
  REVIEWING: "Reviewing",
  DRIVE_BY: "Drive By",
  UNDERWRITING: "Underwriting",
  BID_READY: "Bid Ready",
  PASSED: "Passed",
  WON: "Won",
  DISPOSITION: "Disposition",
};

const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  SINGLE_FAMILY: "Single Family",
  TOWNHOUSE: "Townhouse",
  CONDO: "Condo",
  DUPLEX: "Duplex",
  MULTI_FAMILY: "Multi-Family",
  OTHER: "Other",
};

const PAGE_SIZE = 25; // match API default limit

type SortKey = "flipScore" | "estimatedARV" | "property.streetAddress" | "property.county" | "property.propertyType" | "auctionDate";

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

  // data and loading state
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // sort
  const [sortKey, setSortKey] = useState<SortKey>("flipScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // pagination
  const [page, setPage] = useState(1);

  // fetch data from API
  useEffect(() => {
    const fetchOpportunities = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();

        if (appliedFilters.county !== "ALL") {
          params.append("county", appliedFilters.county);
        }
        if (appliedFilters.stage !== "ALL") {
          params.append("stage", appliedFilters.stage);
        }
        if (appliedFilters.minScore) {
          params.append("minScore", appliedFilters.minScore);
        }
        if (appliedFilters.propertyType !== "ALL") {
          params.append("propertyType", appliedFilters.propertyType);
        }
        if (appliedFilters.hasNotice) {
          params.append("hasNotice", "true");
        }

        // Map sort key to API field names
        let sortField = "flipScore";
        if (sortKey === "property.streetAddress") sortField = "address";
        if (sortKey === "property.county") sortField = "county";
        if (sortKey === "property.propertyType") sortField = "propertyType";
        if (sortKey === "estimatedARV") sortField = "estimatedARV";
        if (sortKey === "auctionDate") sortField = "auctionDate";

        params.append("sort", sortField);
        params.append("order", sortDir);
        params.append("page", String(page));
        params.append("limit", String(PAGE_SIZE));

        const response = await fetch(`/api/opportunities?${params.toString()}`);
      if (!response.ok) throw new Error(`Failed to fetch opportunities: ${response.status}`);
        const data: ApiResponse = await response.json();

        setOpportunities(data.data ?? []);
        setTotalCount(data.total ?? 0);
      } catch (error) {
        console.error("Failed to fetch opportunities:", error);
        setOpportunities([]);
      setTotalCount(0);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOpportunities();
  }, [appliedFilters, sortKey, sortDir, page]);

  function applyFilters() {
    setAppliedFilters({ county, stage, minScore, propertyType, hasNotice, search });
    setPage(1);
  }

  function resetFilters() {
    setCounty("ALL");
    setStage("ALL");
    setMinScore("");
    setPropertyType("ALL");
    setHasNotice(false);
    setSearch("");
    setAppliedFilters({ county: "ALL", stage: "ALL", minScore: "", propertyType: "ALL", hasNotice: false, search: "" });
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

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
                  <SelectItem value="TAX_LIEN">Tax Lien</SelectItem>
                  <SelectItem value="LIS_PENDENS">Lis Pendens</SelectItem>
                  <SelectItem value="BANK_OWNED">Bank Owned</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
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
                  <SelectItem value="SINGLE_FAMILY">Single Family</SelectItem>
                  <SelectItem value="TOWNHOUSE">Townhouse</SelectItem>
                  <SelectItem value="CONDO">Condo</SelectItem>
                  <SelectItem value="DUPLEX">Duplex</SelectItem>
                  <SelectItem value="MULTI_FAMILY">Multi-Family</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
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
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              Loading opportunities...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("property.streetAddress")}>
                    <span className="inline-flex items-center">Address <SortIcon col="property.streetAddress" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("property.county")}>
                    <span className="inline-flex items-center">County <SortIcon col="property.county" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("property.propertyType")}>
                    <span className="inline-flex items-center">Type <SortIcon col="property.propertyType" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("flipScore")}>
                    <span className="inline-flex items-center">Score <SortIcon col="flipScore" /></span>
                  </TableHead>
                  <TableHead className="whitespace-nowrap">Distress Stage</TableHead>
                  <TableHead className="whitespace-nowrap">Pipeline</TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("estimatedARV")}>
                    <span className="inline-flex items-center justify-end">Est. ARV <SortIcon col="estimatedARV" /></span>
                  </TableHead>
                  <TableHead className="text-right">Equity%</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("auctionDate")}>
                    <span className="inline-flex items-center">Auction Date <SortIcon col="auctionDate" /></span>
                  </TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opportunities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                      No opportunities match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  opportunities.map((o) => {
                    const equityPercent = o.property.estimatedValue > 0
                      ? Math.round((o.property.equityEstimate / o.property.estimatedValue) * 100)
                      : 0;

                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          <div>{o.property.streetAddress}</div>
                          <div className="text-xs text-muted-foreground">{o.property.city}, {o.property.state}</div>
                        </TableCell>
                        <TableCell>{o.property.county}</TableCell>
                        <TableCell className="whitespace-nowrap">{PROPERTY_TYPE_LABELS[o.property.propertyType]}</TableCell>
                        <TableCell>
                          <span className={`font-bold ${scoreColor(o.flipScore)}`}>{o.flipScore}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={DISTRESS_STAGE_VARIANTS[o.distressStage]}>{DISTRESS_STAGE_LABELS[o.distressStage]}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{PIPELINE_LABELS[o.pipelineStage]}</Badge>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">{fmt(o.estimatedARV)}</TableCell>
                        <TableCell className="text-right">{equityPercent}%</TableCell>
                        <TableCell className="whitespace-nowrap">{o.auctionDate ? new Date(o.auctionDate).toLocaleDateString() : "\u2014"}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/opportunities/${o.id}`}>
                              <Eye className="mr-1 h-4 w-4" />
                              View
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ---- pagination ---- */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {opportunities.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}&ndash;{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount} results
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
