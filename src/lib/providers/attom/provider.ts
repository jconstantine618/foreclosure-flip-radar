import type {
  NormalizedProperty,
  PropertySearchParams,
  PropertySearchResult,
  ProviderConfig,
  DistressStage,
  PropertyType,
} from "@/types";
import type { PropertyProvider } from "../interfaces";
import { AttomClient, type AttomProperty } from "./client";

// ---------------------------------------------------------------------------
// AttomPropertyProvider
// ---------------------------------------------------------------------------

export class AttomPropertyProvider implements PropertyProvider {
  readonly name = "attom";
  private readonly client: AttomClient;

  constructor(config: ProviderConfig) {
    this.client = new AttomClient(config);
  }

  /** Expose the underlying client for advanced use (AVM queries, etc.). */
  getClient(): AttomClient {
    return this.client;
  }

  // -------------------------------------------------------------------------
  // PropertyProvider interface
  // -------------------------------------------------------------------------

  async searchProperties(
    params: PropertySearchParams,
  ): Promise<PropertySearchResult> {
    // ATTOM only supports a single zip per request; iterate if multiple
    const zipCodes = params.zipCodes?.length ? params.zipCodes : [undefined];
    const allProperties: NormalizedProperty[] = [];
    let total = 0;

    for (const zip of zipCodes) {
      const response = await this.client.searchProperties({
        postalCode: zip,
        county: params.county,
        propertyType: params.propertyTypes?.[0]
          ? mapPropertyTypeToAttom(params.propertyTypes[0])
          : undefined,
        minBeds: params.minBeds,
        maxPrice: params.maxPrice,
        ownerOccupied: params.ownerOccupied,
        page: params.page,
        pageSize: params.limit,
      });

      const mapped = response.property.map((p) =>
        this.mapToNormalizedProperty(p),
      );
      allProperties.push(...mapped);
      total += response.status?.total ?? mapped.length;
    }

    // Apply client-side filters that ATTOM doesn't support natively
    let filtered = allProperties;

    if (params.minEquity !== undefined) {
      filtered = filtered.filter(
        (p) =>
          p.equityPercent !== null &&
          p.equityPercent !== undefined &&
          p.equityPercent >= params.minEquity!,
      );
    }

    if (params.absenteeOwner !== undefined) {
      filtered = filtered.filter(
        (p) => p.absenteeOwner === params.absenteeOwner,
      );
    }

    return {
      properties: filtered.slice(0, params.limit ?? 25),
      total,
      page: params.page ?? 1,
      limit: params.limit ?? 25,
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
    // Use ATTOM AVM to fill in valuation data
    const avmResponse = await this.client.getAVM({
      address: `${property.address}, ${property.city}, ${property.state} ${property.zipCode}`,
    });

    if (avmResponse?.property?.[0]?.avm?.amount?.value) {
      const avmData = avmResponse.property[0].avm;
      return {
        ...property,
        estimatedValue:
          property.estimatedValue ?? avmData.amount?.value ?? null,
        rawData: {
          ...(property.rawData as Record<string, unknown> | undefined),
          attomAVM: avmData,
        },
      };
    }

    return property;
  }

  // -------------------------------------------------------------------------
  // Mapping
  // -------------------------------------------------------------------------

  private mapToNormalizedProperty(raw: AttomProperty): NormalizedProperty {
    const attomId = raw.identifier?.Id;

    return {
      externalId: attomId != null ? String(attomId) : undefined,
      provider: this.name,

      // Location
      address: raw.address?.line1 ?? raw.address?.oneLine ?? "",
      addressLine2: raw.address?.line2 ?? null,
      city: raw.address?.locality ?? "",
      state: raw.address?.countrySubd ?? "",
      zipCode: raw.address?.postal1 ?? "",
      county: raw.location?.county ?? "",
      parcelNumber: raw.identifier?.apn ?? null,
      latitude: parseCoord(raw.location?.latitude),
      longitude: parseCoord(raw.location?.longitude),

      // Property details
      propertyType: mapAttomPropertyType(raw.summary?.proptype),
      bedrooms: raw.building?.rooms?.beds ?? null,
      bathrooms: raw.building?.rooms?.bathstotal ?? null,
      sqft:
        raw.building?.size?.livingsize ??
        raw.building?.size?.universalsize ??
        null,
      lotSizeSqft: raw.lot?.lotsize2 ?? raw.lot?.lotsize1 ?? null,
      yearBuilt: raw.summary?.yearbuilt ?? null,

      // Ownership
      ownerName: raw.owner?.owner1?.fullName ?? null,
      ownerAddress: raw.owner?.mailingaddressoneline ?? null,
      ownerOccupied:
        raw.summary?.absenteeInd === "O" ||
        raw.owner?.absenteeOwnerStatus === "O"
          ? true
          : raw.summary?.absenteeInd === "A" ||
              raw.owner?.absenteeOwnerStatus === "A"
            ? false
            : null,
      absenteeOwner:
        raw.summary?.absenteeInd === "A" ||
        raw.owner?.absenteeOwnerStatus === "A"
          ? true
          : raw.summary?.absenteeInd === "O" ||
              raw.owner?.absenteeOwnerStatus === "O"
            ? false
            : null,

      // Valuation
      estimatedValue:
        raw.avm?.amount?.value ??
        raw.assessment?.market?.mktttlvalue ??
        null,
      assessedValue: raw.assessment?.assessed?.assdttlvalue ?? null,
      lastSalePrice: raw.sale?.amount?.saleamt ?? null,
      lastSaleDate: raw.sale?.saleTransDate ?? null,
      taxAmount: raw.assessment?.tax?.taxamt ?? null,

      // Mortgage / equity – ATTOM doesn't always provide these directly
      mortgageBalance: null,
      equityEstimate: null,
      equityPercent: null,
      lienAmount: null,

      // Distress – ATTOM basic search doesn't include distress data
      distressStage: null,
      listingPrice: null,
      auctionDate: null,
      defaultAmount: null,
      recordingDate: null,

      // Raw data
      rawData: raw as unknown as Record<string, unknown>,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCoord(val: string | number | undefined): number | null {
  if (val === undefined || val === null) return null;
  const num = typeof val === "string" ? parseFloat(val) : val;
  return isNaN(num) ? null : num;
}

function mapAttomPropertyType(raw: string | undefined): PropertyType | null {
  if (!raw) return null;

  const lower = raw.toLowerCase();

  if (lower.includes("single") || lower.includes("sfr")) return "SINGLE_FAMILY";
  if (lower.includes("multi") || lower.includes("duplex") || lower.includes("triplex"))
    return "MULTI_FAMILY";
  if (lower.includes("condo")) return "CONDO";
  if (lower.includes("town")) return "TOWNHOUSE";
  if (lower.includes("mobile") || lower.includes("manufactured"))
    return "MANUFACTURED";
  if (lower.includes("land") || lower.includes("vacant")) return "LAND";
  if (lower.includes("commercial") || lower.includes("office") || lower.includes("retail"))
    return "COMMERCIAL";

  return "OTHER";
}

function mapPropertyTypeToAttom(type: PropertyType): string {
  const mapping: Record<string, string> = {
    SINGLE_FAMILY: "SFR",
    MULTI_FAMILY: "MULTI-FAMILY",
    CONDO: "CONDOMINIUM",
    TOWNHOUSE: "TOWNHOUSE",
    MANUFACTURED: "MANUFACTURED",
    LAND: "VACANT LAND",
    COMMERCIAL: "COMMERCIAL",
    OTHER: "",
  };
  return mapping[type] ?? "";
}
