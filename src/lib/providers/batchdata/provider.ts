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
    // BatchData uses _id, address.latitude/longitude, owner.fullName,
    // building.* for property details, sale.lastSale for sale data,
    // foreclosure.* for distress info, ids.apn for parcel number, etc.
    const r = raw as Record<string, any>;

    // Resolve mailing address \u2013 may be an object or a string
    let ownerMailingAddr: string | null = null;
    if (r.owner?.mailingAddress) {
      if (typeof r.owner.mailingAddress === "string") {
        ownerMailingAddr = r.owner.mailingAddress;
      } else if (typeof r.owner.mailingAddress === "object") {
        const ma = r.owner.mailingAddress;
        ownerMailingAddr = [ma.street, ma.city, ma.state, ma.zip]
          .filter(Boolean)
          .join(", ");
      }
    }

    return {
      externalId: r._id ?? r.id ?? undefined,
      provider: this.name,

      // Location
      address: r.address?.street ?? "",
      city: r.address?.city ?? "",
      state: r.address?.state ?? "",
      zipCode: r.address?.zip ?? "",
      county: r.address?.county ?? "",
      parcelNumber: r.ids?.apn ?? r.parcel?.parcelNumber ?? r.parcel?.apn ?? null,
      latitude: r.address?.latitude ?? r.location?.latitude ?? null,
      longitude: r.address?.longitude ?? r.location?.longitude ?? null,

      // Property details (building.* or property.*)
      propertyType: mapPropertyType(r.building?.propertyType ?? r.property?.type),
      bedrooms: r.building?.bedroomCount ?? r.property?.bedrooms ?? null,
      bathrooms: r.building?.bathroomCount ?? r.property?.bathrooms ?? null,
      sqft: r.building?.livingAreaSquareFeet ?? r.property?.sqft ?? null,
      lotSizeSqft: r.lot?.lotSizeSquareFeet ?? r.property?.lotSizeSqft ?? null,
      yearBuilt: r.building?.yearBuilt ?? r.property?.yearBuilt ?? null,
      stories: r.building?.stories ?? r.property?.stories ?? null,

      // Ownership
      ownerName: r.owner?.fullName ?? r.owner?.name ?? null,
      ownerAddress: ownerMailingAddr,
      ownerOccupied: r.owner?.ownerOccupied ?? null,
      absenteeOwner: r.owner?.absenteeOwner ?? null,

      // Valuation
      estimatedValue: r.valuation?.estimatedValue ?? null,
      assessedValue: r.valuation?.assessedValue ?? r.assessment?.assessedValue ?? null,
      lastSalePrice: r.sale?.lastSale?.price ?? r.valuation?.lastSalePrice ?? null,
      lastSaleDate: r.sale?.lastSale?.saleDate ?? r.valuation?.lastSaleDate ?? null,
      taxAmount: r.tax?.totalTaxAmount ?? r.valuation?.taxAmount ?? null,

      // Mortgage / equity
      mortgageBalance: r.mortgage?.balance ?? null,
      equityEstimate: r.mortgage?.equityEstimate ?? null,
      equityPercent: r.mortgage?.equityPercent ?? null,
      lienAmount: r.mortgage?.lienAmount ?? null,

      // Distress (foreclosure.* or distress.*)
      distressStage: mapDistressStage(r.foreclosure?.documentType ?? r.distress?.stage),
      listingPrice: r.listing?.price ?? r.distress?.listingPrice ?? null,
      auctionDate: r.foreclosure?.auctionDate ?? r.distress?.auctionDate ?? null,
      defaultAmount: r.foreclosure?.defaultAmount ?? r.distress?.defaultAmount ?? null,
      recordingDate: r.foreclosure?.recordingDate ?? r.distress?.recordingDate ?? null,

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
    "lis pendens": "LIS_PENDENS",
    noticeofdefault: "NOTICE_OF_DEFAULT",
    notice_of_default: "NOTICE_OF_DEFAULT",
    "notice of default": "NOTICE_OF_DEFAULT",
    noticeofsale: "NOTICE_OF_SALE",
    notice_of_sale: "NOTICE_OF_SALE",
    "notice of sale": "NOTICE_OF_SALE",
    auctionscheduled: "AUCTION_SCHEDULED",
    auction_scheduled: "AUCTION_SCHEDULED",
    reo: "REO",
    bankowned: "BANK_OWNED",
    bank_owned: "BANK_OWNED",
    taxlien: "TAX_LIEN",
    tax_lien: "TAX_LIEN",
    "tax default": "TAX_LIEN",
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
