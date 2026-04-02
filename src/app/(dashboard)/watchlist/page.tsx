"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Eye, Trash2, Star, Bookmark } from "lucide-react";

// ---------- types ----------
type Stage =
  | "Pre-Foreclosure"
  | "Auction Scheduled"
  | "Lis Pendens"
  | "Tax Lien";

interface WatchlistItem {
  id: string;
  address: string;
  city: string;
  county: string;
  score: number;
  stage: Stage;
  addedDate: string;
  notes: string;
}

// ---------- helpers ----------
function scoreColor(score: number) {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

const STAGE_VARIANTS: Record<Stage, "destructive" | "warning" | "info" | "success"> = {
  "Pre-Foreclosure": "warning",
  "Auction Scheduled": "destructive",
  "Lis Pendens": "info",
  "Tax Lien": "success",
};

// ---------- mock data ----------
const INITIAL_WATCHLIST: WatchlistItem[] = [
  {
    id: "w1",
    address: "104 Maple Creek Dr",
    city: "Greenville",
    county: "Greenville",
    score: 88,
    stage: "Auction Scheduled",
    addedDate: "2026-03-15",
    notes: "Strong equity position. Drive-by completed - good condition.",
  },
  {
    id: "w2",
    address: "503 Ocean Blvd",
    city: "Myrtle Beach",
    county: "Horry",
    score: 76,
    stage: "Lis Pendens",
    addedDate: "2026-03-18",
    notes: "Beach area property. Check flood zone status before bidding.",
  },
  {
    id: "w3",
    address: "212 Augusta St",
    city: "Greenville",
    county: "Greenville",
    score: 95,
    stage: "Pre-Foreclosure",
    addedDate: "2026-03-22",
    notes: "Top-rated opportunity. Downtown location with high ARV.",
  },
  {
    id: "w4",
    address: "7801 Kings Hwy",
    city: "Myrtle Beach",
    county: "Horry",
    score: 69,
    stage: "Tax Lien",
    addedDate: "2026-03-28",
    notes: "Low minimum bid. Potential title issues - needs research.",
  },
];

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>(INITIAL_WATCHLIST);

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Watchlist (${items.length})`}
        description="Properties you are tracking for potential acquisition."
        actions={
          <Button variant="outline" size="sm">
            <Star className="mr-1 h-4 w-4" />
            Browse Opportunities
          </Button>
        }
      />

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Bookmark className="mb-3 h-10 w-10 text-muted-foreground opacity-40" />
            <p className="text-lg font-medium text-muted-foreground">
              No properties in watchlist
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse opportunities to add some.
            </p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <Link href="/opportunities">View Opportunities</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>County</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Added Date</TableHead>
                  <TableHead className="min-w-[200px]">Notes</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.address}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.city}, SC
                      </div>
                    </TableCell>
                    <TableCell>{item.county}</TableCell>
                    <TableCell>
                      <span className={`font-bold ${scoreColor(item.score)}`}>
                        {item.score}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STAGE_VARIANTS[item.stage]}>
                        {item.stage}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {item.addedDate}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {item.notes}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/opportunities/${item.id}`}>
                            <Eye className="mr-1 h-4 w-4" />
                            View
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => removeItem(item.id)}
                        >
                          <Trash2 className="mr-1 h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
