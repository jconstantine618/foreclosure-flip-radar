import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums / Literals
// ---------------------------------------------------------------------------

export const DistressStage = z.enum([
  "PRE_FORECLOSURE",
  "LIS_PENDENS",
  "NOTICE_OF_DEFAULT",
  "NOTICE_OF_SALE",
  "AUCTION_SCHEDULED",
  "REO",
  "BANK_OWNED",
  "TAX_LIEN",
  "PROBATE",
  "BANKRUPTCY",
]);
export type DistressStage = z.infer<typeof DistressStage>;

export const PropertyType = z.enum([
  "SINGLE_FAMILY",
  "MULTI_FAMILY",
  "CONDO",
  "TOWNHOUSE",
  "MANUFACTURED",
  "LAND",
  "COMMERCIAL",
  "OTHER",
]);
export type PropertyType = z.infer<typeof PropertyType>;

export const AlertChannel = z.enum(["EMAIL", "SMS", "PUSH", "WEBHOOK"]);
export type AlertChannel = z.infer<typeof AlertChannel>;

export const AlertType = z.enum([
  "NEW_LISTING",
  "PRICE_DROP",
  "AUCTION_DATE",
  "STATUS_CHANGE",
  "FLIP_SCORE_THRESHOLD",
]);
export type AlertType = z.infer<typeof AlertType>;

export const SyncStatus = z.enum([
  "SUCCESS",
  "PARTIAL",
  "FAILED",
  "SKIPPED",
]);
export type SyncStatus = z.infer<typeof SyncStatus>;

// ---------------------------------------------------------------------------
// PropertySearchParams
// ---------------------------------------------------------------------------

export const PropertySearchParamsSchema = z.object({
  county: z.string().optional(),
  zipCodes: z.array(z.string()).optional(),
  distressStages: z.array(DistressStage).optional(),
  propertyTypes: z.array(PropertyType).optional(),
  minEquity: z.number().optional(),
  maxPrice: z.number().optional(),
  minBeds: z.number().int().optional(),
  ownerOccupied: z.boolean().optional(),
  absenteeOwner: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(25),
});
export type PropertySearchParams = z.infer<typeof PropertySearchParamsSchema>;

// ---------------------------------------------------------------------------
// NormalizedProperty – mirrors Prisma Property model shape
// ---------------------------------------------------------------------------

export interface NormalizedProperty {
  id?: string;
  externalId?: string;
  provider?: string;

  // Location
  address: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  zipCode: string;
  county: string;
  parcelNumber?: string | null;
  latitude?: number | null;
  longitude?: number | null;

  // Property details
  propertyType?: PropertyType | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sqft?: number | null;
  lotSizeSqft?: number | null;
  yearBuilt?: number | null;
  stories?: number | null;

  // Ownership
  ownerName?: string | null;
  ownerAddress?: string | null;
  ownerOccupied?: boolean | null;
  absenteeOwner?: boolean | null;

  // Valuation
  estimatedValue?: number | null;
  assessedValue?: number | null;
  lastSalePrice?: number | null;
  lastSaleDate?: Date | string | null;
  taxAmount?: number | null;

  // Mortgage / equity
  mortgageBalance?: number | null;
  equityEstimate?: number | null;
  equityPercent?: number | null;
  lienAmount?: number | null;

  // Distress
  distressStage?: DistressStage | null;
  listingPrice?: number | null;
  auctionDate?: Date | string | null;
  defaultAmount?: number | null;
  recordingDate?: Date | string | null;

  // Scoring
  flipScore?: number | null;

  // Meta
  rawData?: Record<string, unknown> | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

// ---------------------------------------------------------------------------
// NormalizedNotice – mirrors Prisma CountyNotice model
// ---------------------------------------------------------------------------

export interface NormalizedNotice {
  id?: string;
  externalId?: string;
  provider?: string;

  county: string;
  state: string;
  noticeType: string;
  caseNumber?: string | null;

  // Property reference
  address?: string | null;
  parcelNumber?: string | null;
  propertyId?: string | null;

  // Parties
  borrowerName?: string | null;
  lenderName?: string | null;
  trusteeName?: string | null;

  // Amounts
  defaultAmount?: number | null;
  unpaidBalance?: number | null;
  originalLoanAmount?: number | null;

  // Dates
  recordingDate?: Date | string | null;
  auctionDate?: Date | string | null;
  publishedDate?: Date | string | null;

  // Meta
  documentUrl?: string | null;
  rawData?: Record<string, unknown> | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

// ---------------------------------------------------------------------------
// PropertySearchResult
// ---------------------------------------------------------------------------

export interface PropertySearchResult {
  properties: NormalizedProperty[];
  total: number;
  page: number;
  limit: number;
  provider: string;
}

// ---------------------------------------------------------------------------
// ProviderConfig
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  rateLimit: number; // requests per minute
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// FlipScoreInput
// ---------------------------------------------------------------------------

export interface FlipScoreInput {
  equityPercent: number;
  equityAmount: number;
  arvEstimate: number; // after-repair value
  rehabEstimate: number;
  listingPrice: number;
  daysUntilSale: number | null;
  distressStage: DistressStage;
  occupancyRisk: number; // 0-1, higher = riskier
  propertyCondition?: number | null; // 1-10
  marketTrend?: number | null; // -1 to 1
  daysOnMarket?: number | null;
  comparableCount?: number | null;
  taxLienAmount?: number | null;
  hoaDebt?: number | null;
}

// ---------------------------------------------------------------------------
// FlipScoreWeights
// ---------------------------------------------------------------------------

export interface FlipScoreWeights {
  equity: number;
  margin: number;
  distressStage: number;
  daysUntilSale: number;
  occupancyRisk: number;
  propertyCondition: number;
  marketTrend: number;
  comparableConfidence: number;
}

export const DEFAULT_FLIP_SCORE_WEIGHTS: FlipScoreWeights = {
  equity: 0.2,
  margin: 0.25,
  distressStage: 0.15,
  daysUntilSale: 0.1,
  occupancyRisk: 0.1,
  propertyCondition: 0.08,
  marketTrend: 0.07,
  comparableConfidence: 0.05,
};

// ---------------------------------------------------------------------------
// FlipScoreResult
// ---------------------------------------------------------------------------

export interface FlipScoreResult {
  score: number; // 0 - 100
  breakdown: {
    equityScore: number;
    marginScore: number;
    distressStageScore: number;
    daysUntilSaleScore: number;
    occupancyRiskScore: number;
    propertyConditionScore: number;
    marketTrendScore: number;
    comparableConfidenceScore: number;
  };
  estimates: {
    maxBid: number;
    targetPrice: number;
    rehabReserve: number;
    resalePrice: number;
    grossMargin: number;
    netMargin: number;
    daysToFlip: number;
  };
}

// ---------------------------------------------------------------------------
// Extended Flip Scoring Engine Types
// ---------------------------------------------------------------------------

export interface ExtendedFlipScoreInput {
  // Equity
  estimatedValue: number;
  mortgageBalance: number;

  // Distress
  distressStage: DistressStage;

  // ARV
  arvEstimate?: number | null;
  arvConfidence?: number | null; // 0-1

  // Timeline
  daysUntilSale?: number | null;

  // Occupancy
  ownerOccupied?: boolean | null;
  absenteeOwner?: boolean | null;
  vacant?: boolean | null;

  // Neighborhood
  turnoverRate?: number | null; // 0-1

  // Rehab
  yearBuilt?: number | null;
  sqft?: number | null;
  propertyType?: PropertyType | null;

  // Market
  county?: string | null;

  // Financials
  purchasePrice: number;
  estimatedRehabCost: number;

  // Title
  noticeCount?: number | null;
  lienCount?: number | null;
  partyCount?: number | null;

  // HOA
  hoaMonthlyAmount?: number | null;
  isCondo?: boolean | null;

  // Flood
  floodZone?: boolean | null;

  // Holding
  projectedMonths?: number | null;
}

export interface ExtendedFlipScoreWeights {
  equityScore: number;
  distressUrgency: number;
  arvConfidence: number;
  daysUntilSale: number;
  occupancyRisk: number;
  neighborhoodTurnover: number;
  rehabComplexity: number;
  listToMarketSpeed: number;
  spreadAfterCosts: number;
  titleComplexity: number;
  condoHoaPenalty: number;
  floodZoneRisk: number;
}

export interface ExtendedFlipScoreBreakdown {
  equityScore: number;
  distressUrgency: number;
  arvConfidence: number;
  daysUntilSale: number;
  occupancyRisk: number;
  neighborhoodTurnover: number;
  rehabComplexity: number;
  listToMarketSpeed: number;
  spreadAfterCosts: number;
  titleComplexity: number;
  condoHoaPenalty: number;
  floodZoneRisk: number;
}

export interface ExtendedFlipScoreResult {
  score: number; // 0-100
  breakdown: ExtendedFlipScoreBreakdown;
  estimates: {
    estimatedMaxBid: number;
    targetPurchasePrice: number;
    roughRehabReserve: number;
    projectedResalePrice: number;
    projectedGrossMargin: number;
    projectedNetMargin: number;
    projectedDaysToFlip: number;
  };
}

// ---------------------------------------------------------------------------
// Entity Matching Types
// ---------------------------------------------------------------------------

export interface MatchResult {
  matched: boolean;
  confidence: number;
  matchedPropertyId?: string;
  matchFactors: {
    addressMatch: number;
    parcelMatch: number;
    caseNumberMatch: number;
    ownerNameMatch: number;
    saleDateMatch: number;
  };
}

export interface PropertyMatchCandidate {
  id: string;
  normalizedAddress: string;
  parcelNumber?: string | null;
  apn?: string | null;
  ownerName?: string | null;
  county: string;
  caseNumber?: string | null;
  auctionDate?: Date | null;
}

// ---------------------------------------------------------------------------
// AlertPayload
// ---------------------------------------------------------------------------

export interface AlertPayload {
  type: AlertType;
  channel: AlertChannel;
  recipient: string;
  opportunitySummary: {
    address: string;
    flipScore: number;
    listingPrice?: number | null;
    estimatedValue?: number | null;
    distressStage?: DistressStage | null;
    auctionDate?: Date | string | null;
  };
  message: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// MatchCandidate – for fuzzy notice-to-property matching
// ---------------------------------------------------------------------------

export interface MatchCandidate {
  address: string;
  parcelNumber?: string | null;
  caseNumber?: string | null;
  ownerName?: string | null;
  confidence: number; // 0 - 1
  matchedPropertyId?: string | null;
  matchedNoticeId?: string | null;
}

// ---------------------------------------------------------------------------
// SyncJobResult
// ---------------------------------------------------------------------------

export interface SyncJobResult {
  provider: string;
  status: SyncStatus;
  recordsFound: number;
  recordsProcessed: number;
  errors: string[];
  duration: number; // milliseconds
  startedAt: Date | string;
  completedAt: Date | string;
}
