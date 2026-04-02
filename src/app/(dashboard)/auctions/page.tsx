"use client";

import { useState, useMemo } from "react";
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

// ---------- mock data ----------
const MOCK_AUCTIONS: Auction[] = [
  { id: "a1", date: "2026-04-02", time: "10:00 AM", address: "104 Maple Creek Dr", city: "Greenville", county: "Greenville", type: "MIE", minBid: 185000, deposit: 5000, status: "Confirmed", score: 88 },
  { id: "a2", date: "2026-04-03", time: "11:00 AM", address: "2215 Pelham Rd", city: "Greenville", county: "Greenville", type: "Upset", minBid: 142000, deposit: 5000, status: "Confirmed", score: 82 },
  { id: "a3", date: "2026-04-06", time: "10:30 AM", address: "503 Ocean Blvd", city: "Myrtle Beach", county: "Horry", type: "MIE", minBid: 168000, deposit: 5000, status: "Scheduled", score: 76 },
  { id: "a4", date: "2026-04-08", time: "2:00 PM", address: "7801 Kings Hwy", city: "Myrtle Beach", county: "Horry", type: "Tax", minBid: 32000, deposit: 2000, status: "Confirmed", score: 69 },
  { id: "a5", date: "2026-04-10", time: "10:00 AM", address: "628 Laurens Rd", city: "Greenville", county: "Greenville", type: "MIE", minBid: 155000, deposit: 5000, status: "Scheduled", score: 80 },
  { id: "a6", date: "2026-04-14", time: "11:00 AM", address: "1500 Hwy 17 S", city: "Surfside Beach", county: "Horry", type: "Upset", minBid: 125000, deposit: 5000, status: "Pending", score: 58 },
  { id: "a7", date: "2026-04-18", time: "10:00 AM", address: "334 N Main St", city: "Mauldin", county: "Greenville", type: "MIE", minBid: 275000, deposit: 10000, status: "Confirmed", score: 74 },
  { id: "a8", date: "2026-04-22", time: "2:30 PM", address: "212 Augusta St", city: "Greenville", county: "Greenville", type: "MIE", minBid: 225000, deposit: 10000, status: "Confirmed", score: 95 },
  { id: "a9", date: "2026-04-28", time: "10:00 AM", address: "910 Sea Mountain Hwy", city: "North Myrtle Beach", county: "Horry", type: "Tax", minBid: 18500, deposit: 1000, status: "Scheduled", score: 63 },
  { id: "a10", date: "2026-04-30", time: "11:00 AM", address: "4420 Clemson Blvd", city: "Anderson", county: "Greenville", type: "Upset", minBid: 112000, deposit: 5000, status: "Postponed", score: 78 },
];

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

export default function AuctionsPage() {
  const [county, setCounty] = useState("ALL");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [auctionType, setAuctionType] = useState("ALL");

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    return MOCK_AUCTIONS.filter((a) => {
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
  }, [county, dateRange, auctionType]);

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
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="text-sm text-muted-foreground">
        Showing {sorted.length} of {MOCK_AUCTIONS.length} auctions
      </div>
    </div>
  );
}
