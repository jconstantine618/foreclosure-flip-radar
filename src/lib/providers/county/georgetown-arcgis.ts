/**
 * Georgetown County ArcGIS REST API client
 *
 * Uses the public Georgetown County GIS services to enrich property data
 * with sale prices, sale dates, and lot area.
 *
 * FeatureServer Layer 2 (Parcels): spatial envelope query → TMS
 * FeatureServer Table 7 (PARCELATTRIBUTES): TMS query → SalePrice, SaleDate, etc.
 *
 * No API key required. Returns JSON.
 */

const ARCGIS_BASE =
  "https://gis1.georgetowncountysc.org/portal/rest/services/GCGIS_OpenData/FeatureServer";
const PARCELS_LAYER = `${ARCGIS_BASE}/2`;
const ATTRIBUTES_TABLE = `${ARCGIS_BASE}/7`;

export interface GeorgetownParcelData {
  tms: string | null;
  salePrice: number | null;
  saleDate: Date | null;
  totalLandArea: number | null;
  landUseCode: string | null;
  ownerName: string | null;
}

/**
 * Look up a parcel by lat/lon. Two-step: spatial query for TMS,
 * then attribute query for property details.
 */
export async function lookupGeorgetownParcel(
  lat: number,
  lon: number,
): Promise<GeorgetownParcelData | null> {
  // Step 1: Spatial query to get TMS
  const buffer = 0.0002;
  const envelope = JSON.stringify({
    xmin: lon - buffer,
    ymin: lat - buffer,
    xmax: lon + buffer,
    ymax: lat + buffer,
  });

  const parcelUrl = new URL(`${PARCELS_LAYER}/query`);
  parcelUrl.searchParams.set("geometry", envelope);
  parcelUrl.searchParams.set("geometryType", "esriGeometryEnvelope");
  parcelUrl.searchParams.set("inSR", "4326");
  parcelUrl.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  parcelUrl.searchParams.set("outFields", "TMS");
  parcelUrl.searchParams.set("returnGeometry", "false");
  parcelUrl.searchParams.set("f", "json");

  try {
    const parcelResp = await fetch(parcelUrl.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!parcelResp.ok) {
      console.warn(`[GeorgetownGIS] HTTP ${parcelResp.status} for coords (${lat}, ${lon})`);
      return null;
    }

    const parcelData = await parcelResp.json();
    const tms = parcelData?.features?.[0]?.attributes?.TMS;
    if (!tms) return null;

    // Step 2: Query PARCELATTRIBUTES by TMS
    const attrUrl = new URL(`${ATTRIBUTES_TABLE}/query`);
    attrUrl.searchParams.set("where", `ParcelID='${tms}'`);
    attrUrl.searchParams.set("outFields", "SalePrice,SaleDate,TotalLandArea,LandUseCode,Owner1");
    attrUrl.searchParams.set("orderByFields", "YearID DESC");
    attrUrl.searchParams.set("resultRecordCount", "1");
    attrUrl.searchParams.set("returnGeometry", "false");
    attrUrl.searchParams.set("f", "json");

    const attrResp = await fetch(attrUrl.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    if (!attrResp.ok) return { tms, salePrice: null, saleDate: null, totalLandArea: null, landUseCode: null, ownerName: null };

    const attrData = await attrResp.json();
    const a = attrData?.features?.[0]?.attributes;
    if (!a) return { tms, salePrice: null, saleDate: null, totalLandArea: null, landUseCode: null, ownerName: null };

    return {
      tms,
      salePrice: a.SalePrice && a.SalePrice > 10 ? a.SalePrice : null,
      saleDate: a.SaleDate ? new Date(a.SaleDate) : null,
      totalLandArea: a.TotalLandArea ?? null,
      landUseCode: a.LandUseCode ?? null,
      ownerName: a.Owner1?.trim() || null,
    };
  } catch (err) {
    console.warn(
      `[GeorgetownGIS] Failed for coords (${lat}, ${lon}):`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
