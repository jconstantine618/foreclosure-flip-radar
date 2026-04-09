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
  const [rehabEstimate, setRehabEstimate] = useState(0);
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
        setRehabEstimate(json.data.estimatedRehabCost || 0);

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
          // notes field isn't JSON â ignore
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

    // foreclosure details (from county notices)
    caseNumber: apiData.property?.countyNotices?.[0]?.caseNumber || "N/A",
    filingDate: apiData.property?.countyNotices?.[0]?.createdAt
      ? new Date(apiData.property.countyNotices[0].createdAt).toISOString().split('T')[0]
      : "N/A",
    plaintiff: apiData.property?.countyNotices?.[0]?.plaintiff || "N/A",
    defendant: apiData.property?.countyNotices?.[0]?.defendant || "N/A",
    legalDescription: apiData.property?.countyNotices?.[0]?.legalDescription || "N/A",
    depositTerms: apiData.property?.countyNotices?.[0]?.depositTerms || "N/A",
    court: `${apiData.property?.county || ""} County Master in Equity`.trim() || "N/A",
    saleDate: apiData.auctionDate ? new Date(apiData.auctionDate).toISOString().split('T')[0] : "N/A",
    saleTime: apiData.property?.countyNotices?.[0]?.saleTime || "11:00 AM",

    // owner
    ownerName: apiData.property?.ownerName || apiData.property?.countyNotices?.[0]?.defendant || "N/A",
    occupancyStatus: apiData.property?.ownerOccupied ? "Owner-Occupied" : "Non-Owner-Occupied",
    absenteeOwner: apiData.property?.absenteeOwner || false,

    // auction
    auctionDate: apiData.auctionDate ? new Date(apiData.auctionDate).toISOString().split('T')[0] : "N/A",
    auctionLocation: "N/A",
    depositRequired: "N/A",
    biddingInstructions: "N/A",

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

  // Derived financials based on rehab slider
  const maxAllowableOffer = Math.round(p.estimatedARV * 0.7 - rehabEstimate);
  const projectedGrossMargin = p.estimatedARV - p.targetPurchasePrice - rehabEstimate;
  const projectedNetMargin = Math.round(projectedGrossMargin * 0.67);

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
                        ${arvStats.low?.toLocaleString() || "?"} â ${arvStats.high?.toLocaleString() || "?"}
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
                          <td className="py-2 pr-3">{c.bedrooms || "?"}/{c.bathrooms || "?"}</td>
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
