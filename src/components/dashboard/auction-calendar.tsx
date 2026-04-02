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
import { ArrowRight, Calendar, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

// TODO: Replace with real data from API/database
interface MockAuction {
  id: string;
  date: string;
  address: string;
  county: string;
  minimumBid: number | null;
}

const MOCK_AUCTIONS: MockAuction[] = [
  {
    id: "a1",
    date: "2026-04-03",
    address: "6100 N Ocean Blvd, Myrtle Beach, SC 29572",
    county: "Horry",
    minimumBid: 185000,
  },
  {
    id: "a2",
    date: "2026-04-07",
    address: "3201 N Kings Hwy, Myrtle Beach, SC 29577",
    county: "Horry",
    minimumBid: 125000,
  },
  {
    id: "a3",
    date: "2026-04-14",
    address: "142 Pelham Rd, Greenville, SC 29615",
    county: "Greenville",
    minimumBid: null,
  },
  {
    id: "a4",
    date: "2026-04-18",
    address: "710 Pawleys Island Rd, Pawleys Island, SC 29585",
    county: "Georgetown",
    minimumBid: 210000,
  },
  {
    id: "a5",
    date: "2026-04-21",
    address: "1450 Highway 17 S, Surfside Beach, SC 29575",
    county: "Horry",
    minimumBid: 95000,
  },
];

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
  // TODO: Fetch real auctions sorted by date asc, limited to 5
  const auctions = [...MOCK_AUCTIONS].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

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
          {auctions.map((auction) => {
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
          })}
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
