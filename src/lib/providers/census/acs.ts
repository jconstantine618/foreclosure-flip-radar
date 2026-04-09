/**
 * US Census Bureau American Community Survey (ACS) 5-Year Estimates API client
 *
 * Retrieves neighborhood demographic data for a given lat/lon by:
 * 1. Geocoding the coordinates to a census tract using the Census Geocoder API
 * 2. Querying the ACS 5-Year Estimates API for demographic data
 *
 * Uses 2022 ACS 5-Year Estimates (most recent complete dataset)
 * No API key required for low-volume use; set CENSUS_API_KEY for production
 *
 * Endpoints:
 * - Geocoder: https://geocoding.geo.census.gov/geocoder/geographies/coordinates
 * - Data API: https://api.census.gov/data/2022/acs/acs5
 */

const CENSUS_GEOCODER_BASE = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates";
const CENSUS_DATA_API_BASE = "https://api.census.gov/data/2022/acs/acs5";

export interface CensusACSData {
  censusTract: string;                    // e.g., "001302"
  medianHouseholdIncome: number | null;   // B19013_001E — in dollars
  medianHomeValue: number | null;         // B25077_001E — in dollars
  vacancyRate: number | null;             // Calculated from B25002 — as decimal 0-1
  ownerOccupiedRate: number | null;       // Calculated from B25003 — as decimal 0-1
  medianGrossRent: number | null;         // B25064_001E — in dollars
}

/**
 * Simple in-memory cache for census tract lookups within a single enrichment run.
 * Maps "lat,lon" to { state: number, county: number, tract: string }
 */
const tractCache = new Map<
  string,
  { state: number; county: number; tract: string } | null
>();

/**
 * Step 1: Geocode lat/lon coordinates to a census tract.
 * Uses the Census Geocoder API (no key required).
 * Returns state FIPS, county FIPS, and tract number.
 */
async function geocodeToCensusTract(
  lat: number,
  lon: number,
): Promise<{ state: number; county: number; tract: string } | null> {
  const cacheKey = `${lat},${lon}`;

  // Check cache first
  if (tractCache.has(cacheKey)) {
    return tractCache.get(cacheKey) || null;
  }

  try {
    const url = new URL(CENSUS_GEOCODER_BASE);
    url.searchParams.set("x", lon.toString());
    url.searchParams.set("y", lat.toString());
    url.searchParams.set("benchmark", "Public_AR_Current");
    url.searchParams.set("vintage", "Current_Current");
    url.searchParams.set("format", "json");

    const resp = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      console.warn(
        `[CensusACS] Geocoder HTTP ${resp.status} for coords (${lat}, ${lon})`,
      );
      tractCache.set(cacheKey, null);
      return null;
    }

    const data = await resp.json();

    // Census Geocoder response has this structure:
    // { result: { geographies: { "Census Tracts": [{ TRACT: "001302", STATE: "45", COUNTY: "045" }] } } }
    const geographies = data?.result?.geographies?.["Census Tracts"];
    if (!geographies || geographies.length === 0) {
      console.warn(`[CensusACS] No census tract found for (${lat}, ${lon})`);
      tractCache.set(cacheKey, null);
      return null;
    }

    const tract = geographies[0];
    const result = {
      state: parseInt(tract.STATE, 10),
      county: parseInt(tract.COUNTY, 10),
      tract: tract.TRACT,
    };

    tractCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn(
      `[CensusACS] Geocoder error for (${lat}, ${lon}):`,
      err instanceof Error ? err.message : err,
    );
    tractCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Step 2: Query ACS 5-Year Estimates for demographic data.
 * Returns an array of arrays where first row is headers.
 * e.g., [["B19013_001E", "B25077_001E", ..., "tract", "state", "county"], [123456, 234567, ..., "001302", "45", "045"]]
 */
async function queryACSData(
  state: number,
  county: number,
  tract: string,
): Promise<Record<string, string | number> | null> {
  try {
    const apiKey = process.env.CENSUS_API_KEY;

    const url = new URL(CENSUS_DATA_API_BASE);
    url.searchParams.set(
      "get",
      "B19013_001E,B25077_001E,B25002_001E,B25002_002E,B25002_003E,B25003_001E,B25003_002E,B25064_001E",
    );
    url.searchParams.set("for", `tract:${tract}`);
    url.searchParams.set("in", `state:${String(state).padStart(2, "0")} county:${String(county).padStart(3, "0")}`);
    if (apiKey) {
      url.searchParams.set("key", apiKey);
    }

    const resp = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      console.warn(
        `[CensusACS] Data API HTTP ${resp.status} for tract ${tract} (${state}, ${county})`,
      );
      return null;
    }

    const data = await resp.json();

    // Census API returns [headers[], data[]].
    // e.g., [["B19013_001E", "B25077_001E", ..., "tract", "state", "county"], [123456, 234567, ..., "001302", "45", "045"]]
    if (!Array.isArray(data) || data.length < 2) {
      console.warn(
        `[CensusACS] Invalid ACS response for tract ${tract} (${state}, ${county})`,
      );
      return null;
    }

    const headers = data[0];
    const values = data[1];

    if (!headers || !values) {
      return null;
    }

    // Convert to object
    const result: Record<string, string | number> = {};
    for (let i = 0; i < headers.length; i++) {
      result[headers[i]] = values[i];
    }

    return result;
  } catch (err) {
    console.warn(
      `[CensusACS] Data API error for tract ${tract} (${state}, ${county}):`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Convert a value from the ACS API to a number or null.
 * Handles Census special values like -666666666 (data not available).
 */
function toNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === "") {
    return null;
  }

  const num = typeof val === "number" ? val : parseFloat(String(val));

  if (Number.isNaN(num) || num < 0) {
    // Census uses negative values to indicate missing/suppressed data
    return null;
  }

  return num;
}

/**
 * Main entry point: look up census data for a given lat/lon.
 * Uses a two-step process:
 * 1. Geocode to census tract
 * 2. Query ACS 5-Year Estimates
 *
 * Returns null on any failure.
 */
export async function lookupCensusData(
  lat: number,
  lon: number,
): Promise<CensusACSData | null> {
  // Step 1: Geocode to census tract
  const tractData = await geocodeToCensusTract(lat, lon);
  if (!tractData) {
    return null;
  }

  // Step 2: Query ACS data
  const acsData = await queryACSData(tractData.state, tractData.county, tractData.tract);
  if (!acsData) {
    return null;
  }

  // Extract and calculate metrics
  const medianIncome = toNumber(acsData.B19013_001E);
  const medianHome = toNumber(acsData.B25077_001E);
  const medianRent = toNumber(acsData.B25064_001E);

  // Vacancy rate = vacant / total
  const totalHousing = toNumber(acsData.B25002_001E);
  const vacantHousing = toNumber(acsData.B25002_003E);
  let vacancyRate: number | null = null;
  if (totalHousing && totalHousing > 0 && vacantHousing !== null) {
    vacancyRate = vacantHousing / totalHousing;
  }

  // Owner-occupied rate = owner-occupied / total occupied
  const totalOccupied = toNumber(acsData.B25003_001E);
  const ownerOccupied = toNumber(acsData.B25003_002E);
  let ownerOccupiedRate: number | null = null;
  if (totalOccupied && totalOccupied > 0 && ownerOccupied !== null) {
    ownerOccupiedRate = ownerOccupied / totalOccupied;
  }

  return {
    censusTract: tractData.tract,
    medianHouseholdIncome: medianIncome,
    medianHomeValue: medianHome,
    vacancyRate,
    ownerOccupiedRate,
    medianGrossRent: medianRent,
  };
}
