"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowRight, Eye } from "lucide-react";
import type { DistressStage } from "@/types";

// TODO: Replace with real data from API/database
interface MockOpportunity {
  id: string;
  address: string;
  county: string;
  score: number;
  stage: DistressStage;
  estimatedValue: number;
  equityPercent: number;
  auctionDate: string | null;
  createdAt: string;
}

const MOCK_OPPORTUNITIES: MockOpportunity[] = [
  {
    id: "1",
    address: "142 Pelham Rd, Greenville, SC 29615",
    county: "Greenville",
    score: 88,
    stage: "NOTICE_OF_SALE",
    estimatedValue: 245000,
    equityPercent: 42,
    auctionDate: "2026-04-14",
    createdAt: "2026-03-31",
  },
  {
    id: "2",
    address: "3201 N Kings Hwy, Myrtle Beach, SC 29577",
    county: "Horry",
    score: 82,
    stage: "AUCTION_SCHEDULED",
    estimatedValue: 189000,
    equityPercent: 35,
    auctionDate: "2026-04-07",
    createdAt: "2026-03-30",
  },
  {
    id: "3",
    address: "507 Front St, Georgetown, SC 29440",
    county: "Georgetown",
    score: 78,
    stage: "PRE_FORECLOSURE",
    estimatedValue: 312000,
    equityPercent: 51,
    auctionDate: null,
    createdAt: "2026-03-30",
  },
  {
    id: "4",
    address: "88 Augusta St, Greenville, SC 29601",
    county: "Greenville",
    score: 71,
    stage: "LIS_PENDENS",
    estimatedValue: 178000,
    equityPercent: 28,
    auctionDate: null,
    createdAt: "2026-03-29",
  },
  {
    id: "5",
    address: "1450 Highway 17 S, Surfside Beach, SC 29575",
    county: "Horry",
    score: 65,
    stage: "NOTICE_OF_DEFAULT",
    estimatedValue: 225000,
    equityPercent: 33,
    auctionDate: "2026-04-21",
    createdAt: "2026-03-29",
  },
  {
    id: "6",
    address: "215 Highmarket St, Georgetown, SC 29440",
    county: "Georgetown",
    score: 59,
    stage: "TAX_LIEN",
    estimatedValue: 142000,
    equityPercent: 61,
    auctionDate: "2026-05-05",
    createdAt: "2026-03-28",
  },
  {
    id: "7",
    address: "2900 Poinsett Hwy, Greenville, SC 29609",
    county: "Greenville",
    score: 45,
    stage: "BANK_OWNED",
    estimatedValue: 155000,
    equityPercent: 18,
    auctionDate: null,
    createdAt: "2026-03-28",
  },
  {
    id: "8",
    address: "6100 N Ocean Blvd, Myrtle Beach, SC 29572",
    county: "Horry",
    score: 91,
    stage: "AUCTION_SCHEDULED",
    estimatedValue: 415000,
    equityPercent: 47,
    auctionDate: "2026-04-03",
    createdAt: "2026-03-27",
  },
  {
    id: "9",
    address: "404 Woodruff Rd, Greenville, SC 29607",
    county: "Greenville",
    score: 38,
    stage: "REO",
    estimatedValue: 198000,
    equityPercent: 12,
    auctionDate: null,
    createdAt: "2026-03-27",
  },
  {
    id: "10",
    address: "710 Pawleys Island Rd, Pawleys Island, SC 29585",
    county: "Georgetown",
    score: 76,
    stage: "NOTICE_OF_SALE",
    estimatedValue: 365000,
    equityPercent: 39,
    auctionDate: "2026-04-18",
    createdAt: "2026-03-26",
  },
];

function getScoreBadgeVariant(score: number): "success" | "warning" | "destructive" {
  if (score > 75) return "success";
  if (score >= 50) return "warning";
  return "destructive";
}

const STAGE_COLORS: Record<DistressStage, string> = {
  PRE_FORECLOSURE: "bg-blue-500/15 text-blue-700",
  LIS_PENDENS: "bg-indigo-500/15 text-indigo-700",
  NOTICE_OF_DEFAULT: "bg-orange-500/15 text-orange-700",
  NOTICE_OF_SALE: "bg-red-500/15 text-red-700",
  AUCTION_SCHEDULED: "bg-rose-500/15 text-rose-700",
  REO: "bg-gray-500/15 text-gray-700",
  BANK_OWNED: "bg-slate-500/15 text-slate-700",
  TAX_LIEN: "bg-amber-500/15 text-amber-700",
  PROBATE: "bg-purple-500/15 text-purple-700",
  BANKRUPTCY: "bg-pink-500/15 text-pink-700",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatStageLabel(stage: DistressStage): string {
  return stage
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RecentOpportunities() {
  // TODO: Fetch real data sorted by createdAt desc, limited to 10
  const opportunities = [...MOCK_OPPORTUNITIES].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Opportunities</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Address</TableHead>
              <TableHead>County</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Est. Value</TableHead>
              <TableHead className="text-right">Equity</TableHead>
              <TableHead>Auction Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {opportunities.map((opp) => (
              <TableRow key={opp.id}>
                <TableCell className="max-w-[200px] truncate font-medium">
                  {opp.address}
                </TableCell>
                <TableCell>{opp.county}</TableCell>
                <TableCell>
                  <Badge variant={getScoreBadgeVariant(opp.score)}>
                    {opp.score}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    className={STAGE_COLORS[opp.stage]}
                    variant="outline"
                  >
                    {formatStageLabel(opp.stage)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(opp.estimatedValue)}
                </TableCell>
                <TableCell className="text-right">
                  {opp.equityPercent}%
                </TableCell>
                <TableCell>
                  {opp.auctionDate
                    ? new Date(opp.auctionDate).toLocaleDateString()
                    : "\u2014"}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" asChild>
                    <Link href={`/opportunities/${opp.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter>
        <Button variant="link" asChild className="ml-auto">
          <Link href="/opportunities">
            View All <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
