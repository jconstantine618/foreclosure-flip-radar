import type {
  NormalizedProperty,
  PropertySearchParams,
  PropertySearchResult,
  ProviderConfig,
  DistressStage,
  PropertyType,
} from "@/types";
import type { PropertyProvider } from "../interfaces";
import { BatchDataClient, type BatchDataProperty } from "./client";

// ---------------------------------------------------------------------------
// BatchDataPropertyProvider
// ---------------------------------------------------------------------------

export class BatchDataPropertyProvider implements PropertyProvider {
  readonly name = "batchdata";
  private readonly client: BatchDataClient;

  constructor(config: ProviderConfig) {
    this.client = new BatchDataClient(config);
  }

  /** Expose the underlying client for advanced use (cache setup, etc.). */
  getClient(): BatchDataClient {
    return this.client;
  }

  // -------------------------------------------------------------------------
  // PropertyProvider interface
  // -------------------------------------------------------------------------

  async searchProperties(
    params: PropertySearchParams,
  ): Promise<PropertySearchResult> {
    const response = await this.client.searchProperties(params);

    const properties = response.results.properties.map((p) =>
      this.mapToNormalizedProperty(p),
    );

    return {
      properties,
      total: response.results.total,
      page: response.results.page,
      limit: response.results.limit,
      provider: this.name,
    };
  }

  async getPropertyDetails(id: string): Promise<NormalizedProperty | null> {
    const property = await this.client.getPropertyDetails(id);
    if (!property) return null;
    return this.mapToNormalizedProperty(property);
  }

  async enrichProperty(
    property: NormalizedProperty,
  ): Promise<NormalizedProperty> {
    // Try to look up by address to fill missing fields
    const found = await this.client.getPropertyByAddress(
      `${property.address}, ${property.city}, ${property.state} ${property.zipCode}`,
    );

    if (!found) return property;

    const enriched = this.mapToNormalizedProperty(found);

    // Merge: keep existing values, fill in nulls/undefined from enriched data
    return {
      ...enriched,
      ...removeNulls(property as unknown as Record<string, unknown>) as Partial<NormalizedProperty>,
      // Preserve original id and provider
      id: property.id,
      provider: property.provider,
      // Stash raw data from both sources
      rawData: {
        ...(enriched.rawData as Record<string, unknown> | undefined),
        ...(property.rawData as Record<string, unknown> | undefined),
      },
    };
  }

  // -------------------------------------------------------------------------
  // Mapping
  // -------------------------------------------------------------------------

  private mapToNormalizedProperty(raw: BatchDataProperty): NormalizedProperty {
    return {
      externalId: raw.id ?? undefined,
      provider: this.name,

      // Location
      address: raw.address?.street ?? "",
      city: raw.address?.city ?? "",
      state: raw.address?.state ?? "",
      zipCode: raw.address?.zip ?? "",
      county: raw.address?.county ?? "",
      parcelNumber: raw.parcel?.parcelNumber ?? raw.parcel?.apn ?? null,
      latitude: raw.location?.latitude ?? null,
      longitude: raw.location?.longitude ?? null,

      // Property details
      propertyType: mapPropertyType(raw.property?.type),
      bedrooms: raw.property?.bedrooms ?? null,
      bathrooms: raw.property?.bathrooms ?? null,
      sqft: raw.property?.sqft ?? null,
      lotSizeSqft: raw.property?.lotSizeSqft ?? null,
      yearBuilt: raw.property?.yearBuilt ?? null,
      stories: raw.property?.stories ?? null,

      // Ownership
      ownerName: raw.owner?.name ?? null,
      ownerAddress: raw.owner?.mailingAddress ?? null,
      ownerOccupied: raw.owner?.ownerOccupied ?? null,
      absenteeOwner: raw.owner?.absenteeOwner ?? null,

      // Valuation
      estimatedValue: raw.valuation?.estimatedValue ?? null,
      assessedValue: raw.valuation?.assessedValue ?? null,
      lastSalePrice: raw.valuation?.lastSalePrice ?? null,
      lastSaleDate: raw.valuation?.lastSaleDate ?? null,
      taxAmount: raw.valuation?.taxAmount ?? null,

      // Mortgage / equity
      mortgageBalance: raw.mortgage?.balance ?? null,
      equityEstimate: raw.mortgage?.equityEstimate ?? null,
      equityPercent: raw.mortgage?.equityPercent ?? null,
      lienAmount: raw.mortgage?.lienAmount ?? null,

      // Distress
      distressStage: mapDistressStage(raw.distress?.stage),
      listingPrice: raw.distress?.listingPrice ?? null,
      auctionDate: raw.distress?.auctionDate ?? null,
      defaultAmount: raw.distress?.defaultAmount ?? null,
      recordingDate: raw.distress?.recordingDate ?? null,

      // Raw data for debugging / auditing
      rawData: raw as unknown as Record<string, unknown>,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapPropertyType(raw: string | undefined): PropertyType | null {
  if (!raw) return null;

  const mapping: Record<string, PropertyType> = {
    single_family: "SINGLE_FAMILY",
    singlefamily: "SINGLE_FAMILY",
    sfr: "SINGLE_FAMILY",
    multi_family: "MULTI_FAMILY",
    multifamily: "MULTI_FAMILY",
    condo: "CONDO",
    condominium: "CONDO",
    townhouse: "TOWNHOUSE",
    townhome: "TOWNHOUSE",
    manufactured: "MANUFACTURED",
    mobile: "MANUFACTURED",
    land: "LAND",
    vacant_land: "LAND",
    commercial: "COMMERCIAL",
  };

  return mapping[raw.toLowerCase()] ?? "OTHER";
}

function mapDistressStage(raw: string | undefined): DistressStage | null {
  if (!raw) return null;

  const mapping: Record<string, DistressStage> = {
    preforeclosure: "PRE_FORECLOSURE",
    pre_foreclosure: "PRE_FORECLOSURE",
    lispendens: "LIS_PENDENS",
    lis_pendens: "LIS_PENDENS",
    noticeofdefault: "NOTICE_OF_DEFAULT",
    notice_of_default: "NOTICE_OF_DEFAULT",
    noticeofsale: "NOTICE_OF_SALE",
    notice_of_sale: "NOTICE_OF_SALE",
    auctionscheduled: "AUCTION_SCHEDULED",
    auction_scheduled: "AUCTION_SCHEDULED",
    reo: "REO",
    bankowned: "BANK_OWNED",
    bank_owned: "BANK_OWNED",
    taxlien: "TAX_LIEN",
    tax_lien: "TAX_LIEN",
    probate: "PROBATE",
    bankruptcy: "BANKRUPTCY",
  };

  return mapping[raw.toLowerCase()] ?? null;
}

/**
 * Return a copy of obj with null/undefined values removed,
 * so spreading it over enriched data preserves non-null originals.
 */
function removeNulls<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined) {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}
