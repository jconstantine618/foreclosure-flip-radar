/**
 * Horry County ArcGIS REST API client
 *
 * Uses the public Horry County GIS parcel layer to enrich property data
 * with assessed market values, sale dates, and land use info.
 *
 * Endpoint: https://www.horrycounty.org/parcelapp/rest/services/HorryCountyGISApp/MapServer/24
 * No API key required. Returns JSON. Supports spatial (lat/lon) queries.
 */

const ARCGIS_BASE =
  "https://www.horrycounty.org/parcelapp/rest/services/HorryCountyGISApp/MapServer";
const PARCELS_LAYER = 24;

export interface CountyParcelData {
  ownerName: string | null;
  saleDate: Date | null;
  marketProp: number | null; // Total market value (land + improvements)
  marketLand: number | null;
  marketImprv: number | null; // Building / improvement value
  acreage: number | null;
  landUseCode: string | null;
  tms: string | null; // Tax Map Sheet number
  marketArea: string | null;
}

/**
 * Look up a parcel by lat/lon using the ArcGIS spatial query.
 * Returns null if no parcel found at those coordinates.
 */
export async function lookupParcelByCoords(
  lat: number,
  lon: number,
): Promise<CountyParcelData | null> {
  const geometry = JSON.stringify({ x: lon, y: lat });
  const outFields = [
    "OwnerName",
    "SaleDate",
    "MarketProp",
    "MarketLand",
    "MarketImprv",
    "Acreage",
    "LandUseCode",
    "TMS",
    "MarketArea",
  ].join(",");

  const url = new URL(`${ARCGIS_BASE}/${PARCELS_LAYER}/query`);
  url.searchParams.set("geometry", geometry);
  url.searchParams.set("geometryType", "esriGeometryPoint");
  url.searchParams.set("inSR", "4326"); // WGS84
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outFields", outFields);
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("f", "json");

  try {
    const resp = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      console.warn(
        `[CountyArcGIS] HTTP ${resp.status} for coords (${lat}, ${lon})`,
      );
      return null;
    }

    const data = await resp.json();
    const feature = data?.features?.[0]?.attributes;
    if (!feature) return null;

    return {
      ownerName: feature.OwnerName?.trim() || null,
      saleDate: feature.SaleDate ? new Date(feature.SaleDate) : null,
      marketProp: feature.MarketProp ?? null,
      marketLand: feature.MarketLand ?? null,
      marketImprv: feature.MarketImprv ?? null,
      acreage: feature.Acreage ?? null,
      landUseCode: feature.LandUseCode ?? null,
      tms: feature.TMS ?? null,
      marketArea: feature.MarketArea ?? null,
    };
  } catch (err) {
    console.warn(
      `[CountyArcGIS] Failed for coords (${lat}, ${lon}):`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Query parcels within a bounding box (for bulk enrichment).
 * Uses an envelope geometry to find all parcels in the area.
 */
export async function queryParcelsInArea(
  centerLat: number,
  centerLon: number,
  radiusMiles: number = 1,
): Promise<CountyParcelData[]> {
  // Approximate degree offset for radius (1 mile â 0.0145 degrees)
  const degOffset = radiusMiles * 0.0145;

  const envelope = JSON.stringify({
    xmin: centerLon - degOffset,
    ymin: centerLat - degOffset,
    xmax: centerLon + degOffset,
    ymax: centerLat + degOffset,
  });

  const outFields = [
    "OwnerName",
    "SaleDate",
    "MarketProp",
    "MarketLand",
    "MarketImprv",
    "Acreage",
    "LandUseCode",
    "TMS",
    "MarketArea",
  ].join(",");

  const url = new URL(`${ARCGIS_BASE}/${PARCELS_LAYER}/query`);
  url.searchParams.set("geometry", envelope);
  url.searchParams.set("geometryType", "esriGeometryEnvelope");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outFields", outFields);
  url.searchParams.set("returnGeometry", "false");
  // Filter for residential properties with a sale date and market value > 0
  url.searchParams.set(
    "where",
    "MarketProp > 0 AND LandUseCode LIKE '1%'",
  );
  url.searchParams.set("orderByFields", "SaleDate DESC");
  url.searchParams.set("resultRecordCount", "50");
  url.searchParams.set("f", "json");

  try {
    const resp = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      console.warn(`[CountyArcGIS] Area query HTTP ${resp.status}`);
      return [];
    }

    const data = await resp.json();
    const features = data?.features ?? [];

    return features.map((f: any) => ({
      ownerName: f.attributes.OwnerName?.trim() || null,
      saleDate: f.attributes.SaleDate ? new Date(f.attributes.SaleDate) : null,
      marketProp: f.attributes.MarketProp ?? null,
      marketLand: f.attributes.MarketLand ?? null,
      marketImprv: f.attributes.MarketImprv ?? null,
      acreage: f.attributes.Acreage ?? null,
      landUseCode: f.attributes.LandUseCode ?? null,
      tms: f.attributes.TMS ?? null,
      marketArea: f.attributes.MarketArea ?? null,
    }));
  } catch (err) {
    console.warn(
      `[CountyArcGIS] Area query failed:`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
