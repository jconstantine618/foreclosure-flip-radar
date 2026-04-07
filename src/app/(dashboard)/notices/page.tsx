"use client";

import { useState, useMemo, useEffect } from "react";
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

// ---------- helper functions ----------
function distressStageToNoticeType(
  distressStage: string
): NoticeType {
  const mapping: Record<string, NoticeType> = {
    AUCTION: "MIE",
    LIS_PENDENS: "Lis Pendens",
    TAX_LIEN: "Tax Sale",
    PRE_FORECLOSURE: "Public Notice",
    BANK_OWNED: "Public Notice",
    REO: "Public Notice",
  };
  return mapping[distressStage] || "Public Notice";
}

// ---------- API types ----------
interface OpportunityProperty {
  streetAddress: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  zipCode: string | null;
  estimatedValue: number | null;
  equityEstimate: number | null;
}

interface Opportunity {
  id: string;
  flipScore: number | null;
  distressStage: string;
  pipelineStage: string;
  auctionDate: string | null;
  createdAt: string;
  propertyId: string | null;
  property: OpportunityProperty;
}

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
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch opportunities and convert to notices
  useEffect(() => {
    async function fetchNotices() {
      try {
        setLoading(true);
        const response = await fetch(
          "/api/opportunities?limit=100&sort=auctionDate&order=asc"
        );
        if (!response.ok) throw new Error("Failed to fetch opportunities");
        const data = await response.json();
        const opportunities: Opportunity[] = data.data || data.opportunities || [];

        // Map opportunities to notices
        const mappedNotices: Notice[] = opportunities.map((opp) => {
          const fullAddress =
            opp.property?.streetAddress &&
            opp.property?.city &&
            opp.property?.state &&
            opp.property?.zipCode
              ? `${opp.property.streetAddress}, ${opp.property.city}, ${opp.property.state} ${opp.property.zipCode}`
              : null;

          return {
            id: opp.id,
            noticeType: distressStageToNoticeType(opp.distressStage),
            county: opp.property?.county || "Unknown",
            caseNumber: `FFR-${opp.id.slice(-8).toUpperCase()}`,
            address: fullAddress,
            plaintiff: "Lender",
            defendant: "Borrower",
            saleDate: opp.auctionDate
              ? opp.auctionDate.split("T")[0]
              : opp.createdAt.split("T")[0],
            matchedPropertyId: opp.propertyId,
            sourceUrl: "#",
            rawText: `Foreclosure notice for property at ${fullAddress || "Unknown address"}. Stage: ${opp.distressStage}. Flip score: ${opp.flipScore || "N/A"}.`,
            publishedDate: opp.createdAt.split("T")[0],
          };
        });

        setNotices(mappedNotices);
      } catch (error) {
        console.error("Error fetching notices:", error);
        setNotices([]);
      } finally {
        setLoading(false);
      }
    }

    fetchNotices();
  }, []);

  const filtered = useMemo(() => {
    return notices.filter((n) => {
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
      {loading ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">Loading notices...</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
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
        Showing {filtered.length} of {notices.length} notices
      </div>
    </div>
  );
}
