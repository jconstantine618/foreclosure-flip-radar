/**
 * FEMA National Flood Hazard Layer (NFHL) ArcGIS REST API client
 *
 * Queries the public FEMA NFHL MapServer to determine flood zone
 * for a given lat/lon coordinate. No API key required.
 *
 * Endpoint: https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer
 * Layer 28: Flood Hazard Zones (S_FLD_HAZ_AR)
 */

const NFHL_BASE =
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer";
const FLOOD_ZONES_LAYER = 28; // S_FLD_HAZ_AR — Flood Hazard Zones

export interface FloodZoneData {
  floodZoneCode: string;       // "X", "AE", "A", "AO", "VE", etc.
  floodZoneDesc: string;       // Human-readable description
  baseFloodElevation: number | null; // BFE in feet, null if not applicable
  specialFloodHazard: boolean; // true if in SFHA (requires flood insurance)
  zoneSubtype: string | null;  // ZONE_SUBTY field
  rawZone: string;             // Original FLD_ZONE value
}

/**
 * Map FEMA flood zone codes to human-readable descriptions.
 */
const ZONE_DESCRIPTIONS: Record<string, string> = {
  A: "100-Year Floodplain (no BFE determined)",
  AE: "100-Year Floodplain (BFE determined)",
  AH: "100-Year Shallow Flooding (1-3 ft)",
  AO: "100-Year Shallow Flooding (sheet flow)",
  AR: "100-Year Floodplain (temporary — levee restoration)",
  "A99": "100-Year Floodplain (Federal flood protection)",
  D: "Undetermined Flood Hazard",
  V: "Coastal 100-Year Floodplain (no BFE)",
  VE: "Coastal 100-Year Floodplain (BFE determined)",
  X: "Minimal Flood Risk",
  "AREA NOT INCLUDED": "Area Not Mapped",
  "OPEN WATER": "Open Water",
};

/**
 * SFHA zones — these require mandatory flood insurance for federally-backed mortgages.
 * Any zone starting with A or V is a Special Flood Hazard Area.
 */
function isSFHA(zoneCode: string): boolean {
  const upper = zoneCode.toUpperCase().trim();
  return upper.startsWith("A") || upper.startsWith("V");
}

/**
 * Look up flood zone for a given lat/lon using FEMA NFHL ArcGIS REST API.
 * Uses a point geometry spatial query against the Flood Hazard Zones layer.
 * Returns null if no flood data is available for the location.
 */
export async function lookupFloodZone(
  lat: number,
  lon: number,
): Promise<FloodZoneData | null> {
  const geometry = JSON.stringify({ x: lon, y: lat });
  const outFields = [
    "FLD_ZONE",
    "ZONE_SUBTY",
    "STATIC_BFE",
    "SFHA_TF",
  ].join(",");

  const url = new URL(`${NFHL_BASE}/${FLOOD_ZONES_LAYER}/query`);
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
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      console.warn(`[FEMA-NFHL] HTTP ${resp.status} for coords (${lat}, ${lon})`);
      return null;
    }

    const data = await resp.json();

    if (!data.features || data.features.length === 0) {
      console.log(`[FEMA-NFHL] No flood zone data for (${lat}, ${lon})`);
      return null;
    }

    const attrs = data.features[0].attributes;
    const zoneCode = (attrs.FLD_ZONE || "").trim();

    if (!zoneCode) {
      return null;
    }

    const bfe = attrs.STATIC_BFE;
    const sfhaField = attrs.SFHA_TF;

    return {
      floodZoneCode: zoneCode,
      floodZoneDesc: ZONE_DESCRIPTIONS[zoneCode] || `Flood Zone ${zoneCode}`,
      baseFloodElevation: bfe && bfe > 0 ? bfe : null,
      specialFloodHazard: sfhaField === "T" || sfhaField === true || isSFHA(zoneCode),
      zoneSubtype: attrs.ZONE_SUBTY || null,
      rawZone: zoneCode,
    };
  } catch (err) {
    console.warn(
      `[FEMA-NFHL] Error querying flood zone for (${lat}, ${lon}):`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
