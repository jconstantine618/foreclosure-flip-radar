"use client";

import { useState, useEffect } from "react";
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
import { ArrowRight, Eye, Loader2 } from "lucide-react";

type DistressStageEnum =
  | "PRE_FORECLOSURE"
  | "AUCTION"
  | "REO"
  | "TAX_LIEN"
  | "LIS_PENDENS"
  | "BANK_OWNED"
  | "OTHER";

interface ApiProperty {
  streetAddress: string;
  city: string;
  county: string;
  state: string;
  zipCode: string;
  propertyType: string;
  estimatedValue: number | null;
  equityEstimate: number | null;
}

interface ApiOpportunity {
  id: string;
  propertyId: string;
  flipScore: number;
  distressStage: DistressStageEnum;
  pipelineStage: string;
  estimatedARV: number | null;
  estimatedRehabCost: number;
  maxAllowableOffer: number;
  auctionDate: string | null;
  isActive: boolean;
  createdAt: string;
  property: ApiProperty;
}

interface Opportunity {
  id: string;
  address: string;
  county: string;
  score: number;
  stage: DistressStageEnum;
  estimatedValue: number | null;
  equityPercent: number | null;
  auctionDate: string | null;
  createdAt: string;
}

function getScoreBadgeVariant(
  score: number
): "success" | "warning" | "destructive" {
  if (score > 75) return "success";
  if (score >= 50) return "warning";
  return "destructive";
}

const STAGE_COLORS: Record<DistressStageEnum, string> = {
  PRE_FORECLOSURE: "bg-blue-500/15 text-blue-700",
  LIS_PENDENS: "bg-indigo-500/15 text-indigo-700",
  TAX_LIEN: "bg-amber-500/15 text-amber-700",
  AUCTION: "bg-rose-500/15 text-rose-700",
  REO: "bg-gray-500/15 text-gray-700",
  BANK_OWNED: "bg-slate-500/15 text-slate-700",
  OTHER: "bg-purple-500/15 text-purple-700",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatStageLabel(stage: DistressStageEnum): string {
  return stage
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function mapApiOpportunity(opp: ApiOpportunity): Opportunity {
  const { property } = opp;
  const address = `${property.streetAddress}, ${property.city}, ${property.state} ${property.zipCode}`;
  const equityPercent =
    property.equityEstimate != null && property.estimatedValue != null && property.estimatedValue > 0
      ? Math.round((property.equityEstimate / property.estimatedValue) * 100)
      : null;

  return {
    id: opp.id,
    address,
    county: property.county,
    score: opp.flipScore,
    stage: opp.distressStage,
    estimatedValue: property.estimatedValue,
    equityPercent,
    auctionDate: opp.auctionDate,
    createdAt: opp.createdAt,
  };
}

export function RecentOpportunities() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOpportunities = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch(
          "/api/opportunities?limit=10&sort=createdAt&order=desc"
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch opportunities: ${response.status}`);
        }
        const data = await response.json();
        const mapped = (data.data as ApiOpportunity[]).map(mapApiOpportunity);
        setOpportunities(mapped);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        setOpportunities([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchOpportunities();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Opportunities</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">
              Loading opportunities...
            </span>
          </div>
        ) : error ? (
          <div className="py-8 text-center text-sm text-destructive">
            {error}
          </div>
        ) : opportunities.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No opportunities found
          </div>
        ) : (
          <div className="overflow-x-auto">
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
                        className={
                          STAGE_COLORS[opp.stage] ||
                          "bg-gray-500/15 text-gray-700"
                        }
                        variant="outline"
                      >
                        {formatStageLabel(opp.stage)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {opp.estimatedValue != null && opp.estimatedValue > 0
                        ? formatCurrency(opp.estimatedValue)
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right">
                      {opp.equityPercent != null
                        ? `${opp.equityPercent}%`
                        : "\u2014"}
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
          </div>
        )}
      </CardContent>
      {!isLoading && !error && opportunities.length > 0 && (
        <CardFooter>
          <Button variant="link" asChild className="ml-auto">
            <Link href="/opportunities">
              View All <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
