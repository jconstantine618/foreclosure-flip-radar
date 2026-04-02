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
  ArrowRight,
  FileText,
  Gavel,
  AlertTriangle,
  Scale,
  Landmark,
} from "lucide-react";

// TODO: Replace with real data from API/database
interface MockNotice {
  id: string;
  noticeType: string;
  address: string;
  county: string;
  saleDate: string | null;
  source: string;
  publishedDate: string;
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

const MOCK_NOTICES: MockNotice[] = [
  {
    id: "n1",
    noticeType: "Notice of Sale",
    address: "142 Pelham Rd, Greenville, SC 29615",
    county: "Greenville",
    saleDate: "2026-04-14",
    source: "Greenville MIE",
    publishedDate: "2026-03-31",
  },
  {
    id: "n2",
    noticeType: "Lis Pendens",
    address: "88 Augusta St, Greenville, SC 29601",
    county: "Greenville",
    saleDate: null,
    source: "SC Public Notices",
    publishedDate: "2026-03-30",
  },
  {
    id: "n3",
    noticeType: "Notice of Default",
    address: "1450 Highway 17 S, Surfside Beach, SC 29575",
    county: "Horry",
    saleDate: "2026-04-21",
    source: "Horry MIE",
    publishedDate: "2026-03-29",
  },
  {
    id: "n4",
    noticeType: "Tax Lien",
    address: "215 Highmarket St, Georgetown, SC 29440",
    county: "Georgetown",
    saleDate: "2026-05-05",
    source: "SC Public Notices",
    publishedDate: "2026-03-28",
  },
  {
    id: "n5",
    noticeType: "Master in Equity",
    address: "6100 N Ocean Blvd, Myrtle Beach, SC 29572",
    county: "Horry",
    saleDate: "2026-04-03",
    source: "Horry Upset Sales",
    publishedDate: "2026-03-27",
  },
];

export function NoticesFeed() {
  // TODO: Fetch real notices sorted by publishedDate desc, limited to 5
  const notices = [...MOCK_NOTICES].sort(
    (a, b) =>
      new Date(b.publishedDate).getTime() -
      new Date(a.publishedDate).getTime()
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Notices</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {notices.map((notice) => {
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
          })}
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
