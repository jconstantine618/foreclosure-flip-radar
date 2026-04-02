"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Search,
  Play,
  Pencil,
  Trash2,
  Plus,
  Clock,
  Filter,
  Bookmark,
} from "lucide-react";

// ---------- types ----------
interface SavedSearch {
  id: string;
  name: string;
  counties: string[];
  stages: string[];
  scoreMin: number;
  scoreMax: number;
  resultCount: number;
  lastRunDate: string;
}

// ---------- mock data ----------
const INITIAL_SEARCHES: SavedSearch[] = [
  {
    id: "ss1",
    name: "High-Score Greenville MIE Sales",
    counties: ["Greenville"],
    stages: ["Auction Scheduled", "Pre-Foreclosure"],
    scoreMin: 75,
    scoreMax: 100,
    resultCount: 14,
    lastRunDate: "2026-03-30",
  },
  {
    id: "ss2",
    name: "Horry County Tax Liens",
    counties: ["Horry"],
    stages: ["Tax Lien"],
    scoreMin: 50,
    scoreMax: 100,
    resultCount: 8,
    lastRunDate: "2026-03-28",
  },
  {
    id: "ss3",
    name: "Multi-County Lis Pendens Watch",
    counties: ["Greenville", "Horry"],
    stages: ["Lis Pendens", "Notice of Default"],
    scoreMin: 60,
    scoreMax: 100,
    resultCount: 22,
    lastRunDate: "2026-03-31",
  },
];

export default function SavedSearchesPage() {
  const [searches, setSearches] = useState<SavedSearch[]>(INITIAL_SEARCHES);

  function deleteSearch(id: string) {
    setSearches((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Saved Searches"
        description="Manage and run your saved property search filters."
        actions={
          <Button size="sm">
            <Plus className="mr-1 h-4 w-4" />
            New Search
          </Button>
        }
      />

      {searches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Search className="mb-3 h-10 w-10 text-muted-foreground opacity-40" />
            <p className="text-lg font-medium text-muted-foreground">
              No saved searches yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a search with specific filters to save it for later.
            </p>
            <Button size="sm" className="mt-4">
              <Plus className="mr-1 h-4 w-4" />
              Create Your First Search
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {searches.map((s) => (
            <Card key={s.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Bookmark className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">{s.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm">
                      <Play className="mr-1 h-3 w-3" />
                      Run
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Pencil className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteSearch(s.id)}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  {/* Filter summary */}
                  <div className="flex items-center gap-1">
                    <Filter className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Counties:</span>
                    {s.counties.map((c) => (
                      <Badge key={c} variant="outline" className="text-xs">
                        {c}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Stages:</span>
                    {s.stages.map((st) => (
                      <Badge key={st} variant="secondary" className="text-xs">
                        {st}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Score:</span>
                    <span className="font-medium">
                      {s.scoreMin} - {s.scoreMax}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Search className="h-3 w-3" />
                    {s.resultCount} results
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Last run: {s.lastRunDate}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
