"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, XCircle } from "lucide-react";

interface CountyResult {
  county: string;
  status: string;
  recordsFound: number;
  recordsIngested?: number;
  ingestErrors?: number;
}

interface SyncResponse {
  data: {
    results: CountyResult[];
    status: string;
  };
}

const COUNTIES = ["Greenville", "Horry", "Georgetown"];

export function SyncNowCard() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [results, setResults] = useState<CountyResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const handleSync = async () => {
    setIsSyncing(true);
    setError(null);
    setResults(null);

    const allResults: CountyResult[] = [];

    try {
      // Sync one county at a time to stay within function timeout limits
      for (const county of COUNTIES) {
        try {
          const response = await fetch("/api/sync/providers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: "BATCHDATA",
              counties: [county],
            }),
          });

          if (!response.ok) {
            allResults.push({
              county,
              status: "FAILED",
              recordsFound: 0,
              recordsIngested: 0,
            });
          } else {
            const data: SyncResponse = await response.json();
            const countyResult = data.data.results?.[0];
            allResults.push(
              countyResult ?? {
                county,
                status: "COMPLETED",
                recordsFound: 0,
                recordsIngested: 0,
              },
            );
          }
        } catch {
          allResults.push({
            county,
            status: "FAILED",
            recordsFound: 0,
            recordsIngested: 0,
          });
        }

        // Update UI after each county completes
        setResults([...allResults]);
      }

      setLastSyncTime(new Date().toLocaleString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred during sync");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Data Sync</CardTitle>
            <CardDescription>
              Manually trigger a BatchData sync for all monitored counties.
            </CardDescription>
          </div>
          <Button
            onClick={handleSync}
            disabled={isSyncing}
            className="ml-4"
          >
            {isSyncing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync Now
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {lastSyncTime && (
          <p className="text-sm text-muted-foreground mb-3">
            Last manual sync: {lastSyncTime}
          </p>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive mb-3">
            <XCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {isSyncing && (
          <div className="text-sm text-muted-foreground">
            Fetching and ingesting properties from BatchData for{" "}
            {COUNTIES.join(", ")} counties. This may take a moment...
          </div>
        )}

        {results && (
          <div className="space-y-2">
            {results.map((r) => (
              <div
                key={r.county}
                className="flex items-center justify-between rounded-md border px-4 py-2"
              >
                <div className="flex items-center gap-2">
                  {r.status === "COMPLETED" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span className="font-medium">{r.county} County</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">
                    {r.recordsFound?.toLocaleString()} found
                  </span>
                  <Badge variant="secondary">
                    {r.recordsIngested ?? 0} ingested
                  </Badge>
                  {(r.ingestErrors ?? 0) > 0 && (
                    <Badge variant="destructive">
                      {r.ingestErrors} errors
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isSyncing && !results && !error && (
          <div className="text-sm text-muted-foreground">
            Counties monitored: {COUNTIES.join(", ")}. Auto-sync runs every 6
            hours via cron. Click &quot;Sync Now&quot; to trigger immediately.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
