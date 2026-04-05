"use client";

import { useEffect, useState } from "react";
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
import { ArrowRight, Calendar, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface Auction {
  id: string;
  date: string;
  address: string;
  county: string;
  minimumBid: number | null;
}

interface Opportunity {
  id: string;
  auctionDate: string | null;
  maxAllowableOffer: number | null;
  estimatedARV: number | null;
  property: {
    streetAddress: string;
    county: string;
  };
}

function getDaysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getUrgencyClass(days: number): string {
  if (days < 3) return "border-red-300 bg-red-50";
  if (days < 7) return "border-amber-300 bg-amber-50";
  return "border-gray-200 bg-white";
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function AuctionCalendar() {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAuctions = async () => {
      try {
        const response = await fetch(
          "/api/opportunities?limit=100&sort=auctionDate&order=asc"
        );
        if (!response.ok) throw new Error("Failed to fetch opportunities");

        const data = await response.json();
        const opportunities = data.data || [];

        // Filter to only opportunities with auctionDate
        const auctionList = opportunities
          .filter((opp: Opportunity) => opp.auctionDate)
          .map((opp: Opportunity) => ({
            id: opp.id,
            date: opp.auctionDate!,
            address: opp.property.streetAddress,
            county: opp.property.county,
            minimumBid:
              opp.maxAllowableOffer ||
              (opp.estimatedARV ? opp.estimatedARV * 0.5 : null),
          }));

        setAuctions(auctionList);
      } catch (error) {
        console.error("Error fetching auctions:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAuctions();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Calendar className="h-5 w-5" />
          Upcoming Auctions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {loading ? (
            <li className="text-sm text-muted-foreground">Loading auctions...</li>
          ) : auctions.length === 0 ? (
            <li className="text-sm text-muted-foreground">No upcoming auctions</li>
          ) : (
            auctions.map((auction) => {
            const daysUntil = getDaysUntil(auction.date);
            return (
              <li
                key={auction.id}
                className={cn(
                  "rounded-lg border p-3",
                  getUrgencyClass(daysUntil)
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {new Date(auction.date).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  {daysUntil < 3 && (
                    <Badge variant="destructive" className="text-xs">
                      {daysUntil <= 0 ? "Today" : `${daysUntil}d`}
                    </Badge>
                  )}
                  {daysUntil >= 3 && daysUntil < 7 && (
                    <Badge variant="warning" className="text-xs">
                      {daysUntil}d
                    </Badge>
                  )}
                </div>
                <p className="mt-1 truncate text-sm">{auction.address}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{auction.county} County</span>
                  {auction.minimumBid && (
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      Min: {formatCurrency(auction.minimumBid)}
                    </span>
                  )}
                </div>
              </li>
            );
            })
          )}
        </ul>
      </CardContent>
      <CardFooter>
        <Button variant="link" asChild className="ml-auto">
          <Link href="/auctions">
            View All <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
