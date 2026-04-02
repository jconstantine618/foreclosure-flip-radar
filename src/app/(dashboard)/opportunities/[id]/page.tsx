"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Download,
  Star,
  MapPin,
  Calendar,
  Clock,
  Gavel,
  User,
  FileText,
  Plus,
  X,
  CheckSquare,
  Square,
  AlertTriangle,
  TrendingUp,
  Home,
  Tag,
} from "lucide-react";

// ---------- helpers ----------
function fmt(n: number) {
  return "$" + n.toLocaleString("en-US");
}

function scoreColor(score: number) {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

function scoreBg(score: number) {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

function daysUntil(dateStr: string) {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

// ---------- mock data ----------
const MOCK_PROPERTY = {
  id: "1",
  address: "104 Maple Creek Dr",
  city: "Greenville",
  county: "Greenville",
  state: "SC",
  zip: "29607",
  type: "Single Family" as const,
  beds: 3,
  baths: 2,
  sqft: 1850,
  yearBuilt: 1998,
  lotSize: "0.34 acres",
  parcelNumber: "0543-02-18-0042",
  lat: 34.8526,
  lng: -82.394,
  score: 88,
  stage: "AUCTION" as const,
  pipeline: "BID_READY" as const,

  // financials
  estimatedValue: 285000,
  mortgageBalance: 168000,
  estimatedEquity: 117000,
  equityPercent: 41,
  estimatedARV: 335000,
  estimatedRehab: 42000,
  maxAllowableOffer: 193500,
  targetPurchasePrice: 185000,
  projectedGrossMargin: 108000,
  projectedNetMargin: 72000,
  projectedDaysToFlip: 95,

  // foreclosure details
  caseNumber: "2025-CP-23-04821",
  filingDate: "2025-11-14",
  plaintiff: "First National Mortgage Corp",
  defendant: "James R. & Patricia M. Henderson",
  legalDescription: "Lot 42, Block B, Maple Creek Subdivision, Plat Book 84, Page 215, Greenville County RMC",
  depositTerms: "5% of bid due at sale, balance due within 30 days",
  court: "Greenville County Court of Common Pleas",
  saleDate: "2026-04-28",
  saleTime: "11:00 AM",

  // owner
  ownerName: "James R. Henderson",
  occupancyStatus: "Owner-Occupied",
  absenteeOwner: false,

  // auction
  auctionDate: "2026-04-28",
  auctionLocation: "Greenville County Courthouse, 305 E North St, Greenville, SC 29601",
  depositRequired: "$14,250 (5% of opening bid)",
  biddingInstructions: "Register with the Master-in-Equity office by 10:00 AM on sale day. Bring certified funds for deposit. Successful bidder must comply with the terms of sale posted at the courthouse.",

  // score breakdown
  scoreFactors: [
    { label: "Equity Position", score: 92 },
    { label: "Market Demand", score: 88 },
    { label: "Property Condition (est.)", score: 75 },
    { label: "Location Grade", score: 91 },
    { label: "Comp Support", score: 85 },
    { label: "Days on Market (area)", score: 82 },
    { label: "Rehab Complexity", score: 78 },
    { label: "Title Risk", score: 95 },
  ],

  hasCountyNotice: true,
};

const MOCK_TIMELINE = [
  { date: "2025-11-14", event: "Lis Pendens filed in Greenville County", source: "County Records" },
  { date: "2025-11-20", event: "Found in BatchData foreclosure search", source: "BatchData" },
  { date: "2025-12-03", event: "Matched to Greenville MIE notice", source: "County Notice" },
  { date: "2025-12-05", event: "Score calculated: 74", source: "System" },
  { date: "2026-01-15", event: "Property data enriched via ATTOM", source: "ATTOM" },
  { date: "2026-02-10", event: "Score updated to 82", source: "System" },
  { date: "2026-03-20", event: "Auction date set: April 28, 2026", source: "County Notice" },
  { date: "2026-03-22", event: "Score updated to 88 (auction confirmed)", source: "System" },
  { date: "2026-03-25", event: "Moved to BID_READY pipeline", source: "User" },
];

const MOCK_NOTES = [
  { id: "n1", author: "Mike T.", text: "Drove by the property - exterior looks solid, roof appears newer. Yard is overgrown but no major exterior damage visible.", timestamp: "2026-03-26 14:30" },
  { id: "n2", author: "Sarah K.", text: "Checked flood zone - property is in Zone X (minimal risk). Good to go.", timestamp: "2026-03-27 09:15" },
  { id: "n3", author: "Mike T.", text: "Spoke with contractor - rehab estimate $38K-$45K depending on kitchen scope. Using $42K as midpoint.", timestamp: "2026-03-28 16:45" },
];

const PIPELINE_OPTIONS = [
  { value: "NEW", label: "New" },
  { value: "RESEARCHING", label: "Researching" },
  { value: "BID_READY", label: "Bid Ready" },
  { value: "BID_SUBMITTED", label: "Bid Submitted" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
  { value: "CLOSED", label: "Closed" },
];

const STAGE_VARIANTS: Record<string, "default" | "warning" | "destructive" | "info" | "success" | "secondary"> = {
  PRE_FORECLOSURE: "warning",
  AUCTION: "destructive",
  REO: "info",
  BANK_OWNED: "secondary",
  SHORT_SALE: "success",
};

const STAGE_LABELS: Record<string, string> = {
  PRE_FORECLOSURE: "Pre-Foreclosure",
  AUCTION: "Auction",
  REO: "REO",
  BANK_OWNED: "Bank Owned",
  SHORT_SALE: "Short Sale",
};

export default function OpportunityDetailPage() {
  const p = MOCK_PROPERTY;

  const [pipeline, setPipeline] = useState(p.pipeline);
  const [rehabEstimate, setRehabEstimate] = useState(p.estimatedRehab);
  const [newNote, setNewNote] = useState("");
  const [notes, setNotes] = useState(MOCK_NOTES);
  const [tags, setTags] = useState(["high-equity", "greenville", "auction-ready", "drive-by-done"]);
  const [newTag, setNewTag] = useState("");
  const [checklist, setChecklist] = useState([
    { label: "Research title", checked: true },
    { label: "Drive by property", checked: true },
    { label: "Check flood zone", checked: true },
    { label: "Verify rehab estimate", checked: true },
    { label: "Confirm funding", checked: false },
    { label: "Review county bid procedures", checked: false },
    { label: "Set max bid", checked: false },
    { label: "Register for auction", checked: false },
  ]);

  // Derived financials based on rehab slider
  const maxAllowableOffer = Math.round(p.estimatedARV * 0.7 - rehabEstimate);
  const projectedGrossMargin = p.estimatedARV - p.targetPurchasePrice - rehabEstimate;
  const projectedNetMargin = Math.round(projectedGrossMargin * 0.67); // rough net after costs

  function addNote() {
    if (!newNote.trim()) return;
    setNotes((prev) => [
      { id: `n${Date.now()}`, author: "You", text: newNote.trim(), timestamp: new Date().toLocaleString() },
      ...prev,
    ]);
    setNewNote("");
  }

  function addTag() {
    if (!newTag.trim() || tags.includes(newTag.trim().toLowerCase())) return;
    setTags((prev) => [...prev, newTag.trim().toLowerCase()]);
    setNewTag("");
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  function toggleCheck(index: number) {
    setChecklist((prev) =>
      prev.map((item, i) => (i === index ? { ...item, checked: !item.checked } : item))
    );
  }

  const daysLeft = daysUntil(p.auctionDate);

  return (
    <div className="space-y-6">
      {/* ======== TOP BAR ======== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/opportunities">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Link>
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">{p.address}</h1>
            <p className="text-sm text-muted-foreground">
              {p.city}, {p.state} {p.zip} &middot; {p.county} County
            </p>
          </div>
          <Badge variant={STAGE_VARIANTS[p.stage]}>{STAGE_LABELS[p.stage]}</Badge>
          <Badge className={`${scoreBg(p.score)} text-white`}>{p.score}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="space-y-0">
            <Select value={pipeline} onValueChange={(v) => setPipeline(v as typeof pipeline)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PIPELINE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm">
            <Star className="mr-1 h-4 w-4" />
            Add to Watchlist
          </Button>
          <Button variant="outline" size="sm">
            <Download className="mr-1 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* ======== TWO COLUMN LAYOUT ======== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ---- LEFT COLUMN (2/3) ---- */}
        <div className="space-y-6 lg:col-span-2">
          {/* 1. Property Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Home className="h-5 w-5" />
                Property Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Address</p>
                  <p className="text-sm font-medium">{p.address}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">City</p>
                  <p className="text-sm">{p.city}, {p.state}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">County</p>
                  <p className="text-sm">{p.county}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Zip</p>
                  <p className="text-sm">{p.zip}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Type</p>
                  <p className="text-sm">{p.type}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Beds / Baths</p>
                  <p className="text-sm">{p.beds} BD / {p.baths} BA</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Sq Ft</p>
                  <p className="text-sm">{p.sqft.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Year Built</p>
                  <p className="text-sm">{p.yearBuilt}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Lot Size</p>
                  <p className="text-sm">{p.lotSize}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Parcel Number</p>
                  <p className="text-sm font-mono">{p.parcelNumber}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 2. Map Placeholder */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Location
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50">
                <div className="text-center text-muted-foreground">
                  <MapPin className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  <p className="text-sm font-medium">Map - Google Maps integration placeholder</p>
                  <p className="text-xs">{p.lat}, {p.lng}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 3. Photos Section */}
          <Card>
            <CardHeader>
              <CardTitle>Property Photos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="flex h-36 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50"
                  >
                    <p className="text-xs text-muted-foreground text-center px-2">
                      Property photos placeholder {i}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 4. Source Signals Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Source Signals Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative space-y-0">
                {MOCK_TIMELINE.slice().reverse().map((event, idx) => (
                  <div key={idx} className="relative flex gap-4 pb-6 last:pb-0">
                    {/* vertical line */}
                    {idx < MOCK_TIMELINE.length - 1 && (
                      <div className="absolute left-[7px] top-4 h-full w-px bg-gray-200" />
                    )}
                    {/* dot */}
                    <div className="relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-primary bg-white" />
                    {/* content */}
                    <div className="flex-1">
                      <p className="text-sm">{event.event}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{event.date}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {event.source}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 5. Foreclosure / Notice Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gavel className="h-5 w-5" />
                Foreclosure / Notice Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Case Number</p>
                  <p className="text-sm font-mono">{p.caseNumber}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Filing Date</p>
                  <p className="text-sm">{p.filingDate}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Plaintiff / Lender</p>
                  <p className="text-sm">{p.plaintiff}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Defendant / Borrower</p>
                  <p className="text-sm">{p.defendant}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium text-muted-foreground">Legal Description</p>
                  <p className="text-sm">{p.legalDescription}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Deposit Terms</p>
                  <p className="text-sm">{p.depositTerms}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Court</p>
                  <p className="text-sm">{p.court}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Sale Date</p>
                  <p className="text-sm font-medium">{p.saleDate}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Sale Time</p>
                  <p className="text-sm font-medium">{p.saleTime}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 6. Comps Module Placeholder */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Comparable Sales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-40 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50">
                <p className="text-sm text-muted-foreground">Comparable sales module - coming soon</p>
              </div>
            </CardContent>
          </Card>

          {/* 7. Notes Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Add a note..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                />
              </div>
              <Button size="sm" onClick={addNote} disabled={!newNote.trim()}>
                <Plus className="mr-1 h-3 w-3" />
                Add Note
              </Button>
              <Separator />
              <div className="space-y-3">
                {notes.map((note) => (
                  <div key={note.id} className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{note.author}</span>
                      <span className="text-xs text-muted-foreground">{note.timestamp}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{note.text}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ---- RIGHT COLUMN (1/3) ---- */}
        <div className="space-y-6">
          {/* 1. Flip Score Card */}
          <Card>
            <CardHeader>
              <CardTitle>Flip Score</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Large circular score */}
              <div className="flex justify-center">
                <div className="relative flex h-32 w-32 items-center justify-center">
                  <svg className="absolute h-full w-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="currentColor"
                      className="text-gray-200"
                      strokeWidth="8"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="currentColor"
                      className={scoreBg(p.score).replace("bg-", "text-")}
                      strokeWidth="8"
                      strokeDasharray={`${(p.score / 100) * 264} 264`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className={`text-3xl font-bold ${scoreColor(p.score)}`}>{p.score}</span>
                </div>
              </div>

              {/* Factor breakdown */}
              <div className="space-y-2.5">
                {p.scoreFactors.map((factor) => (
                  <div key={factor.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">{factor.label}</span>
                      <span className="text-xs font-medium">{factor.score}</span>
                    </div>
                    <Progress value={factor.score} className="h-1.5" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 2. Financial Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Financial Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Estimated Value</span>
                <span className="text-sm font-medium">{fmt(p.estimatedValue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Mortgage Balance</span>
                <span className="text-sm font-medium">{fmt(p.mortgageBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Estimated Equity</span>
                <span className="text-sm font-medium text-green-600">
                  {fmt(p.estimatedEquity)} ({p.equityPercent}%)
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Estimated ARV</span>
                <span className="text-sm font-medium">{fmt(p.estimatedARV)}</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Estimated Rehab</span>
                  <span className="text-sm font-medium">{fmt(rehabEstimate)}</span>
                </div>
                <Slider
                  value={[rehabEstimate]}
                  onValueChange={(v) => setRehabEstimate(v[0])}
                  min={10000}
                  max={100000}
                  step={1000}
                  className="mt-1"
                />
                <p className="text-[10px] text-muted-foreground">Adjust rehab estimate to recalculate</p>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Max Allowable Offer</span>
                <span className="text-sm font-bold">{fmt(maxAllowableOffer)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Target Purchase Price</span>
                <span className="text-sm font-medium">{fmt(p.targetPurchasePrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Projected Gross Margin</span>
                <span className="text-sm font-medium text-green-600">{fmt(projectedGrossMargin)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Projected Net Margin</span>
                <span className="text-sm font-bold text-green-600">{fmt(projectedNetMargin)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Projected Days to Flip</span>
                <span className="text-sm font-medium">{p.projectedDaysToFlip} days</span>
              </div>
            </CardContent>
          </Card>

          {/* 3. Owner Summary (gated) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Owner Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Owner Name</span>
                <span className="text-sm font-medium">{p.ownerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Occupancy Status</span>
                <span className="text-sm">{p.occupancyStatus}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Absentee Owner</span>
                <span className="text-sm">{p.absenteeOwner ? "Yes" : "No"}</span>
              </div>
              <Separator />
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-xs text-amber-800">
                    Contact data disabled by default. Owner contact information is restricted per data provider terms of service.
                    Enable in Settings if you have appropriate licensing.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 4. Auction Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Auction Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-center">
                <p className="text-lg font-bold text-red-700">{p.auctionDate}</p>
                <p className="text-sm text-red-600">
                  {daysLeft > 0
                    ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining`
                    : daysLeft === 0
                    ? "Today"
                    : "Auction passed"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Location</p>
                <p className="text-sm">{p.auctionLocation}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Deposit Required</p>
                <p className="text-sm">{p.depositRequired}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Bidding Instructions</p>
                <p className="text-sm text-muted-foreground">{p.biddingInstructions}</p>
              </div>
            </CardContent>
          </Card>

          {/* 5. Bid Checklist */}
          <Card>
            <CardHeader>
              <CardTitle>Bid Checklist</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {checklist.map((item, idx) => (
                  <button
                    key={idx}
                    className="flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-muted/50 transition-colors"
                    onClick={() => toggleCheck(idx)}
                  >
                    {item.checked ? (
                      <CheckSquare className="h-4 w-4 shrink-0 text-green-600" />
                    ) : (
                      <Square className="h-4 w-4 shrink-0 text-gray-400" />
                    )}
                    <span
                      className={`text-sm ${
                        item.checked ? "text-muted-foreground line-through" : ""
                      }`}
                    >
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {checklist.filter((c) => c.checked).length} of {checklist.length} complete
              </p>
            </CardContent>
          </Card>

          {/* 6. Tags */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Tags
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="ml-0.5 rounded-full hover:bg-gray-300/50"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add tag..."
                  className="h-8 text-sm"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                />
                <Button size="sm" variant="outline" className="h-8" onClick={addTag}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
