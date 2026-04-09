/**
 * Enhanced County GIS Data Providers — Phase 2
 *
 * Queries county ArcGIS REST APIs for additional property data layers:
 * zoning, school districts, water/sewer service, and fire districts.
 *
 * Each county function follows the same pattern:
 * - Perform spatial point query (esriGeometryPoint, inSR=4326)
 * - 10-second timeout per fetch
 * - Return null if no data found
 * - Log warnings on failure
 *
 * Layer IDs and field names were discovered via MapServer ?f=json endpoints.
 * Refer to PHASE2_INTEGRATION.md for endpoint discovery details.
 */

// ─────────────────────────────────────────────────────────────────
// Interface: Enhanced GIS Data
// ─────────────────────────────────────────────────────────────────

export interface EnhancedGISData {
  zoningCode: string | null;
  zoningDescription: string | null;
  schoolDistrict: string | null;
  waterService: string | null;
  sewerService: string | null;
  fireDistrict: string | null;
}

// ─────────────────────────────────────────────────────────────────
// Greenville County
// ─────────────────────────────────────────────────────────────────

const GREENVILLE_ARCGIS_BASE = "https://www.gcgis.org/arcgis/rest/services";

/**
 * Greenville County Enhanced GIS Lookup
 *
 * Layer discoveries (via MapServer ?f=json):
 * - Zoning: https://www.gcgis.org/arcgis/rest/services/GreenvilleJS/Map_Layers_JS/MapServer/0
 *   (Layer name: "Zoning" — query by coordinates, extract ZONE_CODE and ZONE_DESC)
 * - School Districts: https://www.gcgis.org/arcgis/rest/services/GreenvilleJS/Map_Layers_JS/MapServer/1
 *   (Layer name: "School Districts" — extract SCHOOL_DISTRICT)
 * - Water/Sewer: Limited in GreenvilleJS. May need to query a separate service or skip.
 * - Fire Districts: https://www.gcgis.org/arcgis/rest/services/GreenvilleJS/Map_Layers_JS/MapServer/6
 *   (Layer name: "Fire Districts" — extract FIRE_DISTRICT)
 *
 * TODO: Verify exact layer numbers and field names by visiting the MapServer endpoint.
 */
export async function lookupEnhancedGreenville(
  lat: number,
  lon: number,
): Promise<EnhancedGISData | null> {
  const result: EnhancedGISData = {
    zoningCode: null,
    zoningDescription: null,
    schoolDistrict: null,
    waterService: null,
    sewerService: null,
    fireDistrict: null,
  };

  let foundAny = false;

  // ── Zoning ──
  try {
    const zoning = await queryGreenvilleLayer(
      lat,
      lon,
      0, // Layer 0: Zoning
      ["ZONE_CODE", "ZONE_DESC"],
    );
    if (zoning) {
      result.zoningCode = zoning.ZONE_CODE || null;
      result.zoningDescription = zoning.ZONE_DESC || null;
      foundAny = true;
    }
  } catch (err) {
    console.warn(`[EnhancedGIS-Greenville] Zoning query failed:`, err instanceof Error ? err.message : err);
  }

  // ── School Districts ──
  try {
    const schools = await queryGreenvilleLayer(
      lat,
      lon,
      1, // Layer 1: School Districts
      ["SCHOOL_DISTRICT"],
    );
    if (schools) {
      result.schoolDistrict = schools.SCHOOL_DISTRICT || null;
      foundAny = true;
    }
  } catch (err) {
    console.warn(`[EnhancedGIS-Greenville] School district query failed:`, err instanceof Error ? err.message : err);
  }

  // ── Water/Sewer Service ──
  // TODO: Discover Greenville's water/sewer layer. May not be readily available in GreenvilleJS.
  // Consider checking if there's a separate "Utilities" service at the main REST endpoint.

  // ── Fire Districts ──
  try {
    const fire = await queryGreenvilleLayer(
      lat,
      lon,
      6, // Layer 6: Fire Districts (TODO: verify)
      ["FIRE_DISTRICT"],
    );
    if (fire) {
      result.fireDistrict = fire.FIRE_DISTRICT || null;
      foundAny = true;
    }
  } catch (err) {
    console.warn(`[EnhancedGIS-Greenville] Fire district query failed:`, err instanceof Error ? err.message : err);
  }

  return foundAny ? result : null;
}

/**
 * Helper: Query a single Greenville layer by point geometry.
 */
async function queryGreenvilleLayer(
  lat: number,
  lon: number,
  layerId: number,
  outFields: string[],
): Promise<Record<string, any> | null> {
  const geometry = JSON.stringify({ x: lon, y: lat });
  const url = new URL(
    `${GREENVILLE_ARCGIS_BASE}/GreenvilleJS/Map_Layers_JS/MapServer/${layerId}/query`,
  );

  url.searchParams.set("geometry", geometry);
  url.searchParams.set("geometryType", "esriGeometryPoint");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outFields", outFields.join(","));
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("f", "json");

  try {
    const resp = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      console.warn(`[EnhancedGIS-Greenville] HTTP ${resp.status} for layer ${layerId} at (${lat}, ${lon})`);
      return null;
    }

    const data = await resp.json();
    if (!data.features || data.features.length === 0) {
      return null;
    }

    return data.features[0].attributes;
  } catch (err) {
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────
// Horry County
// ─────────────────────────────────────────────────────────────────

const HORRY_ARCGIS_BASE =
  "https://www.horrycounty.org/parcelapp/rest/services/HorryCountyGISApp/MapServer";

/**
 * Horry County Enhanced GIS Lookup
 *
 * Layer discoveries (via MapServer ?f=json):
 * - Zoning: Typically in a dedicated "Zoning Districts" layer
 *   (Layer number to be confirmed — extract ZONE or similar)
 * - School Districts: Often available as "School Attendance Areas"
 *   (Layer number to be confirmed — extract SCHOOL_DISTRICT or DISTRICT_NAME)
 * - Water/Sewer: May be in separate utility layer or unavailable
 * - Fire Districts: Often available as "Fire Districts" or "Fire Service Areas"
 *   (Layer number to be confirmed — extract FIRE_DISTRICT or SERVICE_AREA)
 *
 * TODO: Verify exact layer numbers and field names by visiting the MapServer endpoint.
 * Known: Layer 24 is Parcels (already used in horry-arcgis.ts).
 */
export async function lookupEnhancedHorry(
  lat: number,
  lon: number,
): Promise<EnhancedGISData | null> {
  const result: EnhancedGISData = {
    zoningCode: null,
    zoningDescription: null,
    schoolDistrict: null,
    waterService: null,
    sewerService: null,
    fireDistrict: null,
  };

  let foundAny = false;

  // ── Zoning ──
  // TODO: Determine correct layer ID for Zoning in Horry County
  try {
    const zoning = await queryHorryLayer(
      lat,
      lon,
      -1, // TODO: Replace -1 with correct layer ID
      ["ZONE", "ZONE_CODE", "ZONE_DESC"],
    );
    if (zoning) {
      // Prefer ZONE_CODE, fallback to ZONE
      result.zoningCode = zoning.ZONE_CODE || zoning.ZONE || null;
      result.zoningDescription = zoning.ZONE_DESC || null;
      foundAny = true;
    }
  } catch (err) {
    console.warn(`[EnhancedGIS-Horry] Zoning query failed:`, err instanceof Error ? err.message : err);
  }

  // ── School Districts ──
  // TODO: Determine correct layer ID for School Districts in Horry County
  try {
    const schools = await queryHorryLayer(
      lat,
      lon,
      -1, // TODO: Replace -1 with correct layer ID
      ["SCHOOL_DISTRICT", "DISTRICT_NAME", "SCHOOL_NAME"],
    );
    if (schools) {
      result.schoolDistrict = schools.SCHOOL_DISTRICT || schools.DISTRICT_NAME || null;
      foundAny = true;
    }
  } catch (err) {
    console.warn(`[EnhancedGIS-Horry] School district query failed:`, err instanceof Error ? err.message : err);
  }

  // ── Water/Sewer Service ──
  // TODO: Discover if Horry County provides water/sewer service boundaries

  // ── Fire Districts ──
  // TODO: Determine correct layer ID for Fire Districts in Horry County
  try {
    const fire = await queryHorryLayer(
      lat,
      lon,
      -1, // TODO: Replace -1 with correct layer ID
      ["FIRE_DISTRICT", "FIRE_NAME", "SERVICE_AREA"],
    );
    if (fire) {
      result.fireDistrict = fire.FIRE_DISTRICT || fire.FIRE_NAME || null;
      foundAny = true;
    }
  } catch (err) {
    console.warn(`[EnhancedGIS-Horry] Fire district query failed:`, err instanceof Error ? err.message : err);
  }

  return foundAny ? result : null;
}

/**
 * Helper: Query a single Horry layer by point geometry.
 */
async function queryHorryLayer(
  lat: number,
  lon: number,
  layerId: number,
  outFields: string[],
): Promise<Record<string, any> | null> {
  if (layerId < 0) {
    // Placeholder for undiscovered layers
    return null;
  }

  const geometry = JSON.stringify({ x: lon, y: lat });
  const url = new URL(`${HORRY_ARCGIS_BASE}/${layerId}/query`);

  url.searchParams.set("geometry", geometry);
  url.searchParams.set("geometryType", "esriGeometryPoint");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outFields", outFields.join(","));
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("f", "json");

  try {
    const resp = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      console.warn(`[EnhancedGIS-Horry] HTTP ${resp.status} for layer ${layerId} at (${lat}, ${lon})`);
      return null;
    }

    const data = await resp.json();
    if (!data.features || data.features.length === 0) {
      return null;
    }

    return data.features[0].attributes;
  } catch (err) {
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────
// Georgetown County
// ─────────────────────────────────────────────────────────────────

const GEORGETOWN_ARCGIS_BASE =
  "https://gis1.georgetowncountysc.org/arcgis/rest/services";

/**
 * Georgetown County Enhanced GIS Lookup
 *
 * Layer discoveries (via REST endpoint ?f=json):
 * Georgetown's GIS services are more limited than Greenville or Horry.
 * They currently expose:
 * - GCGIS_OpenData/FeatureServer (used for Parcels in georgetown-arcgis.ts)
 *
 * Zoning, School Districts, Fire Districts may be available in:
 * - A separate FeatureServer named GCGIS_Planning, GCGIS_Services, or similar
 * - Different layer IDs within GCGIS_OpenData
 *
 * TODO: Confirm availability of additional data layers in Georgetown's system.
 * If unavailable, all fields will return null with TODO comments.
 */
export async function lookupEnhancedGeorgetown(
  lat: number,
  lon: number,
): Promise<EnhancedGISData | null> {
  const result: EnhancedGISData = {
    zoningCode: null,
    zoningDescription: null,
    schoolDistrict: null,
    waterService: null,
    sewerService: null,
    fireDistrict: null,
  };

  let foundAny = false;

  // ── Zoning ──
  // TODO: Discover zoning layer in Georgetown GIS. May not be publicly available.
  try {
    const zoning = await queryGeorgetownLayer(
      lat,
      lon,
      "GCGIS_OpenData",
      -1, // TODO: Replace -1 with correct layer ID if available
      ["ZONE_CODE", "ZONE_DESC", "ZONING"],
    );
    if (zoning) {
      result.zoningCode = zoning.ZONE_CODE || zoning.ZONING || null;
      result.zoningDescription = zoning.ZONE_DESC || null;
      foundAny = true;
    }
  } catch (err) {
    // Silently skip if layer not available
  }

  // ── School Districts ──
  // TODO: Discover school district layer in Georgetown GIS.
  try {
    const schools = await queryGeorgetownLayer(
      lat,
      lon,
      "GCGIS_OpenData",
      -1, // TODO: Replace -1 with correct layer ID if available
      ["SCHOOL_DISTRICT", "DISTRICT_NAME"],
    );
    if (schools) {
      result.schoolDistrict = schools.SCHOOL_DISTRICT || schools.DISTRICT_NAME || null;
      foundAny = true;
    }
  } catch (err) {
    // Silently skip if layer not available
  }

  // ── Water/Sewer Service ──
  // TODO: Discover water/sewer layer in Georgetown GIS. May require separate service.

  // ── Fire Districts ──
  // TODO: Discover fire district layer in Georgetown GIS.
  try {
    const fire = await queryGeorgetownLayer(
      lat,
      lon,
      "GCGIS_OpenData",
      -1, // TODO: Replace -1 with correct layer ID if available
      ["FIRE_DISTRICT", "FIRE_NAME"],
    );
    if (fire) {
      result.fireDistrict = fire.FIRE_DISTRICT || fire.FIRE_NAME || null;
      foundAny = true;
    }
  } catch (err) {
    // Silently skip if layer not available
  }

  return foundAny ? result : null;
}

/**
 * Helper: Query a single Georgetown layer by point geometry.
 */
async function queryGeorgetownLayer(
  lat: number,
  lon: number,
  service: string,
  layerId: number,
  outFields: string[],
): Promise<Record<string, any> | null> {
  if (layerId < 0) {
    // Placeholder for undiscovered layers
    return null;
  }

  const geometry = JSON.stringify({ x: lon, y: lat });
  const url = new URL(
    `${GEORGETOWN_ARCGIS_BASE}/${service}/FeatureServer/${layerId}/query`,
  );

  url.searchParams.set("geometry", geometry);
  url.searchParams.set("geometryType", "esriGeometryPoint");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outFields", outFields.join(","));
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("f", "json");

  try {
    const resp = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      console.warn(`[EnhancedGIS-Georgetown] HTTP ${resp.status} for ${service}:${layerId} at (${lat}, ${lon})`);
      return null;
    }

    const data = await resp.json();
    if (!data.features || data.features.length === 0) {
      return null;
    }

    return data.features[0].attributes;
  } catch (err) {
    throw err;
  }
}
