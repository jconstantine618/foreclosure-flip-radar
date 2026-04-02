import type {
  NormalizedNotice,
  NormalizedProperty,
  PropertySearchParams,
  PropertySearchResult,
} from "@/types";

// ---------------------------------------------------------------------------
// PropertyProvider
// ---------------------------------------------------------------------------

export interface PropertyProvider {
  /** Human-readable provider name (e.g. "batchdata", "attom") */
  readonly name: string;

  /**
   * Search properties using normalized filter parameters.
   * Implementations map these to provider-specific API calls.
   */
  searchProperties(params: PropertySearchParams): Promise<PropertySearchResult>;

  /**
   * Fetch full property details by provider-specific or internal ID.
   * Returns null when the property cannot be found.
   */
  getPropertyDetails(id: string): Promise<NormalizedProperty | null>;

  /**
   * Enrich an existing NormalizedProperty with additional data from this
   * provider (e.g. fill in missing valuation, owner info, etc.).
   */
  enrichProperty(property: NormalizedProperty): Promise<NormalizedProperty>;
}

// ---------------------------------------------------------------------------
// NoticeProvider
// ---------------------------------------------------------------------------

export interface NoticeProvider {
  readonly name: string;

  /**
   * Fetch foreclosure / distress notices for a given county.
   * Optionally filter by date range and notice type.
   */
  fetchNotices(
    county: string,
    options?: { since?: Date; noticeType?: string },
  ): Promise<NormalizedNotice[]>;
}

// ---------------------------------------------------------------------------
// ValuationProvider
// ---------------------------------------------------------------------------

export interface ValuationProvider {
  readonly name: string;

  /**
   * Return an estimated market value and confidence score (0-1).
   */
  getEstimatedValue(
    address: string,
    zipCode: string,
  ): Promise<{ value: number; confidence: number } | null>;

  /**
   * Fetch comparable sales within the given radius (miles).
   */
  getComparables(
    address: string,
    zipCode: string,
    radius?: number,
  ): Promise<ComparableSale[]>;
}

/** Minimal comparable sale record returned by valuation providers. */
export interface ComparableSale {
  address: string;
  salePrice: number;
  saleDate: string | Date;
  sqft?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  distanceMiles?: number | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// GeocodingProvider
// ---------------------------------------------------------------------------

export interface GeocodingProvider {
  readonly name: string;

  /**
   * Geocode an address string to lat/lng coordinates.
   * Returns null when the address cannot be resolved.
   */
  geocode(
    address: string,
  ): Promise<{ lat: number; lng: number } | null>;
}
