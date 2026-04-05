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
import {
  ArrowRight,
  FileText,
  Gavel,
  AlertTriangle,
  Scale,
  Landmark,
} from "lucide-react";

interface Notice {
  id: string;
  noticeType: string;
  address: string;
  county: string;
  saleDate: string | null;
  source: string;
  publishedDate: string;
}

interface Opportunity {
  id: string;
  distressStage: string;
  auctionDate: string | null;
  createdAt: string;
  property: {
    streetAddress: string;
    city: string;
    county: string;
  };
}

const NOTICE_TYPE_CONFIG: Record<
  string,
  { color: string; icon: React.ReactNode }
> = {
  "Lis Pendens": {
    color: "bg-indigo-500/15 text-indigo-700",
    icon: <Scale className="h-4 w-4" />,
  },
  "Notice of Default": {
    color: "bg-orange-500/15 text-orange-700",
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  "Notice of Sale": {
    color: "bg-red-500/15 text-red-700",
    icon: <Gavel className="h-4 w-4" />,
  },
  "Tax Lien": {
    color: "bg-amber-500/15 text-amber-700",
    icon: <Landmark className="h-4 w-4" />,
  },
  "Master in Equity": {
    color: "bg-purple-500/15 text-purple-700",
    icon: <FileText className="h-4 w-4" />,
  },
};

function mapDistressStageToNoticeType(stage: string): string {
  const mapping: Record<string, string> = {
    AUCTION: "Master in Equity",
    LIS_PENDENS: "Lis Pendens",
    TAX_LIEN: "Tax Lien",
    NOTICE_OF_DEFAULT: "Notice of Default",
    NOTICE_OF_SALE: "Notice of Sale",
  };
  return mapping[stage] || "Notice of Sale";
}

export function NoticesFeed() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNotices = async () => {
      try {
        const response = await fetch(
          "/api/opportunities?limit=5&sort=createdAt&order=desc"
        );
        if (!response.ok) throw new Error("Failed to fetch opportunities");

        const data = await response.json();
        const opportunities = data.data || [];

        const noticeList = opportunities.map((opp: Opportunity) => ({
          id: opp.id,
          noticeType: mapDistressStageToNoticeType(opp.distressStage),
          address: `${opp.property.streetAddress}, ${opp.property.city}`,
          county: opp.property.county,
          saleDate: opp.auctionDate,
          source: "Foreclosure System",
          publishedDate: opp.createdAt,
        }));

        setNotices(noticeList);
      } catch (error) {
        console.error("Error fetching notices:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchNotices();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Notices</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {loading ? (
            <li className="text-sm text-muted-foreground">Loading notices...</li>
          ) : notices.length === 0 ? (
            <li className="text-sm text-muted-foreground">No notices found</li>
          ) : (
            notices.map((notice) => {
            const config = NOTICE_TYPE_CONFIG[notice.noticeType] ?? {
              color: "bg-gray-500/15 text-gray-700",
              icon: <FileText className="h-4 w-4" />,
            };

            return (
              <li
                key={notice.id}
                className="flex items-start gap-3 rounded-lg border p-3"
              >
                <div className="mt-0.5 flex-shrink-0 text-muted-foreground">
                  {config.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge className={config.color} variant="outline">
                      {notice.noticeType}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {notice.county} County
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium">
                    {notice.address}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    {notice.saleDate && (
                      <span>
                        Sale:{" "}
                        {new Date(notice.saleDate).toLocaleDateString()}
                      </span>
                    )}
                    <span>Source: {notice.source}</span>
                  </div>
                </div>
              </li>
            );
            })
          )}
        </ul>
      </CardContent>
      <CardFooter>
        <Button variant="link" asChild className="ml-auto">
          <Link href="/notices">
            View All <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
