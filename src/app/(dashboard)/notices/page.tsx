"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  FileText,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Link2,
  AlertCircle,
  Clock,
} from "lucide-react";

// ---------- helpers ----------
function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
}

function countdownLabel(dateStr: string): string {
  const days = daysUntil(dateStr);
  if (days < 0) return "Past";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days`;
}

// ---------- types ----------
type NoticeType =
  | "MIE"
  | "Upset Bid"
  | "Lis Pendens"
  | "Tax Sale"
  | "Public Notice";

interface Notice {
  id: string;
  noticeType: NoticeType;
  county: string;
  caseNumber: string;
  address: string | null;
  plaintiff: string;
  defendant: string;
  saleDate: string;
  matchedPropertyId: string | null;
  sourceUrl: string;
  rawText: string;
  publishedDate: string;
}

// ---------- mock data ----------
const MOCK_NOTICES: Notice[] = [
  {
    id: "n1",
    noticeType: "MIE",
    county: "Greenville",
    caseNumber: "2026-CP-23-01842",
    address: "104 Maple Creek Dr, Greenville, SC 29607",
    plaintiff: "First National Bank",
    defendant: "James T. Wilson",
    saleDate: "2026-04-02",
    matchedPropertyId: "prop-001",
    sourceUrl: "https://greenvillecounty.org/clerk/sales/2026-04-02",
    rawText:
      "MASTER IN EQUITY SALE - Case No. 2026-CP-23-01842. First National Bank, Plaintiff, vs. James T. Wilson, Defendant. Sale of real property located at 104 Maple Creek Dr, Greenville, SC 29607. Parcel #0534.00-01-009.00. Sale date: April 2, 2026 at 10:00 AM at the Greenville County Courthouse.",
    publishedDate: "2026-03-15",
  },
  {
    id: "n2",
    noticeType: "Upset Bid",
    county: "Greenville",
    caseNumber: "2026-CP-23-01105",
    address: "2215 Pelham Rd, Greenville, SC 29615",
    plaintiff: "Wells Fargo Home Mortgage",
    defendant: "Maria L. Gonzalez",
    saleDate: "2026-04-03",
    matchedPropertyId: "prop-002",
    sourceUrl: "https://greenvillecounty.org/clerk/upset/2026-04-03",
    rawText:
      "NOTICE OF UPSET BID - Case No. 2026-CP-23-01105. Wells Fargo Home Mortgage, Plaintiff, vs. Maria L. Gonzalez, Defendant. Property at 2215 Pelham Rd, Greenville, SC 29615. An upset bid of $142,000 has been filed. The next bid must exceed by at least 5%. Deadline: April 3, 2026.",
    publishedDate: "2026-03-18",
  },
  {
    id: "n3",
    noticeType: "Lis Pendens",
    county: "Horry",
    caseNumber: "2026-CP-26-00743",
    address: "503 Ocean Blvd, Myrtle Beach, SC 29577",
    plaintiff: "Bank of America, N.A.",
    defendant: "Robert and Sandra Chen",
    saleDate: "2026-04-06",
    matchedPropertyId: "prop-003",
    sourceUrl: "https://horrycounty.org/records/lis-pendens/2026-00743",
    rawText:
      "LIS PENDENS - Case No. 2026-CP-26-00743. Bank of America, N.A., Plaintiff, vs. Robert and Sandra Chen, Defendants. Notice is hereby given that an action has been commenced affecting title to real property at 503 Ocean Blvd, Myrtle Beach, SC 29577. Parcel #174-00-04-028.",
    publishedDate: "2026-03-10",
  },
  {
    id: "n4",
    noticeType: "Tax Sale",
    county: "Horry",
    caseNumber: "TAX-2026-HRY-0412",
    address: "7801 Kings Hwy, Myrtle Beach, SC 29572",
    plaintiff: "Horry County Tax Collector",
    defendant: "Estate of William T. Brooks",
    saleDate: "2026-04-08",
    matchedPropertyId: "prop-004",
    sourceUrl: "https://horrycounty.org/tax/delinquent/2026",
    rawText:
      "DELINQUENT TAX SALE - Tax ID: TAX-2026-HRY-0412. Property at 7801 Kings Hwy, Myrtle Beach, SC 29572. Owner of record: Estate of William T. Brooks. Delinquent taxes: $4,218.32. Minimum bid: $32,000. Sale date: April 8, 2026 at 2:00 PM.",
    publishedDate: "2026-03-01",
  },
  {
    id: "n5",
    noticeType: "MIE",
    county: "Greenville",
    caseNumber: "2026-CP-23-02044",
    address: null,
    plaintiff: "JPMorgan Chase Bank, N.A.",
    defendant: "Kevin D. Thompson",
    saleDate: "2026-04-10",
    matchedPropertyId: null,
    sourceUrl: "https://greenvillecounty.org/clerk/sales/2026-04-10",
    rawText:
      "MASTER IN EQUITY SALE - Case No. 2026-CP-23-02044. JPMorgan Chase Bank, N.A., Plaintiff, vs. Kevin D. Thompson, Defendant. Sale of real property described as Lot 14, Block B, Cedar Ridge Subdivision. Sale date: April 10, 2026 at 10:00 AM.",
    publishedDate: "2026-03-20",
  },
  {
    id: "n6",
    noticeType: "Public Notice",
    county: "Horry",
    caseNumber: "PN-2026-HRY-0088",
    address: "1500 Hwy 17 S, Surfside Beach, SC 29575",
    plaintiff: "Nationstar Mortgage LLC",
    defendant: "Angela R. Davis",
    saleDate: "2026-04-14",
    matchedPropertyId: null,
    sourceUrl: "https://horrycounty.org/notices/2026-0088",
    rawText:
      "PUBLIC NOTICE - Nationstar Mortgage LLC has filed a foreclosure action against Angela R. Davis for property located at 1500 Hwy 17 S, Surfside Beach, SC 29575. Hearing scheduled April 14, 2026.",
    publishedDate: "2026-03-22",
  },
  {
    id: "n7",
    noticeType: "Upset Bid",
    county: "Greenville",
    caseNumber: "2026-CP-23-01330",
    address: "334 N Main St, Mauldin, SC 29662",
    plaintiff: "Truist Bank",
    defendant: "Patricia M. Edwards",
    saleDate: "2026-04-18",
    matchedPropertyId: "prop-007",
    sourceUrl: "https://greenvillecounty.org/clerk/upset/2026-04-18",
    rawText:
      "NOTICE OF UPSET BID - Case No. 2026-CP-23-01330. Truist Bank, Plaintiff, vs. Patricia M. Edwards, Defendant. Property at 334 N Main St, Mauldin, SC 29662. Current high bid: $275,000. Upset bid deadline: April 18, 2026.",
    publishedDate: "2026-03-25",
  },
  {
    id: "n8",
    noticeType: "Lis Pendens",
    county: "Greenville",
    caseNumber: "2026-CP-23-02188",
    address: "212 Augusta St, Greenville, SC 29601",
    plaintiff: "U.S. Bank National Association",
    defendant: "Thomas and Lisa Harmon",
    saleDate: "2026-04-22",
    matchedPropertyId: null,
    sourceUrl: "https://greenvillecounty.org/records/lis-pendens/2026-02188",
    rawText:
      "LIS PENDENS - Case No. 2026-CP-23-02188. U.S. Bank National Association, Plaintiff, vs. Thomas and Lisa Harmon, Defendants. Action commenced affecting title to 212 Augusta St, Greenville, SC 29601. Parcel #0042.00-01-015.00.",
    publishedDate: "2026-03-28",
  },
];

const NOTICE_TYPE_VARIANTS: Record<
  NoticeType,
  "destructive" | "warning" | "info" | "success" | "secondary"
> = {
  MIE: "destructive",
  "Upset Bid": "warning",
  "Lis Pendens": "info",
  "Tax Sale": "success",
  "Public Notice": "secondary",
};

const COUNTY_VARIANTS: Record<string, "outline" | "default"> = {
  Greenville: "outline",
  Horry: "outline",
};

type DateRange = "this_week" | "next_2_weeks" | "this_month" | "all";

export default function NoticesPage() {
  const [county, setCounty] = useState("ALL");
  const [noticeType, setNoticeType] = useState("ALL");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [matchedOnly, setMatchedOnly] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    return MOCK_NOTICES.filter((n) => {
      if (county !== "ALL" && n.county !== county) return false;
      if (noticeType !== "ALL" && n.noticeType !== noticeType) return false;
      if (matchedOnly && !n.matchedPropertyId) return false;
      if (dateRange !== "all") {
        const days = daysUntil(n.saleDate);
        if (dateRange === "this_week" && days > 7) return false;
        if (dateRange === "next_2_weeks" && days > 14) return false;
        if (dateRange === "this_month" && days > 30) return false;
      }
      return true;
    });
  }, [county, noticeType, dateRange, matchedOnly]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetFilters() {
    setCounty("ALL");
    setNoticeType("ALL");
    setDateRange("all");
    setMatchedOnly(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="County Notices & Public Records"
        description="Browse foreclosure notices, lis pendens filings, and tax sale announcements from South Carolina counties."
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                County
              </label>
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
              <label className="text-xs font-medium text-muted-foreground">
                Notice Type
              </label>
              <Select value={noticeType} onValueChange={setNoticeType}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  <SelectItem value="MIE">MIE</SelectItem>
                  <SelectItem value="Upset Bid">Upset Bid</SelectItem>
                  <SelectItem value="Lis Pendens">Lis Pendens</SelectItem>
                  <SelectItem value="Tax Sale">Tax Sale</SelectItem>
                  <SelectItem value="Public Notice">Public Notice</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Date Range
              </label>
              <Select
                value={dateRange}
                onValueChange={(v) => setDateRange(v as DateRange)}
              >
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

            <div className="flex items-center gap-2 pb-0.5">
              <Switch
                id="matched-toggle"
                checked={matchedOnly}
                onCheckedChange={setMatchedOnly}
              />
              <Label htmlFor="matched-toggle" className="text-sm">
                Matched only
              </Label>
            </div>

            <Button size="sm" variant="ghost" onClick={resetFilters}>
              <RotateCcw className="mr-1 h-3 w-3" />
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notices List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="mb-3 h-10 w-10 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">
              No notices match the current filters.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => {
            const isExpanded = expandedIds.has(n.id);
            return (
              <Card key={n.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={NOTICE_TYPE_VARIANTS[n.noticeType]}>
                      {n.noticeType}
                    </Badge>
                    <Badge
                      variant={COUNTY_VARIANTS[n.county] || "outline"}
                    >
                      {n.county} County
                    </Badge>
                    {n.matchedPropertyId ? (
                      <Badge variant="success">
                        <Link2 className="mr-1 h-3 w-3" />
                        Matched
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <AlertCircle className="mr-1 h-3 w-3" />
                        Unmatched
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        Case Number
                      </p>
                      <p className="text-sm font-medium">{n.caseNumber}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        Address
                      </p>
                      <p className="text-sm font-medium">
                        {n.address || "Address not parsed"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        Plaintiff vs Defendant
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">{n.plaintiff}</span>
                        {" vs "}
                        <span>{n.defendant}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        Sale Date
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{n.saleDate}</p>
                        <Badge variant="outline" className="text-xs">
                          <Clock className="mr-1 h-3 w-3" />
                          {countdownLabel(n.saleDate)}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {n.matchedPropertyId && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={`/opportunities/${n.matchedPropertyId}`}>
                          <Link2 className="mr-1 h-3 w-3" />
                          View Matched Property
                        </a>
                      </Button>
                    )}
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={n.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="mr-1 h-3 w-3" />
                        Source
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExpand(n.id)}
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="mr-1 h-3 w-3" />
                          Hide Raw Text
                        </>
                      ) : (
                        <>
                          <ChevronDown className="mr-1 h-3 w-3" />
                          Show Raw Text
                        </>
                      )}
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="rounded-md border bg-muted/50 p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Raw Notice Text
                      </p>
                      <p className="text-sm whitespace-pre-wrap font-mono">
                        {n.rawText}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Summary */}
      <div className="text-sm text-muted-foreground">
        Showing {filtered.length} of {MOCK_NOTICES.length} notices
      </div>
    </div>
  );
}
