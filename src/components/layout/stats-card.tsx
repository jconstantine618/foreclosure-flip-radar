"use client";

import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: React.ReactNode;
}

export function StatsCard({
  title,
  value,
  change,
  changeType = "neutral",
  icon,
}: StatsCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>

      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>

      {change && (
        <div className="mt-2 flex items-center gap-1">
          {changeType === "positive" && (
            <TrendingUp className="h-4 w-4 text-green-500" />
          )}
          {changeType === "negative" && (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
          {changeType === "neutral" && (
            <Minus className="h-4 w-4 text-gray-400" />
          )}
          <span
            className={cn(
              "text-sm font-medium",
              changeType === "positive" && "text-green-600",
              changeType === "negative" && "text-red-600",
              changeType === "neutral" && "text-gray-500"
            )}
          >
            {change}
          </span>
        </div>
      )}
    </div>
  );
}
