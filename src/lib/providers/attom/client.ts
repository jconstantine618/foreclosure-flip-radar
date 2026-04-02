import { z } from "zod";
import type { ProviderConfig } from "@/types";

// ---------------------------------------------------------------------------
// ATTOM API response schemas (Zod validation)
// ---------------------------------------------------------------------------

const AttomPropertySchema = z.object({
  identifier: z.object({
    Id: z.union([z.string(), z.number()]).optional(),
    apn: z.string().optional(),
    fips: z.string().optional(),
  }).optional(),
  address: z.object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    locality: z.string().optional(),
    countrySubd: z.string().optional(),
    postal1: z.string().optional(),
    country: z.string().optional(),
    oneLine: z.string().optional(),
  }).optional(),
  location: z.object({
    latitude: z.union([z.string(), z.number()]).optional(),
    longitude: z.union([z.string(), z.number()]).optional(),
    county: z.string().optional(),
  }).optional(),
  summary: z.object({
    propclass: z.string().optional(),
    proptype: z.string().optional(),
    propsubtype: z.string().optional(),
    yearbuilt: z.number().optional(),
    absenteeInd: z.string().optional(),
  }).optional(),
  building: z.object({
    rooms: z.object({
      beds: z.number().optional(),
      bathstotal: z.number().optional(),
    }).optional(),
    size: z.object({
      universalsize: z.number().optional(),
      livingsize: z.number().optional(),
      grosssize: z.number().optional(),
    }).optional(),
    interior: z.object({
      fplccount: z.number().optional(),
    }).optional(),
  }).optional(),
  lot: z.object({
    lotsize1: z.number().optional(),
    lotsize2: z.number().optional(),
  }).optional(),
  assessment: z.object({
    assessed: z.object({
      assdttlvalue: z.number().optional(),
    }).optional(),
    market: z.object({
      mktttlvalue: z.number().optional(),
    }).optional(),
    tax: z.object({
      taxamt: z.number().optional(),
      taxyear: z.number().optional(),
    }).optional(),
  }).optional(),
  sale: z.object({
    amount: z.object({
      saleamt: z.number().optional(),
    }).optional(),
    saleTransDate: z.string().optional(),
  }).optional(),
  owner: z.object({
    owner1: z.object({
      fullName: z.string().optional(),
      lastName: z.string().optional(),
      firstNameAndMi: z.string().optional(),
    }).optional(),
    mailingaddressoneline: z.string().optional(),
    absenteeOwnerStatus: z.string().optional(),
  }).optional(),
  avm: z.object({
    amount: z.object({
      value: z.number().optional(),
    }).optional(),
    eventDate: z.string().optional(),
    confidence: z.number().optional(),
  }).optional(),
}).passthrough();

export type AttomProperty = z.infer<typeof AttomPropertySchema>;

const AttomSearchResponseSchema = z.object({
  status: z.object({
    code: z.number().optional(),
    msg: z.string().optional(),
    total: z.number().optional(),
    page: z.number().optional(),
    pagesize: z.number().optional(),
  }).optional(),
  property: z.array(AttomPropertySchema).default([]),
}).passthrough();

export type AttomSearchResponse = z.infer<typeof AttomSearchResponseSchema>;

const AttomAVMResponseSchema = z.object({
  status: z.object({
    code: z.number().optional(),
    msg: z.string().optional(),
  }).optional(),
  property: z.array(
    z.object({
      avm: z.object({
        amount: z.object({
          value: z.number().optional(),
          high: z.number().optional(),
          low: z.number().optional(),
        }).optional(),
        eventDate: z.string().optional(),
        confidence: z.number().optional(),
      }).optional(),
    }).passthrough(),
  ).default([]),
}).passthrough();

export type AttomAVMResponse = z.infer<typeof AttomAVMResponseSchema>;

// ---------------------------------------------------------------------------
// Rate limit tracking
// ---------------------------------------------------------------------------

interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: Date;
}

// ---------------------------------------------------------------------------
// AttomClient
// ---------------------------------------------------------------------------

export class AttomClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly rateLimit: number;
  private rateLimitInfo: RateLimitInfo | null = null;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.rateLimit = config.rateLimit;
  }

  // -------------------------------------------------------------------------
  // Public API methods
  // -------------------------------------------------------------------------

  /**
   * Search properties using ATTOM property search endpoints.
   */
  async searchProperties(params: {
    postalCode?: string;
    county?: string;
    propertyType?: string;
    minBeds?: number;
    maxPrice?: number;
    ownerOccupied?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<AttomSearchResponse> {
    const query = new URLSearchParams();

    if (params.postalCode) query.set("postalcode", params.postalCode);
    if (params.county) query.set("countyname", params.county);
    if (params.propertyType) query.set("propertytype", params.propertyType);
    if (params.minBeds) query.set("minBeds", String(params.minBeds));
    if (params.maxPrice) query.set("maxAVMValue", String(params.maxPrice));
    if (params.ownerOccupied !== undefined) {
      query.set("absenteeInd", params.ownerOccupied ? "O" : "A");
    }
    if (params.page) query.set("page", String(params.page));
    if (params.pageSize) query.set("pagesize", String(params.pageSize));

    const raw = await this.get(`/property/snapshot?${query.toString()}`);
    const parsed = AttomSearchResponseSchema.safeParse(raw);

    if (!parsed.success) {
      // TODO: log.warn("ATTOM search response validation failed", parsed.error)
      return {
        status: { code: 0, msg: "parse_error", total: 0, page: 1, pagesize: 25 },
        property: [],
      };
    }

    return parsed.data;
  }

  /**
   * Get full property details by ATTOM property ID.
   */
  async getPropertyDetails(attomId: string): Promise<AttomProperty | null> {
    try {
      const raw = await this.get(
        `/property/detail?attomid=${encodeURIComponent(attomId)}`,
      );
      const parsed = AttomSearchResponseSchema.safeParse(raw);

      if (!parsed.success || parsed.data.property.length === 0) {
        return null;
      }

      return parsed.data.property[0];
    } catch (err) {
      // TODO: log.error("ATTOM getPropertyDetails failed", err)
      return null;
    }
  }

  /**
   * Get automated valuation model (AVM) data for a property.
   */
  async getAVM(params: {
    address?: string;
    attomId?: string;
  }): Promise<AttomAVMResponse | null> {
    try {
      const query = new URLSearchParams();
      if (params.attomId) query.set("attomid", params.attomId);
      if (params.address) query.set("address1", params.address);

      const raw = await this.get(`/valuation/homeequity?${query.toString()}`);
      const parsed = AttomAVMResponseSchema.safeParse(raw);

      if (!parsed.success) {
        // TODO: log.warn("ATTOM AVM response validation failed", parsed.error)
        return null;
      }

      return parsed.data;
    } catch (err) {
      // TODO: log.error("ATTOM getAVM failed", err)
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
      // TODO: log.warn(`ATTOM rate limited, waiting ${waitMs}ms`)
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
        apikey: this.apiKey,
        Accept: "application/json",
      },
    });

    this.parseRateLimitHeaders(response.headers);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `ATTOM GET ${path} failed: ${response.status} ${response.statusText} – ${body}`,
      );
    }

    return response.json();
  }
}
