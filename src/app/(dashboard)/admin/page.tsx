"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SyncNowCard } from "@/components/admin/sync-now-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import {
  Settings,
  Database,
  History,
  FileText,
  SlidersHorizontal,
  Bell,
  ToggleLeft,
  Play,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Send,
  Save,
  RotateCcw,
  Shield,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const countyAdapters = [
  {
    adapter: "Greenville MIE",
    county: "Greenville",
    status: "Healthy",
    lastRun: "2 hours ago",
    found: 23,
    processed: 21,
    errors: 2,
    interval: "4 hours",
  },
  {
    adapter: "Horry MIE",
    county: "Horry",
    status: "Healthy",
    lastRun: "3 hours ago",
    found: 18,
    processed: 17,
    errors: 1,
    interval: "4 hours",
  },
  {
    adapter: "Horry Upset Bid",
    county: "Horry",
    status: "Warning",
    lastRun: "6 hours ago",
    found: 5,
    processed: 5,
    errors: 0,
    interval: "4 hours",
  },
  {
    adapter: "SC Public Notices",
    county: "Statewide",
    status: "Healthy",
    lastRun: "1 hour ago",
    found: 31,
    processed: 28,
    errors: 3,
    interval: "8 hours",
  },
];

const jobHistory = [
  { id: "job_a1b2c3d4", type: "Ingest", provider: "BatchData", status: "Completed", records: 23, duration: "1m 42s", started: "2026-03-31 14:00", completed: "2026-03-31 14:02" },
  { id: "job_e5f6g7h8", type: "Ingest", provider: "BatchData", status: "Completed", records: 18, duration: "1m 15s", started: "2026-03-31 13:00", completed: "2026-03-31 13:01" },
  { id: "job_i9j0k1l2", type: "ScoreCalc", provider: "Internal", status: "Completed", records: 41, duration: "0m 38s", started: "2026-03-31 14:03", completed: "2026-03-31 14:03" },
  { id: "job_m3n4o5p6", type: "Ingest", provider: "BatchData", status: "Failed", records: 0, duration: "0m 05s", started: "2026-03-31 12:00", completed: "2026-03-31 12:00" },
  { id: "job_q7r8s9t0", type: "Alert", provider: "Internal", status: "Completed", records: 5, duration: "0m 12s", started: "2026-03-31 14:04", completed: "2026-03-31 14:04" },
  { id: "job_u1v2w3x4", type: "Ingest", provider: "ATTOM", status: "Failed", records: 0, duration: "0m 02s", started: "2026-03-31 11:00", completed: "2026-03-31 11:00" },
  { id: "job_y5z6a7b8", type: "SkipTrace", provider: "BatchData", status: "Completed", records: 12, duration: "2m 05s", started: "2026-03-31 10:30", completed: "2026-03-31 10:32" },
  { id: "job_c9d0e1f2", type: "Ingest", provider: "PublicNotices", status: "Completed", records: 31, duration: "2m 20s", started: "2026-03-31 09:00", completed: "2026-03-31 09:02" },
  { id: "job_g3h4i5j6", type: "ScoreCalc", provider: "Internal", status: "Running", records: 15, duration: "0m 22s", started: "2026-03-31 14:10", completed: "Ã¢ÂÂ" },
  { id: "job_k7l8m9n0", type: "Digest", provider: "Internal", status: "Completed", records: 1, duration: "0m 08s", started: "2026-03-31 08:00", completed: "2026-03-31 08:00" },
  { id: "job_o1p2q3r4", type: "Ingest", provider: "BatchData", status: "Completed", records: 14, duration: "1m 05s", started: "2026-03-30 14:00", completed: "2026-03-30 14:01" },
  { id: "job_s5t6u7v8", type: "Alert", provider: "Internal", status: "Completed", records: 3, duration: "0m 06s", started: "2026-03-30 14:02", completed: "2026-03-30 14:02" },
  { id: "job_w9x0y1z2", type: "Ingest", provider: "BatchData", status: "Failed", records: 0, duration: "0m 03s", started: "2026-03-30 10:00", completed: "2026-03-30 10:00" },
  { id: "job_a3b4c5d6", type: "ScoreCalc", provider: "Internal", status: "Completed", records: 28, duration: "0m 45s", started: "2026-03-30 09:05", completed: "2026-03-30 09:06" },
  { id: "job_e7f8g9h0", type: "Ingest", provider: "PublicNotices", status: "Completed", records: 22, duration: "1m 50s", started: "2026-03-30 09:00", completed: "2026-03-30 09:02" },
];

const ingestionLogs = [
  { time: "2026-03-31 14:04:12", level: "INFO", message: "Alert dispatched: HOT_LEAD to admin@flipradar.com", source: "AlertService" },
  { time: "2026-03-31 14:03:58", level: "INFO", message: "Flip score calculated: 82 for property 1042 Main St", source: "ScoreEngine" },
  { time: "2026-03-31 14:03:45", level: "INFO", message: "Flip score calculated: 67 for property 309 Elm Ave", source: "ScoreEngine" },
  { time: "2026-03-31 14:03:30", level: "WARN", message: "ARV estimate low confidence (0.72) for 88 Oak Dr Ã¢ÂÂ using fallback comps", source: "ScoreEngine" },
  { time: "2026-03-31 14:03:15", level: "INFO", message: "Score calculation batch started: 41 properties", source: "ScoreEngine" },
  { time: "2026-03-31 14:02:50", level: "INFO", message: "Matched property to existing record (confidence: 0.95) Ã¢ÂÂ 1042 Main St", source: "Dedup" },
  { time: "2026-03-31 14:02:35", level: "INFO", message: "New property ingested: 309 Elm Ave, Greenville, SC", source: "Ingestion" },
  { time: "2026-03-31 14:02:20", level: "ERROR", message: "Failed to geocode address: 99 Unknown Rd Ã¢ÂÂ skipping", source: "Geocoder" },
  { time: "2026-03-31 14:02:05", level: "ERROR", message: "BatchData returned 422 for parcel ID X-9999 Ã¢ÂÂ invalid format", source: "BatchData" },
  { time: "2026-03-31 14:01:50", level: "INFO", message: "Fetched 23 properties from Greenville MIE adapter", source: "BatchData" },
  { time: "2026-03-31 14:00:15", level: "INFO", message: "BatchData sync started for Greenville", source: "Scheduler" },
  { time: "2026-03-31 13:01:30", level: "INFO", message: "Horry MIE sync completed: 18 fetched, 17 processed, 1 error", source: "BatchData" },
  { time: "2026-03-31 13:00:10", level: "INFO", message: "BatchData sync started for Horry", source: "Scheduler" },
  { time: "2026-03-31 12:00:05", level: "ERROR", message: "BatchData API rate limit exceeded Ã¢ÂÂ retrying in 60s", source: "BatchData" },
  { time: "2026-03-31 11:00:03", level: "ERROR", message: "ATTOM connection refused Ã¢ÂÂ provider not configured", source: "ATTOM" },
  { time: "2026-03-31 10:32:00", level: "INFO", message: "Skip trace completed: 12 contacts enriched", source: "SkipTrace" },
  { time: "2026-03-31 10:30:05", level: "INFO", message: "Skip trace batch started: 12 properties", source: "SkipTrace" },
  { time: "2026-03-31 09:02:10", level: "WARN", message: "Public notices parser found 3 entries with missing sale dates", source: "PublicNotices" },
  { time: "2026-03-31 09:00:15", level: "INFO", message: "SC Public Notices scrape started Ã¢ÂÂ statewide", source: "Scheduler" },
  { time: "2026-03-31 08:00:05", level: "INFO", message: "Daily digest generated and queued for delivery", source: "DigestService" },
];

const alertTemplates = [
  { type: "NEW_OPPORTUNITY", subject: "New foreclosure opportunity: {{address}} in {{county}}", status: "Active" },
  { type: "HOT_LEAD", subject: "HOT LEAD: {{address}} Ã¢ÂÂ Flip Score {{score}}/100", status: "Active" },
  { type: "AUCTION_APPROACHING", subject: "Auction in {{days_until}} days: {{address}}", status: "Active" },
  { type: "STATUS_CHANGED", subject: "Status update: {{address}} changed to {{new_status}}", status: "Active" },
  { type: "DAILY_DIGEST", subject: "Foreclosure Flip Radar Ã¢ÂÂ Daily Digest ({{date}})", status: "Active" },
];

const defaultWeights = {
  equity: 15,
  distressUrgency: 12,
  arvConfidence: 10,
  daysUntilSale: 10,
  occupancyRisk: 8,
  neighborhoodTurnover: 5,
  rehabComplexity: 10,
  listToMarketSpeed: 5,
  spreadAfterCosts: 15,
  titleComplexity: 5,
  condoHoaPenalty: 3,
  floodZoneRisk: 2,
};

const weightConfig: { key: keyof typeof defaultWeights; label: string; max: number }[] = [
  { key: "equity", label: "Equity Score", max: 30 },
  { key: "distressUrgency", label: "Distress Urgency", max: 20 },
  { key: "arvConfidence", label: "ARV Confidence", max: 20 },
  { key: "daysUntilSale", label: "Days Until Sale", max: 20 },
  { key: "occupancyRisk", label: "Occupancy Risk", max: 15 },
  { key: "neighborhoodTurnover", label: "Neighborhood Turnover", max: 10 },
  { key: "rehabComplexity", label: "Rehab Complexity", max: 20 },
  { key: "listToMarketSpeed", label: "List to Market Speed", max: 10 },
  { key: "spreadAfterCosts", label: "Spread After Costs", max: 30 },
  { key: "titleComplexity", label: "Title Complexity", max: 10 },
  { key: "condoHoaPenalty", label: "Condo/HOA Penalty", max: 10 },
  { key: "floodZoneRisk", label: "Flood Zone Risk", max: 5 },
];

const defaultFeatureFlags = {
  skip_trace_enabled: false,
  contact_data_enabled: false,
  attom_fallback_enabled: true,
  auto_score_on_ingest: true,
  auto_alert_on_ingest: true,
  public_notices_enabled: true,
  daily_digest_enabled: true,
};

const featureFlagMeta: { key: keyof typeof defaultFeatureFlags; label: string; description: string }[] = [
  { key: "skip_trace_enabled", label: "skip_trace_enabled", description: "Enable skip-trace lookups for property owner contact information via third-party provider." },
  { key: "contact_data_enabled", label: "contact_data_enabled", description: "Enable enrichment of contact data (phone, email) for property owners." },
  { key: "attom_fallback_enabled", label: "attom_fallback_enabled", description: "Fall back to ATTOM API when BatchData is unavailable or rate-limited." },
  { key: "auto_score_on_ingest", label: "auto_score_on_ingest", description: "Automatically calculate flip scores when new properties are ingested." },
  { key: "auto_alert_on_ingest", label: "auto_alert_on_ingest", description: "Automatically dispatch alerts when a new high-scoring property is ingested." },
  { key: "public_notices_enabled", label: "public_notices_enabled", description: "Enable scraping of SC public notices for foreclosure filings." },
  { key: "daily_digest_enabled", label: "daily_digest_enabled", description: "Send a daily digest email summarising new opportunities and pipeline changes." },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: string) {
  switch (status) {
    case "Healthy":
    case "Completed":
    case "Active":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{status}</Badge>;
    case "Warning":
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">{status}</Badge>;
    case "Failed":
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">{status}</Badge>;
    case "Running":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">{status}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function logLevelBadge(level: string) {
  switch (level) {
    case "INFO":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 text-xs font-mono">INFO</Badge>;
    case "WARN":
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 text-xs font-mono">WARN</Badge>;
    case "ERROR":
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-xs font-mono">ERROR</Badge>;
    default:
      return <Badge variant="outline" className="text-xs font-mono">{level}</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const [activeTab, setActiveTab] = React.useState("providers");
  const [jobFilter, setJobFilter] = React.useState("All");
  const [weights, setWeights] = React.useState({ ...defaultWeights });
  const [featureFlags, setFeatureFlags] = React.useState({ ...defaultFeatureFlags });
  const [skipTraceProvider, setSkipTraceProvider] = React.useState(false);
  const [contactDataProvider, setContactDataProvider] = React.useState(false);

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  const filteredJobs =
    jobFilter === "All"
      ? jobHistory
      : jobHistory.filter((j) => j.status === jobFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Panel"
        description="Manage data providers, adapters, scoring weights, and platform configuration."
        actions={
          <Badge variant="outline" className="gap-1">
            <Shield className="h-3 w-3" />
            Admin
          </Badge>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="providers" className="gap-1 text-xs">
            <Database className="h-3.5 w-3.5" />
            Providers
          </TabsTrigger>
          <TabsTrigger value="adapters" className="gap-1 text-xs">
            <Settings className="h-3.5 w-3.5" />
            County Adapters
          </TabsTrigger>
          <TabsTrigger value="jobs" className="gap-1 text-xs">
            <History className="h-3.5 w-3.5" />
            Job History
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1 text-xs">
            <FileText className="h-3.5 w-3.5" />
            Ingestion Logs
          </TabsTrigger>
          <TabsTrigger value="weights" className="gap-1 text-xs">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Score Weights
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1 text-xs">
            <Bell className="h-3.5 w-3.5" />
            Alert Templates
          </TabsTrigger>
          <TabsTrigger value="flags" className="gap-1 text-xs">
            <ToggleLeft className="h-3.5 w-3.5" />
            Feature Flags
          </TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------------------- */}
        {/* TAB 1 Ã¢ÂÂ Providers                                                */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="providers" className="space-y-6 mt-6">
            <SyncNowCard />

          <div className="grid gap-6 md:grid-cols-2">
            {/* BatchData */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  BatchData
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Connected</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="bd-api-key">API Key</Label>
                  <Input
                    id="bd-api-key"
                    type="password"
                    value="Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢abc123"
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bd-base-url">Base URL</Label>
                  <Input
                    id="bd-base-url"
                    defaultValue="https://api.batchdata.com/api/v1"
                  />
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Last sync: 2 hours ago</span>
                  <span>Rate limit: 480 / 500 remaining</span>
                </div>
                <Button variant="outline" className="w-full gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Test Connection
                </Button>
              </CardContent>
            </Card>

            {/* ATTOM */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  ATTOM
                  <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Not Configured</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="at-api-key">API Key</Label>
                  <Input
                    id="at-api-key"
                    type="password"
                    placeholder="Enter ATTOM API key"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="at-base-url">Base URL</Label>
                  <Input
                    id="at-base-url"
                    defaultValue="https://api.gateway.attomdata.com/propertyapi/v1.0.0"
                  />
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Last sync: Never</span>
                  <span>Rate limit: Ã¢ÂÂ</span>
                </div>
                <Button variant="outline" className="w-full gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Test Connection
                </Button>
              </CardContent>
            </Card>
          </div>

          <Separator />

          {/* Feature flags within provider tab */}
          <Card>
            <CardHeader>
              <CardTitle>Provider Feature Flags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Skip Trace Enabled</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable skip-trace lookups for owner contact information.
                  </p>
                  {!skipTraceProvider && (
                    <p className="text-xs text-yellow-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Review data provider terms of service before enabling.
                    </p>
                  )}
                </div>
                <Switch
                  checked={skipTraceProvider}
                  onCheckedChange={setSkipTraceProvider}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Contact Data Enabled</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable enrichment of contact data (phone, email) for property owners.
                  </p>
                  {!contactDataProvider && (
                    <p className="text-xs text-yellow-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Ensure compliance with data provider terms before enabling.
                    </p>
                  )}
                </div>
                <Switch
                  checked={contactDataProvider}
                  onCheckedChange={setContactDataProvider}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button className="gap-2">
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* TAB 2 Ã¢ÂÂ County Adapters                                          */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="adapters" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>County Adapters</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Adapter</TableHead>
                    <TableHead>County</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Run</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Errors</TableHead>
                    <TableHead>Interval</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {countyAdapters.map((a) => (
                    <TableRow key={a.adapter}>
                      <TableCell className="font-medium">{a.adapter}</TableCell>
                      <TableCell>{a.county}</TableCell>
                      <TableCell>{statusBadge(a.status)}</TableCell>
                      <TableCell>{a.lastRun}</TableCell>
                      <TableCell>
                        {a.found} found / {a.processed} processed
                      </TableCell>
                      <TableCell>{a.errors}</TableCell>
                      <TableCell>{a.interval}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="gap-1">
                          <Play className="h-3 w-3" />
                          Run Now
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* TAB 3 Ã¢ÂÂ Job History                                              */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="jobs" className="space-y-4 mt-6">
          <div className="flex items-center gap-3">
            <Label>Filter by status:</Label>
            <Select value={jobFilter} onValueChange={setJobFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="Failed">Failed</SelectItem>
                <SelectItem value="Running">Running</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="font-mono text-xs">
                        {j.id.slice(0, 12)}...
                      </TableCell>
                      <TableCell>{j.type}</TableCell>
                      <TableCell>{j.provider}</TableCell>
                      <TableCell>{statusBadge(j.status)}</TableCell>
                      <TableCell>{j.records}</TableCell>
                      <TableCell>{j.duration}</TableCell>
                      <TableCell className="text-xs">{j.started}</TableCell>
                      <TableCell className="text-xs">{j.completed}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* TAB 4 Ã¢ÂÂ Ingestion Logs                                           */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="logs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Ingestion Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] rounded-md border p-4">
                <div className="space-y-2">
                  {ingestionLogs.map((log, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 text-sm font-mono"
                    >
                      <span className="shrink-0 text-muted-foreground text-xs">
                        {log.time}
                      </span>
                      <span className="shrink-0">{logLevelBadge(log.level)}</span>
                      <span className="flex-1">{log.message}</span>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {log.source}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* TAB 5 Ã¢ÂÂ Score Weights                                            */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="weights" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Flip Score Weight Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {weightConfig.map(({ key, label, max }) => (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{label}</Label>
                    <span className="text-sm font-semibold tabular-nums">
                      {weights[key]} / {max}
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={max}
                    step={1}
                    value={[weights[key]]}
                    onValueChange={([v]) =>
                      setWeights((prev) => ({ ...prev, [key]: v }))
                    }
                  />
                </div>
              ))}

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-base">Total Weight</Label>
                  <span
                    className={`text-lg font-bold tabular-nums ${
                      totalWeight === 100
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {totalWeight} / 100
                  </span>
                </div>
                <Progress value={totalWeight} className="h-2" />
                {totalWeight !== 100 && (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Total weight must equal 100. Currently {totalWeight > 100 ? "over" : "under"} by{" "}
                    {Math.abs(totalWeight - 100)}.
                  </p>
                )}
                {totalWeight === 100 && (
                  <p className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Weights are valid and sum to 100.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setWeights({ ...defaultWeights })}
            >
              <RotateCcw className="h-4 w-4" />
              Reset to Defaults
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Recalculate All Scores
              </Button>
              <Button className="gap-2" disabled={totalWeight !== 100}>
                <Save className="h-4 w-4" />
                Save Weights
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* TAB 6 Ã¢ÂÂ Alert Templates                                          */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="alerts" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Alert Templates</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Alert Type</TableHead>
                    <TableHead>Subject Template</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alertTemplates.map((t) => (
                    <TableRow key={t.type}>
                      <TableCell className="font-mono text-sm font-medium">
                        {t.type}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {t.subject}
                      </TableCell>
                      <TableCell>{statusBadge(t.status)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="gap-1">
                          <Send className="h-3 w-3" />
                          Test Send
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* TAB 7 Ã¢ÂÂ Feature Flags                                            */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="flags" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Feature Flags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {featureFlagMeta.map(({ key, label, description }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Label className="font-mono text-sm">{label}</Label>
                    <p className="text-sm text-muted-foreground">
                      {description}
                    </p>
                  </div>
                  <Switch
                    checked={featureFlags[key]}
                    onCheckedChange={(checked) =>
                      setFeatureFlags((prev) => ({ ...prev, [key]: checked }))
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button className="gap-2">
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
