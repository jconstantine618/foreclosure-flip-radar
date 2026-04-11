"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
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
  Brain,
  Loader2,
  RefreshCw,
  Camera,
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

// ---------- county-specific auction defaults ----------
const COUNTY_AUCTION_DEFAULTS: Record<string, {
  location: string;
  depositRequired: string;
  biddingInstructions: string;
  depositTerms: string;
  complianceDeadline: string;
  upsetBidInfo: string;
  deedWarning: string;
  contactInfo: string;
}> = {
  Greenville: {
    location: "Courtroom 5, 3rd Floor, Greenville County Courthouse (Judicial Wing), 305 E. North St, Greenville, SC 29601",
    depositRequired: "5% of bid in cash or certified check — due immediately when bid is accepted. You cannot leave and return with funds.",
    biddingInstructions: "Sales held 1st Monday of each month at 11:00 AM (Tuesday if Monday is a holiday). No pre-registration required. Successful bidder must stay to register after sale. Bring 5% of your max bid in cash or certified check.",
    depositTerms: "5% cash or certified check at time of sale. Balance due within 20 days plus interim interest at rate stated in Notice of Sale, plus $25 deed preparation fee.",
    complianceDeadline: "20 days from sale date. Balance + interim interest + $25 deed fee. Contact Jennifer Boehmke at 864-467-8663 for total amount due.",
    upsetBidInfo: "If lender reserves right to deficiency judgment, bidding remains open 30 days after sale for upset bids. Many lenders waive this — check the Foreclosure Order.",
    deedWarning: "Not a general warranty deed. Title opinion from a licensed attorney recommended before bidding. Sold subject to past-due taxes, assessments, easements, and restrictions of record.",
    contactInfo: "MIE Office: 864-467-8770 | Compliance: Jennifer Boehmke 864-467-8663",
  },
  Horry: {
    location: "Horry County Master in Equity, Conway, SC",
    depositRequired: "5% of bid in certified funds",
    biddingInstructions: "Check horrycountysc.gov/departments/master-in-equity for current schedule and procedures.",
    depositTerms: "5% certified funds at time of sale.",
    complianceDeadline: "Per Foreclosure Order — typically 20-30 days.",
    upsetBidInfo: "30-day upset bid period if lender reserves deficiency judgment.",
    deedWarning: "Not a general warranty deed. Title opinion recommended before bidding.",
    contactInfo: "Horry County MIE Office",
  },
  Georgetown: {
    location: "Georgetown County Courthouse, Georgetown, SC",
    depositRequired: "5% of bid in certified funds",
    biddingInstructions: "Check Georgetown County MIE office for current schedule and procedures.",
    depositTerms: "5% certified funds at time of sale.",
    complianceDeadline: "Per Foreclosure Order — typically 20-30 days.",
    upsetBidInfo: "30-day upset bid period if lender reserves deficiency judgment.",
    deedWarning: "Not a general warranty deed. Title opinion recommended before bidding.",
    contactInfo: "Georgetown County MIE Office",
  },
};

// ---------- property type label map ----------
const PROPERTY_TYPE_LABELS: Record<string, string> = {
  SINGLE_FAMILY: "Single Family",
  MULTI_FAMILY: "Multi-Family",
  CONDO: "Condo",
  TOWNHOUSE: "Townhouse",
  COMMERCIAL: "Commercial",
  LAND: "Land",
  OTHER: "Other",
};

const PIPELINE_OPTIONS = [
  { value: "NEW", label: "New" },
  { value: "REVIEWING", label: "Reviewing" },
  { value: "DRIVE_BY", label: "Drive By" },
  { value: "UNDERWRITING", label: "Underwriting" },
  { value: "BID_READY", label: "Bid Ready" },
  { value: "PASSED", label: "Passed" },
  { value: "WON", label: "Won" },
  { value: "DISPOSITION", label: "Disposition" },
];

const STAGE_VARIANTS: Record<string, "default" | "warning" | "destructive" | "info" | "success" | "secondary"> = {
  PRE_FORECLOSURE: "warning",
  AUCTION: "destructive",
  REO: "info",
  TAX_LIEN: "warning",
  LIS_PENDENS: "warning",
  BANK_OWNED: "secondary",
  OTHER: "secondary",
};

const STAGE_LABELS: Record<string, string> = {
  PRE_FORECLOSURE: "Pre-Foreclosure",
  AUCTION: "Auction",
  REO: "REO",
  TAX_LIEN: "Tax Lien",
  LIS_PENDENS: "Lis Pendens",
  BANK_OWNED: "Bank Owned",
  OTHER: "Other",
};

export default function OpportunityDetailPage() {
  const params = useParams();
  const oppId = params.id as string;

  // API data state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiData, setApiData] = useState<any>(null);

  // UI state
  const [pipeline, setPipeline] = useState<string>("");
  const [rehabEstimate, setRehabEstimate] = useState(35000);
  const [rehabPreset, setRehabPreset] = useState<string>("medium");
  const [arvSource, setArvSource] = useState<"median" | "mean" | "conservative" | "custom">("median");
  const [customArv, setCustomArv] = useState<number>(0);
  const [rulePercent, setRulePercent] = useState(70);
  const [holdingMonths, setHoldingMonths] = useState(6);
  const [monthlyHoldingCost, setMonthlyHoldingCost] = useState(1500);
  const [closingCostPercent, setClosingCostPercent] = useState(8);
  const [newNote, setNewNote] = useState("");
  const [notes, setNotes] = useState<any[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [checklist, setChecklist] = useState([
    { label: "Research title", checked: false },
    { label: "Drive by property", checked: false },
    { label: "Check flood zone", checked: false },
    { label: "Verify rehab estimate", checked: false },
    { label: "Confirm funding", checked: false },
    { label: "Review county bid procedures", checked: false },
    { label: "Set max bid", checked: false },
    { label: "Register for auction", checked: false },
  ]);

  // AI Analysis state
  const [analysis, setAnalysis] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [savingStage, setSavingStage] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  // Comps state
  const [comps, setComps] = useState<any[]>([]);
  const [compsLoading, setCompsLoading] = useState(false);
  const [compsError, setCompsError] = useState<string | null>(null);
  const [arvStats, setArvStats] = useState<any>(null);
  const [driveByPhotos, setDriveByPhotos] = useState<Array<{url: string; label: string; date: string}>>([]);

  // Fetch opportunity data
  useEffect(() => {
    const fetchOpportunity = async () => {
      try {
        const res = await fetch(`/api/opportunities/${oppId}`);
        if (!res.ok) {
          throw new Error("Failed to fetch opportunity");
        }
        const json = await res.json();
        setApiData(json.data);
        setPipeline(json.data.pipelineStage || "NEW");
        if (json.data.estimatedRehabCost) {
          setRehabEstimate(json.data.estimatedRehabCost);
          setRehabPreset(""); // clear preset since DB value won't match a preset
        }

        // Load persisted notes + AI analysis from opportunity.notes JSON field
        let persistedNotes: any[] = [];
        let persistedAnalysis: any = null;
        try {
          const stored = json.data.notes ? JSON.parse(json.data.notes) : null;
          if (stored) {
            persistedNotes = stored.userNotes || [];
            persistedAnalysis = stored.aiAnalysis || null;
          }
        } catch {
          // notes field isn't JSON — ignore
        }
        // Merge property.notes (from DB Note model) with persisted user notes
        const dbNotes = (json.data.property?.notes || []).map((n: any) => ({
          id: n.id,
          author: "System",
          text: n.content,
          timestamp: new Date(n.createdAt).toLocaleString(),
        }));
        setNotes([...persistedNotes, ...dbNotes]);
        if (persistedAnalysis) setAnalysis(persistedAnalysis);
        setTags([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    if (oppId) {
      fetchOpportunity();
    }
  }, [oppId]);

  // Persist notes + AI analysis to the opportunity.notes JSON field
  async function persistData(updatedNotes?: any[], updatedAnalysis?: any) {
    const notesToSave = updatedNotes ?? notes;
    const analysisToSave = updatedAnalysis ?? analysis;
    const payload = JSON.stringify({
      userNotes: notesToSave.filter((n: any) => n.author !== "System"),
      aiAnalysis: analysisToSave,
    });
    try {
      await fetch(`/api/opportunities/${oppId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: payload }),
      });
    } catch (err) {
      console.error("Failed to persist data:", err);
    }
  }

  // Save pipeline stage to database
  async function handleStageChange(newStage: string) {
    setPipeline(newStage);
    setSavingStage(true);
    try {
      const res = await fetch(`/api/opportunities/${oppId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineStage: newStage }),
      });
      if (!res.ok) throw new Error("Failed to save stage");
    } catch (err) {
      console.error("Failed to update stage:", err);
    } finally {
      setSavingStage(false);
    }
  }

  // Trigger AI analysis
  async function runAnalysis() {
    if (!apiData?.propertyId) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const res = await fetch(`/api/properties/${apiData.propertyId}/analysis`);
      if (!res.ok) throw new Error("Analysis request failed");
      const json = await res.json();
      const result = json.data?.analysis || json;
      setAnalysis(result);
      // Persist AI analysis to database
      await persistData(undefined, result);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function fetchComps(refresh = false) {
    if (!apiData?.propertyId) return;
    setCompsLoading(true);
    setCompsError(null);
    try {
      const res = await fetch(`/api/properties/${apiData.propertyId}/comps${refresh ? "?refresh=true" : ""}`);
      if (!res.ok) throw new Error("Failed to fetch comps");
      const json = await res.json();
      setComps(json.data?.comps || []);
      setArvStats(json.data?.arv || null);
    } catch (err) {
      setCompsError(err instanceof Error ? err.message : "Failed to fetch comps");
    } finally {
      setCompsLoading(false);
    }
  }

  // Auto-fetch comps when opportunity data loads
  useEffect(() => {
    if (apiData?.propertyId) {
      fetchComps(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiData?.propertyId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-lg text-muted-foreground">Loading opportunity...</p>
      </div>
    );
  }

  if (error || !apiData) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/opportunities">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-600">Error: {error || "Opportunity not found"}</p>
        </div>
      </div>
    );
  }

  // Build property object from API data
  const p = {
    id: apiData.propertyId,
    address: apiData.property?.streetAddress || "N/A",
    city: apiData.property?.city || "N/A",
    county: apiData.property?.county || "N/A",
    state: apiData.property?.state || "N/A",
    zip: apiData.property?.zipCode || "N/A",
    type: PROPERTY_TYPE_LABELS[apiData.property?.propertyType] || apiData.property?.propertyType || "N/A",
    beds: apiData.property?.bedrooms || "N/A",
    baths: apiData.property?.bathrooms || "N/A",
    sqft: apiData.property?.sqft || "N/A",
    yearBuilt: apiData.property?.yearBuilt || "N/A",
    lotSize: "N/A",
    parcelNumber: "N/A",
    lat: apiData.property?.latitude || null,
    lng: apiData.property?.longitude || null,
    score: apiData.flipScore || 0,
    stage: apiData.distressStage || "OTHER",
    pipeline: apiData.pipelineStage || "NEW",

    // financials
    estimatedValue: apiData.property?.estimatedValue || 0,
    mortgageBalance: apiData.property?.mortgageBalance || 0,
    estimatedEquity: apiData.property?.equityEstimate || 0,
    equityPercent: apiData.property?.equityEstimate && apiData.property?.estimatedValue
      ? Math.round((apiData.property.equityEstimate / apiData.property.estimatedValue) * 100)
      : 0,
    estimatedARV: apiData.estimatedARV || 0,
    estimatedRehab: apiData.estimatedRehabCost || 0,
    maxAllowableOffer: apiData.maxAllowableOffer || 0,
    targetPurchasePrice: apiData.maxAllowableOffer || 0,
    projectedGrossMargin: (apiData.estimatedARV || 0) - (apiData.maxAllowableOffer || 0) - (apiData.estimatedRehabCost || 0),
    projectedNetMargin: Math.round(((apiData.estimatedARV || 0) - (apiData.maxAllowableOffer || 0) - (apiData.estimatedRehabCost || 0)) * 0.67),
    projectedDaysToFlip: 90,

    // flood zone data
    floodZoneCode: apiData.property?.floodZoneCode || null,
    floodZoneDesc: apiData.property?.floodZoneDesc || null,
    baseFloodElevation: apiData.property?.baseFloodElevation || null,
    specialFloodHazard: apiData.property?.specialFloodHazard || false,

    // enhanced GIS data (Phase 2)
    zoningCode: apiData.property?.zoningCode || null,
    zoningDescription: apiData.property?.zoningDescription || null,
    schoolDistrict: apiData.property?.schoolDistrict || null,
    waterService: apiData.property?.waterService || null,
    sewerService: apiData.property?.sewerService || null,
    fireDistrict: apiData.property?.fireDistrict || null,

    // public records links (Phase 3)
    courtIndexUrl: apiData.property?.countyNotices?.[0]?.courtIndexUrl || null,
    rodSearchUrl: apiData.property?.countyNotices?.[0]?.rodSearchUrl || null,
    taxPortalUrl: apiData.property?.countyNotices?.[0]?.taxPortalUrl || null,

    // census ACS demographics (Phase 4)
    censusTract: apiData.property?.censusTract || null,
    medianHouseholdIncome: apiData.property?.medianHouseholdIncome || null,
    medianHomeValue: apiData.property?.medianHomeValue || null,
    vacancyRate: apiData.property?.vacancyRate || null,
    ownerOccupiedRate: apiData.property?.ownerOccupiedRate || null,
    medianGrossRent: apiData.property?.medianGrossRent || null,

    // foreclosure details (from county notices + county defaults)
    caseNumber: apiData.property?.countyNotices?.[0]?.caseNumber || "N/A",
    filingDate: apiData.property?.countyNotices?.[0]?.createdAt
      ? new Date(apiData.property.countyNotices[0].createdAt).toISOString().split('T')[0]
      : "N/A",
    plaintiff: apiData.property?.countyNotices?.[0]?.plaintiff || "N/A",
    defendant: apiData.property?.countyNotices?.[0]?.defendant || "N/A",
    lawFirm: apiData.property?.countyNotices?.[0]?.lawFirm || "N/A",
    legalDescription: apiData.property?.countyNotices?.[0]?.legalDescription || "N/A",
    depositTerms: apiData.property?.countyNotices?.[0]?.depositTerms
      || COUNTY_AUCTION_DEFAULTS[apiData.property?.county || ""]?.depositTerms
      || "N/A",
    court: `${apiData.property?.county || ""} County Master in Equity`.trim() || "N/A",
    saleDate: apiData.auctionDate ? new Date(apiData.auctionDate).toISOString().split('T')[0] : "N/A",
    saleTime: apiData.property?.countyNotices?.[0]?.saleTime || "11:00 AM",
    complianceDeadline: COUNTY_AUCTION_DEFAULTS[apiData.property?.county || ""]?.complianceDeadline || "N/A",
    upsetBidInfo: COUNTY_AUCTION_DEFAULTS[apiData.property?.county || ""]?.upsetBidInfo || "N/A",
    deedWarning: COUNTY_AUCTION_DEFAULTS[apiData.property?.county || ""]?.deedWarning || null,
    contactInfo: COUNTY_AUCTION_DEFAULTS[apiData.property?.county || ""]?.contactInfo || null,

    // owner
    ownerName: apiData.property?.ownerName || apiData.property?.countyNotices?.[0]?.defendant || "N/A",
    occupancyStatus: apiData.property?.ownerOccupied ? "Owner-Occupied" : "Non-Owner-Occupied",
    absenteeOwner: apiData.property?.absenteeOwner || false,

    // auction (use county defaults)
    auctionDate: apiData.auctionDate ? new Date(apiData.auctionDate).toISOString().split('T')[0] : "N/A",
    auctionLocation: COUNTY_AUCTION_DEFAULTS[apiData.property?.county || ""]?.location || "N/A",
    depositRequired: COUNTY_AUCTION_DEFAULTS[apiData.property?.county || ""]?.depositRequired || "N/A",
    biddingInstructions: COUNTY_AUCTION_DEFAULTS[apiData.property?.county || ""]?.biddingInstructions || "N/A",

    // score breakdown
    scoreFactors: [
      { label: "Overall Score", score: apiData.flipScore || 0 },
      { label: "Market Appeal", score: Math.max(50, (apiData.flipScore || 0) - 5) },
      { label: "Financial Viability", score: Math.max(50, (apiData.flipScore || 0) - 8) },
      { label: "Equity Position", score: Math.max(50, (apiData.flipScore || 0) - 3) },
      { label: "Location Grade", score: Math.max(50, (apiData.flipScore || 0) - 6) },
      { label: "Title Risk", score: Math.max(50, (apiData.flipScore || 0) + 2) },
    ],

    hasCountyNotice: true,
  };

  // --- Deal Analyzer: derived financials ---
  const liveArv =
    arvSource === "custom" ? customArv
    : arvSource === "mean" ? (arvStats?.mean || p.estimatedARV)
    : arvSource === "conservative" ? (arvStats?.low || Math.round((arvStats?.median || p.estimatedARV) * 0.9))
    : (arvStats?.median || p.estimatedARV); // default: median

  const maxAllowableOffer = Math.round(liveArv * (rulePercent / 100) - rehabEstimate);
  const holdingCosts = holdingMonths * monthlyHoldingCost;
  const closingCosts = Math.round(liveArv * (closingCostPercent / 100));
  const totalCostBasis = maxAllowableOffer + rehabEstimate + holdingCosts + closingCosts;
  const projectedGrossProfit = liveArv - totalCostBasis;
  const roi = totalCostBasis > 0 ? Math.round((projectedGrossProfit / totalCostBasis) * 100) : 0;
  const cashNeeded = maxAllowableOffer + rehabEstimate + holdingCosts;
  const dealVerdict = projectedGrossProfit >= 30000 ? "GO" : projectedGrossProfit >= 15000 ? "MAYBE" : "NO-GO";

  // Legacy aliases for anything else referencing these
  const projectedGrossMargin = projectedGrossProfit;
  const projectedNetMargin = Math.round(projectedGrossProfit * 0.67);

  async function addNote() {
    if (!newNote.trim()) return;
    const note = { id: `n${Date.now()}`, author: "You", text: newNote.trim(), timestamp: new Date().toLocaleString() };
    const updatedNotes = [note, ...notes];
    setNotes(updatedNotes);
    setNewNote("");
    setSavingNotes(true);
    await persistData(updatedNotes);
    setSavingNotes(false);
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

  const daysLeft = typeof p.auctionDate === "string" && p.auctionDate !== "N/A" ? daysUntil(p.auctionDate) : -1;

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
            <Select value={pipeline} onValueChange={(v) => handleStageChange(v)}>
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
              {p.lat && p.lng ? (
                <div className="relative h-64 w-full overflow-hidden rounded-lg border">
                  {process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ? (
                    <iframe
                      title="Property Location"
                      width="100%"
                      height="100%"
                      style={{ border: 0 }}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&q=${encodeURIComponent(p.address + ", " + p.city + ", " + p.state + " " + p.zip)}&center=${p.lat},${p.lng}&zoom=16&maptype=satellite`}
                    />
                  ) : (
                    <iframe
                      title="Property Location"
                      width="100%"
                      height="100%"
                      style={{ border: 0 }}
                      loading="lazy"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(p.lng) - 0.005},${Number(p.lat) - 0.003},${Number(p.lng) + 0.005},${Number(p.lat) + 0.003}&layer=mapnik&marker=${p.lat},${p.lng}`}
                    />
                  )}
                  <div className="absolute bottom-2 right-2">
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded bg-white/90 px-2 py-1 text-xs font-medium text-gray-700 shadow hover:bg-white"
                    >
                      <MapPin className="h-3 w-3" />
                      Open in Google Maps
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50">
                  <div className="text-center text-muted-foreground">
                    <MapPin className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    <p className="text-sm font-medium">No coordinates available</p>
                    <p className="text-xs">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address + ", " + p.city + ", " + p.state + " " + p.zip)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Search on Google Maps →
                      </a>
                    </p>
                  </div>
                </div>
              )}

              {/* Flood Zone Banner */}
              {p.floodZoneCode && (
                <div className={`mt-3 rounded-lg border p-3 ${
                  p.specialFloodHazard
                    ? "border-red-300 bg-red-50"
                    : p.floodZoneCode === "X"
                    ? "border-green-200 bg-green-50"
                    : "border-amber-200 bg-amber-50"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold ${
                        p.specialFloodHazard
                          ? "bg-red-600 text-white"
                          : p.floodZoneCode === "X"
                          ? "bg-green-600 text-white"
                          : "bg-amber-500 text-white"
                      }`}>
                        Zone {p.floodZoneCode}
                      </span>
                      <span className={`text-sm font-medium ${
                        p.specialFloodHazard ? "text-red-800" : p.floodZoneCode === "X" ? "text-green-800" : "text-amber-800"
                      }`}>
                        {p.floodZoneDesc}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {p.baseFloodElevation && (
                        <span className="text-muted-foreground">BFE: {p.baseFloodElevation} ft</span>
                      )}
                      {p.specialFloodHazard && (
                        <span className="font-semibold text-red-700">Flood Insurance Required</span>
                      )}
                    </div>
                  </div>
                  {p.specialFloodHazard && (
                    <p className="mt-1.5 text-xs text-red-700">
                      This property is in a Special Flood Hazard Area (SFHA). Federally-backed mortgages require flood insurance, typically $2,000-5,000/yr. Factor into holding costs and buyer qualification.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 2b. Zoning & Services (Phase 2) */}
          {(p.zoningCode || p.schoolDistrict || p.fireDistrict || p.waterService || p.sewerService) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Home className="h-5 w-5" />
                  Zoning &amp; Services
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
                  {p.zoningCode && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Zoning</p>
                      <p className="text-sm font-semibold">{p.zoningCode}</p>
                      {p.zoningDescription && <p className="text-xs text-muted-foreground">{p.zoningDescription}</p>}
                    </div>
                  )}
                  {p.schoolDistrict && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">School District</p>
                      <p className="text-sm">{p.schoolDistrict}</p>
                    </div>
                  )}
                  {p.fireDistrict && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Fire District</p>
                      <p className="text-sm">{p.fireDistrict}</p>
                    </div>
                  )}
                  {p.waterService && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Water</p>
                      <p className="text-sm">{p.waterService}</p>
                    </div>
                  )}
                  {p.sewerService && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Sewer</p>
                      <p className="text-sm">{p.sewerService}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 2c. Neighborhood Demographics (Phase 4) */}
          {p.censusTract && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Neighborhood Demographics
                  <Badge variant="secondary" className="text-xs">Tract {p.censusTract}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
                  {p.medianHouseholdIncome && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Median Household Income</p>
                      <p className="text-sm font-semibold">{fmt(p.medianHouseholdIncome)}</p>
                    </div>
                  )}
                  {p.medianHomeValue && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Median Home Value</p>
                      <p className="text-sm font-semibold">{fmt(p.medianHomeValue)}</p>
                    </div>
                  )}
                  {p.medianGrossRent && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Median Gross Rent</p>
                      <p className="text-sm">{fmt(p.medianGrossRent)}/mo</p>
                    </div>
                  )}
                  {p.ownerOccupiedRate !== null && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Owner-Occupied Rate</p>
                      <p className="text-sm">{Math.round(p.ownerOccupiedRate * 100)}%</p>
                    </div>
                  )}
                  {p.vacancyRate !== null && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Vacancy Rate</p>
                      <p className={`text-sm ${p.vacancyRate > 0.15 ? "text-red-600 font-semibold" : ""}`}>
                        {Math.round(p.vacancyRate * 100)}%
                        {p.vacancyRate > 0.15 && " (High)"}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 3. Photos Section — Street View + Drive-By Uploads */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Property Photos</CardTitle>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
                  <Camera className="h-3.5 w-3.5" />
                  Upload Drive-By Photos
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = e.target.files;
                      if (!files || !apiData?.propertyId) return;
                      const newPhotos: Array<{url: string; label: string; date: string}> = [];
                      for (const file of Array.from(files)) {
                        const reader = new FileReader();
                        const dataUrl = await new Promise<string>((resolve) => {
                          reader.onload = () => resolve(reader.result as string);
                          reader.readAsDataURL(file);
                        });
                        newPhotos.push({
                          url: dataUrl,
                          label: `Drive-By: ${file.name}`,
                          date: new Date().toLocaleDateString(),
                        });
                      }
                      setDriveByPhotos((prev) => [...prev, ...newPhotos]);
                    }}
                  />
                </label>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {/* Street View — auto-loaded from Google */}
                {p.lat && p.lng && (
                  <div className="relative col-span-2 row-span-2 overflow-hidden rounded-lg border bg-gray-100">
                    <img
                      src={`https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${p.lat},${p.lng}&fov=90&heading=0&pitch=5&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ""}`}
                      alt={`Street View of ${p.address}`}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                        (e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="flex h-full items-center justify-center p-4 text-center text-xs text-gray-400">Street View not available for this location</div>';
                      }}
                    />
                    <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                      Google Street View
                    </div>
                  </div>
                )}

                {/* Additional Street View angles */}
                {p.lat && p.lng && [90, 180, 270].map((heading) => (
                  <div key={heading} className="relative overflow-hidden rounded-lg border bg-gray-100">
                    <img
                      src={`https://maps.googleapis.com/maps/api/streetview?size=300x200&location=${p.lat},${p.lng}&fov=90&heading=${heading}&pitch=5&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ""}`}
                      alt={`Street View ${heading}°`}
                      className="h-36 w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).parentElement!.style.display = "none";
                      }}
                    />
                    <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                      {heading}° view
                    </div>
                  </div>
                ))}

                {/* Drive-By uploaded photos */}
                {driveByPhotos.map((photo, idx) => (
                  <div key={`driveby-${idx}`} className="relative overflow-hidden rounded-lg border border-blue-200 bg-blue-50">
                    <img
                      src={photo.url}
                      alt={photo.label}
                      className="h-36 w-full object-cover"
                    />
                    <div className="absolute bottom-1 left-1 rounded bg-blue-600/80 px-1.5 py-0.5 text-[10px] text-white">
                      Drive-By · {photo.date}
                    </div>
                  </div>
                ))}

                {/* Placeholder for adding more photos when none uploaded */}
                {driveByPhotos.length === 0 && (
                  <div className="flex h-36 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50">
                    <div className="text-center text-muted-foreground px-2">
                      <Camera className="mx-auto mb-1 h-5 w-5 opacity-40" />
                      <p className="text-[10px]">Upload drive-by photos</p>
                    </div>
                  </div>
                )}
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
                {[
                  { date: apiData.createdAt ? new Date(apiData.createdAt).toISOString().split('T')[0] : "N/A", event: "Opportunity created", source: "System" },
                  apiData.auctionDate ? { date: new Date(apiData.auctionDate).toISOString().split('T')[0], event: "Auction scheduled", source: "County" } : null,
                  { date: apiData.updatedAt ? new Date(apiData.updatedAt).toISOString().split('T')[0] : "N/A", event: "Last updated", source: "System" },
                ].filter(Boolean).map((event: any, idx: number) => (
                  <div key={idx} className="relative flex gap-4 pb-6 last:pb-0">
                    {/* vertical line */}
                    {idx < 2 && (
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
                  <p className="text-xs font-medium text-muted-foreground">Law Firm</p>
                  <p className="text-sm">{p.lawFirm}</p>
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
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium text-muted-foreground">Compliance Deadline</p>
                  <p className="text-sm">{p.complianceDeadline}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium text-muted-foreground">Upset Bid Period</p>
                  <p className="text-sm">{p.upsetBidInfo}</p>
                </div>
              </div>

              {/* Deed Warning */}
              {p.deedWarning && (
                <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-amber-800">Deed & Title Warning</p>
                      <p className="text-xs text-amber-700 mt-0.5">{p.deedWarning}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Contact Info */}
              {p.contactInfo && (
                <div className="mt-3 text-xs text-muted-foreground">
                  {p.contactInfo}
                </div>
              )}

              {/* Public Records Links */}
              {(p.courtIndexUrl || p.rodSearchUrl || p.taxPortalUrl) && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">PUBLIC RECORDS</p>
                  <div className="flex flex-wrap gap-2">
                    {p.courtIndexUrl && (
                      <a href={p.courtIndexUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="text-xs">
                          <FileText className="mr-1 h-3 w-3" />
                          Court Index
                        </Button>
                      </a>
                    )}
                    {p.rodSearchUrl && (
                      <a href={p.rodSearchUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="text-xs">
                          <FileText className="mr-1 h-3 w-3" />
                          Register of Deeds
                        </Button>
                      </a>
                    )}
                    {p.taxPortalUrl && (
                      <a href={p.taxPortalUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="text-xs">
                          <Tag className="mr-1 h-3 w-3" />
                          Tax Portal
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 6. Comparable Sales */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Comparable Sales
                  {comps.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{comps.length} comps</Badge>
                  )}
                </CardTitle>
                <div className="flex gap-2">
                  {comps.length > 0 && (
                    <Button size="sm" variant="outline" onClick={() => fetchComps(true)} disabled={compsLoading}>
                      <RefreshCw className={`mr-1 h-3 w-3 ${compsLoading ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                  )}
                  {comps.length === 0 && !compsLoading && (
                    <Button size="sm" onClick={() => fetchComps(false)} disabled={compsLoading}>
                      <TrendingUp className="mr-1 h-4 w-4" />
                      Fetch Comps
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {compsLoading && (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                  <p className="text-sm text-muted-foreground">Fetching comparable sales...</p>
                </div>
              )}

              {compsError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  {compsError}
                  <Button size="sm" variant="ghost" className="ml-2" onClick={() => fetchComps(false)}>
                    Retry
                  </Button>
                </div>
              )}

              {!compsLoading && comps.length === 0 && !compsError && !arvStats?.median && (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground mb-3">
                    Pull comparable sales to estimate ARV and validate your deal economics.
                  </p>
                  <Button onClick={() => fetchComps(false)} disabled={compsLoading}>
                          <TrendingUp className="mr-2 h-4 w-4" />
                    Fetch Comparable Sales
                  </Button>
                </div>
              )}

              {!compsLoading && comps.length === 0 && !compsError && arvStats?.median && (
                <div className="text-center py-3">
                  <p className="text-xs text-amber-600">
                    No comparable sales found nearby. ARV is based on property valuation records.
                  </p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => fetchComps(true)} disabled={compsLoading}>
                    <RefreshCw className="mr-1 h-3 w-3" />
                    Try Again
                  </Button>
                </div>
              )}

              {/* ARV Summary */}
              {arvStats && (
                <div className="rounded-lg border bg-green-50 border-green-200 p-4">
                  <h4 className="text-sm font-semibold text-green-800 mb-2">After Repair Value (ARV)</h4>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-green-600">Median</p>
                      <p className="text-lg font-bold text-green-800">${arvStats.median?.toLocaleString() || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-green-600">Mean</p>
                      <p className="text-lg font-bold text-green-800">${arvStats.mean?.toLocaleString() || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-green-600">Range</p>
                      <p className="text-sm font-medium text-green-800">
                        ${arvStats.low?.toLocaleString() || "?"} – ${arvStats.high?.toLocaleString() || "?"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-green-600">$/SqFt</p>
                      <p className="text-lg font-bold text-green-800">${arvStats.medianPricePerSqft?.toLocaleString() || "N/A"}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Comps Table */}
              {comps.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-3">Address</th>
                        <th className="pb-2 pr-3">Sale Price</th>
                        <th className="pb-2 pr-3">Sale Date</th>
                        <th className="pb-2 pr-3">SqFt</th>
                        <th className="pb-2 pr-3">Bed/Bath</th>
                        <th className="pb-2 pr-3">$/SqFt</th>
                        <th className="pb-2">Distance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comps.map((c: any, i: number) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            <div className="font-medium">{c.address}</div>
                            <div className="text-xs text-muted-foreground">{c.city}, {c.state} {c.zipCode}</div>
                          </td>
                          <td className="py-2 pr-3 font-medium">${c.salePrice?.toLocaleString()}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{c.saleDate ? new Date(c.saleDate).toLocaleDateString() : "N/A"}</td>
                          <td className="py-2 pr-3">{c.sqft?.toLocaleString() || "N/A"}</td>
                          <td className="py-2 pr-3">{c.bedrooms ?? "–"}/{c.bathrooms ?? "–"}</td>
                          <td className="py-2 pr-3">${c.pricePerSqft?.toLocaleString() || "N/A"}</td>
                          <td className="py-2">{c.distanceMiles?.toFixed(1) || "?"} mi</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 7. AI Investment Analysis */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI Investment Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!analysis && !analysisLoading && (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    Get AI-powered investment advice based on property data, comparable sales, and SC foreclosure law.
                  </p>
                  <Button onClick={runAnalysis} disabled={analysisLoading}>
                    <Brain className="mr-2 h-4 w-4" />
                    Run AI Analysis
                  </Button>
                  {analysisError && (
                    <p className="text-sm text-red-600 mt-2">{analysisError}</p>
                  )}
                </div>
              )}

              {analysisLoading && (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                  <p className="text-sm text-muted-foreground">Analyzing property with AI...</p>
                  <p className="text-xs text-muted-foreground mt-1">This may take 10-15 seconds</p>
                </div>
              )}

              {analysis && !analysisLoading && (
                <div className="space-y-4">
                  {/* Verdict Banner */}
                  <div className={`rounded-lg p-4 text-center ${
                    analysis.verdict === "STRONG_BUY" || analysis.verdict === "BUY"
                      ? "bg-green-50 border border-green-200"
                      : analysis.verdict === "HOLD"
                      ? "bg-amber-50 border border-amber-200"
                      : "bg-red-50 border border-red-200"
                  }`}>
                    <p className="text-2xl mb-1">{analysis.verdictEmoji || ""}</p>
                    <p className={`text-lg font-bold ${
                      analysis.verdict === "STRONG_BUY" || analysis.verdict === "BUY"
                        ? "text-green-700"
                        : analysis.verdict === "HOLD"
                        ? "text-amber-700"
                        : "text-red-700"
                    }`}>
                      {(analysis.verdict || "").replace("_", " ")}
                    </p>
                  </div>

                  {/* Deal Economics */}
                  {analysis.dealEconomics && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Deal Economics</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {analysis.dealEconomics.estimatedARV && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">ARV</span>
                            <span className="font-medium">{fmt(analysis.dealEconomics.estimatedARV)}</span>
                          </div>
                        )}
                        {analysis.dealEconomics.maxPurchasePrice && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Max Purchase (70%)</span>
                            <span className="font-medium">{fmt(analysis.dealEconomics.maxPurchasePrice)}</span>
                          </div>
                        )}
                        {analysis.dealEconomics.estimatedRehabCost && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Rehab Cost</span>
                            <span className="font-medium">{fmt(analysis.dealEconomics.estimatedRehabCost)}</span>
                          </div>
                        )}
                        {analysis.dealEconomics.estimatedProfit && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Est. Profit</span>
                            <span className="font-medium text-green-600">{fmt(analysis.dealEconomics.estimatedProfit)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* SC Legal Considerations */}
                  {analysis.scLegalConsiderations && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">SC Legal Considerations</h4>
                      <div className="space-y-1.5 text-sm">
                        {analysis.scLegalConsiderations.saleType && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Sale Type</span>
                            <span>{analysis.scLegalConsiderations.saleType}</span>
                          </div>
                        )}
                        {analysis.scLegalConsiderations.redemptionRisk && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Redemption Risk</span>
                            <span>{analysis.scLegalConsiderations.redemptionRisk}</span>
                          </div>
                        )}
                        {analysis.scLegalConsiderations.titleRisk && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Title Risk</span>
                            <span>{analysis.scLegalConsiderations.titleRisk}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Risk Assessment */}
                  {analysis.riskAssessment && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Risk Assessment</h4>
                      <Badge variant={
                        analysis.riskAssessment.overallRisk === "LOW" ? "default" :
                        analysis.riskAssessment.overallRisk === "MEDIUM" ? "warning" : "destructive"
                      }>
                        {analysis.riskAssessment.overallRisk} Risk
                      </Badge>
                      {analysis.riskAssessment.factors && (
                        <ul className="mt-2 space-y-1">
                          {analysis.riskAssessment.factors.map((f: string, i: number) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-500" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Recommendation */}
                  {analysis.recommendation && (
                    <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                      <h4 className="text-sm font-semibold text-blue-700 mb-1">Recommendation</h4>
                      <p className="text-sm text-blue-800">{analysis.recommendation}</p>
                    </div>
                  )}

                  {/* Re-run button */}
                  <Button variant="outline" size="sm" onClick={runAnalysis} className="w-full">
                    <Brain className="mr-2 h-3 w-3" />
                    Re-run Analysis
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 8. Notes Section */}
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

          {/* 2. Deal Analyzer (MAO Calculator) */}
          <Card className="border-2 border-slate-300">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Deal Analyzer
                </span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  dealVerdict === "GO" ? "bg-green-100 text-green-700 border border-green-300" :
                  dealVerdict === "MAYBE" ? "bg-amber-100 text-amber-700 border border-amber-300" :
                  "bg-red-100 text-red-700 border border-red-300"
                }`}>
                  {dealVerdict === "GO" ? "GO" : dealVerdict === "MAYBE" ? "MAYBE" : "NO-GO"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* --- ARV Source --- */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">After Repair Value (ARV)</label>
                <div className="grid grid-cols-4 gap-1 mt-1.5">
                  {(["median", "mean", "conservative", "custom"] as const).map((src) => (
                    <button
                      key={src}
                      onClick={() => setArvSource(src)}
                      className={`text-[11px] py-1 px-1 rounded border transition-colors ${
                        arvSource === src
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                      }`}
                    >
                      {src === "median" ? "Median" : src === "mean" ? "Mean" : src === "conservative" ? "Low" : "Custom"}
                    </button>
                  ))}
                </div>
                {arvSource === "custom" ? (
                  <div className="mt-2">
                    <Input
                      type="number"
                      value={customArv || ""}
                      onChange={(e) => setCustomArv(Number(e.target.value))}
                      placeholder="Enter custom ARV"
                      className="text-sm h-8"
                    />
                  </div>
                ) : (
                  <p className="text-lg font-bold mt-1">{fmt(liveArv)}</p>
                )}
                {!arvStats?.median && liveArv > 0 && (
                  <p className="text-[10px] text-amber-600 mt-0.5">Using database estimate — fetch comps for better accuracy</p>
                )}
              </div>

              <Separator />

              {/* --- Rehab Estimate with Presets --- */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rehab Estimate</label>
                <div className="grid grid-cols-4 gap-1 mt-1.5">
                  {[
                    { key: "light", label: "Light", val: 15000 },
                    { key: "medium", label: "Medium", val: 35000 },
                    { key: "heavy", label: "Heavy", val: 60000 },
                    { key: "gut", label: "Gut Job", val: 100000 },
                  ].map((preset) => (
                    <button
                      key={preset.key}
                      onClick={() => { setRehabPreset(preset.key); setRehabEstimate(preset.val); }}
                      className={`text-[11px] py-1 px-1 rounded border transition-colors ${
                        rehabPreset === preset.key
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Slider
                    value={[rehabEstimate]}
                    onValueChange={(v) => { setRehabEstimate(v[0]); setRehabPreset(""); }}
                    min={5000}
                    max={150000}
                    step={1000}
                    className="flex-1"
                  />
                  <span className="text-sm font-bold w-20 text-right">{fmt(rehabEstimate)}</span>
                </div>
              </div>

              <Separator />

              {/* --- Rule % and MAO --- */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Max Allowable Offer</label>
                  <div className="flex items-center gap-1">
                    {[65, 70, 75].map((pct) => (
                      <button
                        key={pct}
                        onClick={() => setRulePercent(pct)}
                        className={`text-[10px] py-0.5 px-2 rounded border transition-colors ${
                          rulePercent === pct
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {fmt(liveArv)} × {rulePercent}% − {fmt(rehabEstimate)} rehab
                </p>
                <p className={`text-2xl font-bold mt-1 ${maxAllowableOffer > 0 ? "text-slate-900" : "text-red-600"}`}>
                  {fmt(Math.max(0, maxAllowableOffer))}
                </p>
              </div>

              <Separator />

              {/* --- Cost Breakdown --- */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cost Breakdown</label>
                <div className="mt-2 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Purchase (MAO)</span>
                    <span>{fmt(Math.max(0, maxAllowableOffer))}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Rehab</span>
                    <span>{fmt(rehabEstimate)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      Holding
                      <span className="text-[10px] text-slate-400">({holdingMonths}mo × {fmt(monthlyHoldingCost)})</span>
                    </span>
                    <span>{fmt(holdingCosts)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      Closing
                      <span className="text-[10px] text-slate-400">({closingCostPercent}%)</span>
                    </span>
                    <span>{fmt(closingCosts)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-sm font-semibold">
                    <span>Total Cost Basis</span>
                    <span>{fmt(totalCostBasis)}</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* --- Projected Profit & Verdict --- */}
              <div className={`rounded-lg p-3 ${
                dealVerdict === "GO" ? "bg-green-50 border border-green-200" :
                dealVerdict === "MAYBE" ? "bg-amber-50 border border-amber-200" :
                "bg-red-50 border border-red-200"
              }`}>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Projected Profit</span>
                  <span className={`text-xl font-bold ${
                    projectedGrossProfit >= 30000 ? "text-green-700" :
                    projectedGrossProfit >= 15000 ? "text-amber-700" :
                    "text-red-700"
                  }`}>
                    {fmt(projectedGrossProfit)}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-muted-foreground">ROI</span>
                  <span className={`text-sm font-semibold ${roi >= 20 ? "text-green-600" : roi >= 10 ? "text-amber-600" : "text-red-600"}`}>
                    {roi}%
                  </span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-muted-foreground">Cash Needed (excl. closing)</span>
                  <span className="text-sm font-medium">{fmt(cashNeeded)}</span>
                </div>
              </div>

              {/* --- Fine-Tune Accordion --- */}
              <details className="group">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-slate-600">
                  Fine-tune holding &amp; closing costs
                </summary>
                <div className="mt-2 space-y-3 pl-1">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground w-28">Holding months</label>
                    <Slider value={[holdingMonths]} onValueChange={(v) => setHoldingMonths(v[0])} min={1} max={18} step={1} className="flex-1" />
                    <span className="text-xs font-medium w-8 text-right">{holdingMonths}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground w-28">Monthly cost</label>
                    <Slider value={[monthlyHoldingCost]} onValueChange={(v) => setMonthlyHoldingCost(v[0])} min={500} max={5000} step={100} className="flex-1" />
                    <span className="text-xs font-medium w-16 text-right">{fmt(monthlyHoldingCost)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground w-28">Closing costs %</label>
                    <Slider value={[closingCostPercent]} onValueChange={(v) => setClosingCostPercent(v[0])} min={3} max={12} step={0.5} className="flex-1" />
                    <span className="text-xs font-medium w-8 text-right">{closingCostPercent}%</span>
                  </div>
                </div>
              </details>

              {/* --- Legacy equity info --- */}
              {p.estimatedEquity > 0 && (
                <>
                  <Separator />
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Est. Equity</span>
                    <span className="text-green-600 font-medium">{fmt(p.estimatedEquity)} ({p.equityPercent}%)</span>
                  </div>
                </>
              )}
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
