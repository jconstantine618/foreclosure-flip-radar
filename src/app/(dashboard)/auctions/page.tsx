"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  RotateCcw,
  Gavel,
  Clock,
} from "lucide-react";

// ---------- helpers ----------
function fmt(n: number) {
  return "$" + n.toLocaleString("en-US");
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// ---------- types ----------
type AuctionType = "MIE" | "Upset" | "Tax";
type AuctionStatus = "Scheduled" | "Pending" | "Confirmed" | "Postponed";

interface Auction {
  id: string;
  date: string;
  time: string;
  address: string;
  city: string;
  county: string;
  type: AuctionType;
  minBid: number;
  deposit: number;
  status: AuctionStatus;
  score: number;
}

// ---------- API response types ----------
interface Opportunity {
  id: string;
  flipScore: number;
  distressStage: "AUCTION" | "TAX_LIEN" | "LIS_PENDENS" | string;
  pipelineStage: "NEW" | "REVIEWING" | "BID_READY" | "UNDERWRITING" | "PASSED" | string;
  auctionDate: string | null;
  createdAt: string;
  property: {
    streetAddress: string;
    city: string;
    county: string;
    estimatedValue: number;
  };
  maxAllowableOffer?: number;
}

const TYPE_VARIANTS: Record<AuctionType, "destructive" | "warning" | "info"> = {
  MIE: "destructive",
  Upset: "warning",
  Tax: "info",
};

const STATUS_VARIANTS: Record<AuctionStatus, "default" | "success" | "warning" | "secondary"> = {
  Confirmed: "success",
  Scheduled: "default",
  Pending: "warning",
  Postponed: "secondary",
};

type DateRange = "this_week" | "next_2_weeks" | "this_month" | "all";

type SortKey = keyof Pick<Auction, "date" | "address" | "county" | "type" | "minBid" | "deposit" | "status" | "score">;

function scoreColor(score: number) {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

function rowUrgencyClass(dateStr: string): string {
  const days = daysUntil(dateStr);
  if (days < 3) return "bg-red-50";
  if (days < 7) return "bg-amber-50";
  return "";
}

function mapOpportunityToAuction(opp: Opportunity): Auction | null {
  if (!opp.auctionDate) return null;

  const distressTypeMap: Record<string, AuctionType> = {
    AUCTION: "MIE",
    TAX_LIEN: "Tax",
    LIS_PENDENS: "Upset",
  };

  const pipelineStatusMap: Record<string, AuctionStatus> = {
    BID_READY: "Confirmed",
    UNDERWRITING: "Pending",
    NEW: "Scheduled",
    REVIEWING: "Scheduled",
    PASSED: "Postponed",
  };

  const minBid = opp.maxAllowableOffer || Math.round(opp.property.estimatedValue * 0.5);
  const type = distressTypeMap[opp.distressStage] || "MIE";
  const status = pipelineStatusMap[opp.pipelineStage] || "Scheduled";

  return {
    id: opp.id,
    date: opp.auctionDate.split("T")[0],
    time: "TBD",
    address: opp.property.streetAddress,
    city: opp.property.city,
    county: opp.property.county,
    type,
    minBid,
    deposit: Math.round(minBid * 0.05),
    status,
    score: opp.flipScore,
  };
}

export default function AuctionsPage() {
  const [county, setCounty] = useState("ALL");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [auctionType, setAuctionType] = useState("ALL");

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAuctions = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/opportunities?limit=100&sort=auctionDate&order=asc");
        if (!response.ok) throw new Error("Failed to fetch opportunities");
        const data = await response.json();
        const opportunities = Array.isArray(data) ? data : data.data || [];
        const mapped = opportunities
          .map(mapOpportunityToAuction)
          .filter((a: Auction | null): a is Auction => a !== null);
        setAuctions(mapped);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setAuctions([]);
      } finally {
        setLoading(false);
      }
    };
    fetchAuctions();
  }, []);

  const filtered = useMemo(() => {
    return auctions.filter((a) => {
      if (county !== "ALL" && a.county !== county) return false;
      if (auctionType !== "ALL" && a.type !== auctionType) return false;
      if (dateRange !== "all") {
        const days = daysUntil(a.date);
        if (dateRange === "this_week" && days > 7) return false;
        if (dateRange === "next_2_weeks" && days > 14) return false;
        if (dateRange === "this_month" && days > 30) return false;
      }
      return true;
    });
  }, [county, dateRange, auctionType, auctions]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "number" && typeof bVal === "number")
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortDir === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />;
  }

  function resetFilters() {
    setCounty("ALL");
    setDateRange("all");
    setAuctionType("ALL");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upcoming Auctions"
        description="Track and manage upcoming foreclosure auctions across South Carolina counties."
        actions={
          <Button variant="outline" size="sm">
            <Download className="mr-1 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
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
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Date Range</label>
              <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="All Dates" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dates</SelectItem>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="next_2_weeks">Next 2 Weeks</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Auction Type</label>
              <Select value={auctionType} onValueChange={setAuctionType}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  <SelectItem value="MIE">MIE</SelectItem>
                  <SelectItem value="Upset">Upset</SelectItem>
                  <SelectItem value="Tax">Tax Sale</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button size="sm" variant="ghost" onClick={resetFilters}>
              <RotateCcw className="mr-1 h-3 w-3" />
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-red-100 border border-red-200" />
          Less than 3 days away
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-amber-100 border border-amber-200" />
          Less than 7 days away
        </span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading && (
            <div className="py-8 text-center text-muted-foreground">
              Loading auctions...
            </div>
          )}
          {error && (
            <div className="py-8 text-center text-red-600">
              Error loading auctions: {error}
            </div>
          )}
          {!loading && !error && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("date")}>
                    <span className="inline-flex items-center">Date <SortIcon col="date" /></span>
                  </TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("address")}>
                  <span className="inline-flex items-center">Address <SortIcon col="address" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("county")}>
                  <span className="inline-flex items-center">County <SortIcon col="county" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("type")}>
                  <span className="inline-flex items-center">Type <SortIcon col="type" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("minBid")}>
                  <span className="inline-flex items-center justify-end">Min Bid <SortIcon col="minBid" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("deposit")}>
                  <span className="inline-flex items-center justify-end">Deposit <SortIcon col="deposit" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("status")}>
                  <span className="inline-flex items-center">Status <SortIcon col="status" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("score")}>
                  <span className="inline-flex items-center">Score <SortIcon col="score" /></span>
                </TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                    <Gavel className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    No auctions match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((a) => {
                  const days = daysUntil(a.date);
                  return (
                    <TableRow key={a.id} className={rowUrgencyClass(a.date)}>
                      <TableCell className="whitespace-nowrap font-medium">
                        <div>{a.date}</div>
                        {days >= 0 && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{a.time}</TableCell>
                      <TableCell>
                        <div className="font-medium">{a.address}</div>
                        <div className="text-xs text-muted-foreground">{a.city}, SC</div>
                      </TableCell>
                      <TableCell>{a.county}</TableCell>
                      <TableCell>
                        <Badge variant={TYPE_VARIANTS[a.type]}>{a.type}</Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">{fmt(a.minBid)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{fmt(a.deposit)}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[a.status]}>{a.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`font-bold ${scoreColor(a.score)}`}>{a.score}</span>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/opportunities/${a.id}`}>
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

      {/* Summary */}
      <div className="text-sm text-muted-foreground">
        Showing {sorted.length} of {auctions.length} auctions
      </div>
    </div>
  );
}
