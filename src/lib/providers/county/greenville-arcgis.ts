/**
 * Greenville County ArcGIS REST API client
 *
 * Uses the public Greenville County GIS parcel layers to enrich property data
 * with sale prices, building details (sqft, bedrooms, bathrooms), lot size,
 * and tax market values.
 *
 * Layer 5 (All Property Types): spatial envelope query → PIN, SALEPRICE, SQFEET, BEDROOMS, etc.
 * Table 2 (Assessment History): PIN query → TAXMKTVAL (market value), TOTTAX
 *
 * No API key required. Returns JSON.
 */

const ARCGIS_BASE =
  "https://www.gcgis.org/arcgis/rest/services/GreenvilleJS";
const PARCEL_LAYER = `${ARCGIS_BASE}/Map_Layers_JS/MapServer/5`;
const ASSESSMENT_TABLE = `${ARCGIS_BASE}/QueryLayers_JS/MapServer/2`;

export interface GreenvilleParcelData {
  pin: string | null;
  salePrice: number | null;
  saleDate: Date | null;
  sqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  halfBaths: number | null;
  lotSize: number | null;
  landUse: string | null;
  propertyType: string | null;
  taxMarketValue: number | null;
  totalTax: number | null;
}

/**
 * Look up a parcel by lat/lon using an envelope spatial query.
 * Greenville's ArcGIS requires envelope geometry (not point) for reliable hits.
 * Returns null if no parcel found at those coordinates.
 */
export async function lookupGreenvilleParcel(
  lat: number,
  lon: number,
): Promise<GreenvilleParcelData | null> {
  // Small envelope around the point (~50ft buffer)
  const buffer = 0.0002;
  const envelope = JSON.stringify({
    xmin: lon - buffer,
    ymin: lat - buffer,
    xmax: lon + buffer,
    ymax: lat + buffer,
  });

  const outFields = [
    "PIN", "SALEPRICE", "SALEDATE", "SQFEET",
    "BEDROOMS", "BATHRMS", "HALFBATH", "LOTSIZE",
    "LANDUSE", "PROPTYPE",
  ].join(",");

  const url = new URL(`${PARCEL_LAYER}/query`);
  url.searchParams.set("geometry", envelope);
  url.searchParams.set("geometryType", "esriGeometryEnvelope");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outFields", outFields);
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("resultRecordCount", "5");
  url.searchParams.set("f", "json");

  try {
    const resp = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      console.warn(`[GreenvilleGIS] HTTP ${resp.status} for coords (${lat}, ${lon})`);
      return null;
    }

    const data = await resp.json();
    const features = data?.features ?? [];
    if (features.length === 0) return null;

    // Pick the feature with the highest sale price (most relevant/recent)
    const feature = features.reduce((best: any, f: any) =>
      (f.attributes.SALEPRICE ?? 0) > (best.attributes.SALEPRICE ?? 0) ? f : best,
      features[0],
    );
    const a = feature.attributes;

    // Now fetch market value from Assessment History table using PIN
    let taxMarketValue: number | null = null;
    let totalTax: number | null = null;
    if (a.PIN) {
      const assessment = await lookupGreenvilleAssessment(a.PIN);
      if (assessment) {
        taxMarketValue = assessment.taxMarketValue;
        totalTax = assessment.totalTax;
      }
    }

    return {
      pin: a.PIN ?? null,
      salePrice: a.SALEPRICE && a.SALEPRICE > 1 ? a.SALEPRICE : null,
      saleDate: a.SALEDATE ? new Date(a.SALEDATE) : null,
      sqft: a.SQFEET ?? null,
      bedrooms: a.BEDROOMS ?? null,
      bathrooms: a.BATHRMS ?? null,
      halfBaths: a.HALFBATH ?? null,
      lotSize: a.LOTSIZE ?? null,
      landUse: a.LANDUSE ?? null,
      propertyType: a.PROPTYPE ?? null,
      taxMarketValue,
      totalTax,
    };
  } catch (err) {
    console.warn(
      `[GreenvilleGIS] Failed for coords (${lat}, ${lon}):`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Look up assessment/tax data by PIN from the Assessment History table.
 * Returns the most recent tax year's data.
 */
async function lookupGreenvilleAssessment(
  pin: string,
): Promise<{ taxMarketValue: number | null; totalTax: number | null } | null> {
  const url = new URL(`${ASSESSMENT_TABLE}/query`);
  url.searchParams.set("where", `PIN='${pin}'`);
  url.searchParams.set("outFields", "TAXYEAR,TAXMKTVAL,TOTTAX");
  url.searchParams.set("orderByFields", "TAXYEAR DESC");
  url.searchParams.set("resultRecordCount", "1");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("f", "json");

  try {
    const resp = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    const feature = data?.features?.[0]?.attributes;
    if (!feature) return null;

    return {
      taxMarketValue: feature.TAXMKTVAL ?? null,
      totalTax: feature.TOTTAX ?? null,
    };
  } catch {
    return null;
  }
}
