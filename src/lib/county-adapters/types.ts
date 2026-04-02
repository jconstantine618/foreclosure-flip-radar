import type { NormalizedNotice } from "@/types";

// ---------------------------------------------------------------------------
// County Adapter Configuration
// ---------------------------------------------------------------------------

export interface CountyAdapterConfig {
  county: string;
  state: string;
  enabled: boolean;
  refreshIntervalMinutes: number;
  baseUrl?: string;
}

// ---------------------------------------------------------------------------
// Raw notice record — the shape of data as scraped before normalization
// ---------------------------------------------------------------------------

export interface RawNoticeRecord {
  caseNumber?: string;
  saleDate?: string;
  saleTime?: string;
  address?: string;
  plaintiff?: string;
  defendant?: string;
  legalDescription?: string;
  depositTerms?: string;
  sourceUrl?: string;
  rawHtml?: string;
  rawText?: string;
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// County Adapter interface
// ---------------------------------------------------------------------------

export interface CountyAdapter {
  name: string;
  county: string;
  state: string;
  fetchNotices(options?: { since?: Date }): Promise<RawNoticeRecord[]>;
  parseNotice(raw: RawNoticeRecord): NormalizedNotice;
  healthCheck(): Promise<{ ok: boolean; message: string }>;
}

export type { NormalizedNotice };
