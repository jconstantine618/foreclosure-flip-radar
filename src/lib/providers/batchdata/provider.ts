import type {
  NormalizedProperty,
  PropertySearchParams,
  PropertySearchResult,
  ProviderConfig,
  DistressStage,
  PropertyType,
} from "@/types";
import type { PropertyProvider, ComparableSale } from "../interfaces";
import { BatchDataClient, type BatchDataProperty } from "./client";
import {
  lookupParcelByCoords,
  queryParcelsInArea,
} from "../county/horry-arcgis";
import { lookupGreenvilleParcel } from "../county/greenville-arcgis";

// ---------------------------------------------------------------------------
// Haversine distance (miles) between two lat/lon points
// ---------------------------------------------------------------------------

function haversineDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3958.8; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  // Comparables
  // -------------------------------------------------------------------------

  /**
   * Fetch comparable recently-sold properties using a two-source approach:
   *
   * 1. BatchData compAddress search â nearby property addresses + lat/lon
   * 2. Horry County ArcGIS spatial query â market values, sale dates
   *
   * BatchData's compAddress search only returns basic info (_id, address,
   * ids, owner) on the current plan. County public records fill in the
   * valuation data for free via their ArcGIS REST API.
   */
  async getComparables(params: {
    street: string;
    city: string;
    state: string;
    zip: string;
    county?: string;
    subjectLat?: number;
    subjectLon?: number;
    take?: number;
    distanceMiles?: number;
  }): Promise<{ comps: ComparableSale[]; totalFound: number }> {
    const response = await this.client.getComps(params);
    const subjectCounty = (params.county ?? "").toLowerCase();
    const subjectLat = params.subjectLat;
    const subjectLon = params.subjectLon;

    console.log(
      `[Comps] BatchData returned ${response.results.properties.length} nearby properties (total: ${response.results.total}), county hint: ${subjectCounty || "none"}`,
    );

    // Enrich each property with county data using lat/lon from BatchData
    const enrichedComps = await Promise.allSettled(
      response.results.properties.map(async (p) => {
        const r = p as Record<string, any>;
        const lat = r.address?.latitude;
        const lon = r.address?.longitude;
        const address = r.address?.street ?? r.address?.line1 ?? "";
        const compCounty = (r.address?.county ?? subjectCounty).toLowerCase();

        // Try BatchData fields first (higher-tier plans include this data)
        let salePrice =
          r.sale?.lastSale?.salePrice ??
          r.sale?.lastSale?.price ??
          r.sale?.saleTransAmount ??
          r.valuation?.lastSalePrice ??
          0;
        let saleDate =
          r.sale?.lastSale?.saleDate ??
          r.sale?.lastSale?.recordingDate ??
          null;
        let sqft =
          r.building?.livingAreaSquareFeet ??
          r.building?.squareFeet ??
          r.property?.sqft ??
          null;
        let bedrooms =
          r.building?.bedroomCount ??
          r.building?.bedrooms ??
          r.property?.bedrooms ??
          null;
        let bathrooms =
          r.building?.bathroomCount ??
          r.building?.bathrooms ??
          r.property?.bathrooms ??
          null;

        // Fallback 1: Use BatchData assessed/estimated values if no sale price
        if (salePrice === 0) {
          salePrice =
            r.assessment?.market?.marketTotalValue ??
            r.assessment?.marketTotalValue ??
            r.valuation?.estimatedValue ??
            r.valuation?.value ??
            r.assessment?.assessed?.assdTotalValue ??
            r.tax?.marketValue ??
            r.tax?.assessedValue ??
            0;
        }

        // Fallback 2: Enrich from county records using the appropriate county GIS
        let countyData: any = null;
        if (lat && lon) {
          if (compCounty.includes("greenville")) {
            // Greenville County ArcGIS — has sale price, sqft, beds, baths, tax market value
            const gvl = await lookupGreenvilleParcel(lat, lon);
            if (gvl) {
              countyData = gvl;
              // Use county sale price if BatchData didn't have one
              if (salePrice === 0 && gvl.salePrice && gvl.salePrice > 0) {
                salePrice = gvl.salePrice;
              }
              // Fall further back to tax market value
              if (salePrice === 0 && gvl.taxMarketValue && gvl.taxMarketValue > 0) {
                salePrice = gvl.taxMarketValue;
              }
              if (gvl.saleDate) {
                saleDate = saleDate ?? gvl.saleDate.toISOString();
              }
              // Backfill property details from county if BatchData is missing them
              if (!sqft && gvl.sqft) sqft = gvl.sqft;
              if (!bedrooms && gvl.bedrooms) bedrooms = gvl.bedrooms;
              if (!bathrooms && gvl.bathrooms) bathrooms = gvl.bathrooms;
            }
          } else if (compCounty.includes("horry")) {
            // Horry County ArcGIS
            const horry = await lookupParcelByCoords(lat, lon);
            if (horry) {
              countyData = horry;
              if (salePrice === 0 && horry.marketProp && horry.marketProp > 0) {
                salePrice = horry.marketProp;
              }
              if (horry.saleDate) {
                saleDate = saleDate ?? horry.saleDate.toISOString();
              }
            }
          } else if (salePrice === 0) {
            // Unknown county — try Horry as general fallback (won't match but won't crash)
            const fallback = await lookupParcelByCoords(lat, lon);
            if (fallback?.marketProp && fallback.marketProp > 0) {
              countyData = fallback;
              salePrice = fallback.marketProp;
              saleDate = fallback.saleDate
                ? fallback.saleDate.toISOString()
                : saleDate;
            }
          }
        }

        return {
          address,
          city: r.address?.city ?? "",
          state: r.address?.state ?? "",
          zipCode: r.address?.zip ?? r.address?.zipCode ?? "",
          salePrice,
          saleDate,
          sqft,
          bedrooms,
          bathrooms,
          yearBuilt: r.building?.yearBuilt ?? null,
          lotSizeSqft: r.lot?.lotSizeSquareFeet ?? r.lot?.lotSize ?? null,
          distanceMiles:
            r.distance?.miles ??
            r.distance ??
            (subjectLat && subjectLon && lat && lon
              ? Math.round(haversineDistanceMiles(subjectLat, subjectLon, lat, lon) * 100) / 100
              : null),
          pricePerSqft:
            salePrice && sqft ? Math.round(salePrice / sqft) : null,
          externalId: r._id ?? r.id ?? null,
          rawData: {
            batchdata: r,
            county: countyData,
          },
        } as ComparableSale;
      }),
    );

    // Collect successful enrichments
    const comps: ComparableSale[] = enrichedComps
      .filter(
        (result): result is PromiseFulfilledResult<ComparableSale> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value);

    // Filter to only properties with a value > 0
    const validComps = comps.filter((c) => c.salePrice > 0);

    console.log(
      `[Comps] After county enrichment: ${validComps.length} comps with values (out of ${comps.length} total)`,
    );

    return { comps: validComps, totalFound: response.results.total };
  }

  // -------------------------------------------------------------------------
  // Mapping
  // -------------------------------------------------------------------------

  private mapToNormalizedProperty(raw: BatchDataProperty): NormalizedProperty {
    // BatchData uses _id, address.latitude/longitude, owner.fullName,
    // building.* for property details, sale.lastSale for sale data,
    // foreclosure.* for distress info, ids.apn for parcel number, etc.
    const r = raw as Record<string, any>;

    // Resolve mailing address – may be an object or a string
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
