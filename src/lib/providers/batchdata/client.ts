import { z } from "zod";
import type { ProviderConfig, PropertySearchParams } from "@/types";

// ---------------------------------------------------------------------------
// BatchData API response schemas (Zod validation)
// ---------------------------------------------------------------------------

const BatchDataPropertySchema = z.object({
  id: z.string().optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    county: z.string().optional(),
  }).optional(),
  parcel: z.object({
    apn: z.string().optional(),
    parcelNumber: z.string().optional(),
  }).optional(),
  location: z.object({
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  }).optional(),
  property: z.object({
    type: z.string().optional(),
    bedrooms: z.number().optional(),
    bathrooms: z.number().optional(),
    sqft: z.number().optional(),
    lotSizeSqft: z.number().optional(),
    yearBuilt: z.number().optional(),
    stories: z.number().optional(),
  }).optional(),
  owner: z.object({
    name: z.string().optional(),
    mailingAddress: z.string().optional(),
    ownerOccupied: z.boolean().optional(),
    absenteeOwner: z.boolean().optional(),
  }).optional(),
  valuation: z.object({
    estimatedValue: z.number().optional(),
    assessedValue: z.number().optional(),
    lastSalePrice: z.number().optional(),
    lastSaleDate: z.string().optional(),
    taxAmount: z.number().optional(),
  }).optional(),
  mortgage: z.object({
    balance: z.number().optional(),
    equityEstimate: z.number().optional(),
    equityPercent: z.number().optional(),
    lienAmount: z.number().optional(),
  }).optional(),
  distress: z.object({
    stage: z.string().optional(),
    listingPrice: z.number().optional(),
    auctionDate: z.string().optional(),
    defaultAmount: z.number().optional(),
    recordingDate: z.string().optional(),
  }).optional(),
}).passthrough();

export type BatchDataProperty = z.infer<typeof BatchDataPropertySchema>;

const BatchDataSearchResponseSchema = z.object({
  status: z.string().optional(),
  results: z.object({
    properties: z.array(BatchDataPropertySchema).default([]),
    total: z.number().default(0),
    page: z.number().default(1),
    limit: z.number().default(25),
  }),
}).passthrough();

export type BatchDataSearchResponse = z.infer<typeof BatchDataSearchResponseSchema>;

const BatchDataSkipTraceResponseSchema = z.object({
  status: z.string().optional(),
  results: z.object({
    phones: z.array(z.object({
      number: z.string(),
      type: z.string().optional(),
      lineType: z.string().optional(),
    })).default([]),
    emails: z.array(z.object({
      address: z.string(),
      type: z.string().optional(),
    })).default([]),
    names: z.array(z.string()).default([]),
  }).optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// Rate limit tracking
// ---------------------------------------------------------------------------

interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: Date;
}

// ---------------------------------------------------------------------------
// Cache interface – implementations can be swapped in (Redis, in-memory, etc.)
// ---------------------------------------------------------------------------

export interface BatchDataCacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// BatchDataClient
// ---------------------------------------------------------------------------

export class BatchDataClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly rateLimit: number;
  private rateLimitInfo: RateLimitInfo | null = null;
  private cache: BatchDataCacheAdapter | null = null;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.rateLimit = config.rateLimit;
  }

  /** Optionally attach a cache adapter. */
  setCache(cache: BatchDataCacheAdapter): void {
    this.cache = cache;
  }

  // -------------------------------------------------------------------------
  // Public API methods
  // -------------------------------------------------------------------------

  /**
   * Search properties via POST /property/search.
   */
  async searchProperties(
    params: PropertySearchParams,
  ): Promise<BatchDataSearchResponse> {
    const body = this.buildSearchBody(params);

    const raw = await this.post("/property/search", body);
    const parsed = BatchDataSearchResponseSchema.safeParse(raw);

    if (!parsed.success) {
      // TODO: log.warn("BatchData response validation failed", parsed.error)
      // Fall back to raw data with default shape
      return {
        status: "ok",
        results: { properties: [], total: 0, page: params.page ?? 1, limit: params.limit ?? 25 },
      };
    }

    return parsed.data;
  }

  /**
   * Get property details by BatchData ID.
   */
  async getPropertyDetails(batchdataId: string): Promise<BatchDataProperty | null> {
    const cacheKey = `batchdata:property:${batchdataId}`;

    if (this.cache) {
      const cached = await this.cache.get<BatchDataProperty>(cacheKey);
      if (cached) return cached;
    }

    try {
      const raw = await this.get(`/property/${encodeURIComponent(batchdataId)}`);
      const parsed = BatchDataPropertySchema.safeParse(raw);

      if (!parsed.success) {
        // TODO: log.warn("BatchData property validation failed", parsed.error)
        return null;
      }

      if (this.cache) {
        await this.cache.set(cacheKey, parsed.data, 3600); // cache 1 hour
      }

      return parsed.data;
    } catch (err) {
      // TODO: log.error("BatchData getPropertyDetails failed", err)
      return null;
    }
  }

  /**
   * Look up a property by street address.
   */
  async getPropertyByAddress(address: string): Promise<BatchDataProperty | null> {
    const cacheKey = `batchdata:address:${address.toLowerCase().replace(/\s+/g, "_")}`;

    if (this.cache) {
      const cached = await this.cache.get<BatchDataProperty>(cacheKey);
      if (cached) return cached;
    }

    try {
      const raw = await this.post("/property/search", {
        address,
        limit: 1,
      });
      const parsed = BatchDataSearchResponseSchema.safeParse(raw);

      if (!parsed.success || parsed.data.results.properties.length === 0) {
        return null;
      }

      const property = parsed.data.results.properties[0];

      if (this.cache) {
        await this.cache.set(cacheKey, property, 3600);
      }

      return property;
    } catch (err) {
      // TODO: log.error("BatchData getPropertyByAddress failed", err)
      return null;
    }
  }

  /**
   * Skip trace – feature-gated behind ENABLE_SKIP_TRACE env var.
   */
  async skipTrace(params: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
  }): Promise<z.infer<typeof BatchDataSkipTraceResponseSchema> | null> {
    if (process.env.ENABLE_SKIP_TRACE !== "true") {
      // TODO: log.debug("Skip trace is disabled via ENABLE_SKIP_TRACE env")
      return null;
    }

    try {
      const raw = await this.post("/skip-trace", params);
      const parsed = BatchDataSkipTraceResponseSchema.safeParse(raw);

      if (!parsed.success) {
        // TODO: log.warn("BatchData skip trace validation failed", parsed.error)
        return null;
      }

      return parsed.data;
    } catch (err) {
      // TODO: log.error("BatchData skipTrace failed", err)
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Rate limit helpers
  // -------------------------------------------------------------------------

  getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  private parseRateLimitHeaders(headers: Headers): void {
    const remaining = headers.get("x-ratelimit-remaining");
    const limit = headers.get("x-ratelimit-limit");
    const reset = headers.get("x-ratelimit-reset");

    if (remaining !== null && limit !== null) {
      this.rateLimitInfo = {
        remaining: parseInt(remaining, 10),
        limit: parseInt(limit, 10),
        resetAt: reset ? new Date(parseInt(reset, 10) * 1000) : new Date(),
      };
    }
  }

  private async checkRateLimit(): Promise<void> {
    if (
      this.rateLimitInfo &&
      this.rateLimitInfo.remaining <= 0 &&
      this.rateLimitInfo.resetAt > new Date()
    ) {
      const waitMs = this.rateLimitInfo.resetAt.getTime() - Date.now();
      // TODO: log.warn(`BatchData rate limited, waiting ${waitMs}ms`)
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 60_000)));
    }
  }

  // -------------------------------------------------------------------------
  // HTTP helpers
  // -------------------------------------------------------------------------

  private async get(path: string): Promise<unknown> {
    await this.checkRateLimit();

    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    this.parseRateLimitHeaders(response.headers);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `BatchData GET ${path} failed: ${response.status} ${response.statusText} – ${body}`,
      );
    }

    return response.json();
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    await this.checkRateLimit();

    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    this.parseRateLimitHeaders(response.headers);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `BatchData POST ${path} failed: ${response.status} ${response.statusText} – ${text}`,
      );
    }

    return response.json();
  }

  // -------------------------------------------------------------------------
  // Search body builder
  // -------------------------------------------------------------------------

  private buildSearchBody(params: PropertySearchParams): Record<string, unknown> {
    const body: Record<string, unknown> = {
      page: params.page ?? 1,
      limit: params.limit ?? 25,
    };

    if (params.county) body.county = params.county;
    if (params.zipCodes?.length) body.zipCodes = params.zipCodes;
    if (params.propertyTypes?.length) body.propertyTypes = params.propertyTypes;
    if (params.minEquity !== undefined) body.minEquityPercent = params.minEquity;
    if (params.maxPrice !== undefined) body.maxPrice = params.maxPrice;
    if (params.minBeds !== undefined) body.minBedrooms = params.minBeds;
    if (params.ownerOccupied !== undefined) body.ownerOccupied = params.ownerOccupied;
    if (params.absenteeOwner !== undefined) body.absenteeOwner = params.absenteeOwner;

    // Map distress stage filters to BatchData-specific parameters
    if (params.distressStages?.length) {
      body.distressFilters = params.distressStages.map((stage) =>
        this.mapDistressStageToBatchData(stage),
      );
    }

    return body;
  }

  private mapDistressStageToBatchData(stage: string): string {
    const mapping: Record<string, string> = {
      PRE_FORECLOSURE: "preForeclosure",
      LIS_PENDENS: "lisPendens",
      NOTICE_OF_DEFAULT: "noticeOfDefault",
      NOTICE_OF_SALE: "noticeOfSale",
      AUCTION_SCHEDULED: "auctionScheduled",
      REO: "reo",
      BANK_OWNED: "bankOwned",
      TAX_LIEN: "taxLien",
      PROBATE: "probate",
      BANKRUPTCY: "bankruptcy",
    };
    return mapping[stage] ?? stage.toLowerCase();
  }
}
