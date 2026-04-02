// ---------------------------------------------------------------------------
// Address & name normalization utilities for county adapters
// ---------------------------------------------------------------------------

const STREET_ABBREVIATIONS: Record<string, string> = {
  STREET: "ST",
  AVENUE: "AVE",
  BOULEVARD: "BLVD",
  DRIVE: "DR",
  LANE: "LN",
  ROAD: "RD",
  COURT: "CT",
  CIRCLE: "CIR",
  PLACE: "PL",
  TERRACE: "TER",
  TRAIL: "TRL",
  PARKWAY: "PKWY",
  HIGHWAY: "HWY",
  WAY: "WAY",
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",
  NORTHEAST: "NE",
  NORTHWEST: "NW",
  SOUTHEAST: "SE",
  SOUTHWEST: "SW",
  APARTMENT: "APT",
  SUITE: "STE",
  UNIT: "UNIT",
  BUILDING: "BLDG",
};

/**
 * Standardize an address string: uppercase, collapse whitespace,
 * abbreviate common words.
 */
export function normalizeAddress(raw: string): string {
  if (!raw) return "";

  let address = raw
    .toUpperCase()
    .replace(/[,]+/g, ",")
    .replace(/\s+/g, " ")
    .trim();

  // Replace long-form street types with abbreviations
  for (const [long, short] of Object.entries(STREET_ABBREVIATIONS)) {
    // Word-boundary replacement to avoid partial matches
    const re = new RegExp(`\\b${long}\\b`, "g");
    address = address.replace(re, short);
  }

  // Remove trailing periods from abbreviations (e.g. "ST." -> "ST")
  address = address.replace(/(\b[A-Z]{1,4})\./g, "$1");

  // Collapse any double spaces created by replacements
  address = address.replace(/\s{2,}/g, " ").trim();

  return address;
}

/**
 * Attempt to parse a raw address string into components.
 * Returns null if parsing fails.
 */
export function parseAddress(
  raw: string,
): { street: string; city: string; state: string; zip: string } | null {
  if (!raw) return null;

  const normalized = raw.replace(/\s+/g, " ").trim();

  // Pattern: "123 Main St, City, ST 29601"  or  "123 Main St, City, ST, 29601"
  const fullPattern =
    /^(.+?),\s*([A-Za-z\s]+?),\s*([A-Z]{2})\s*,?\s*(\d{5}(?:-\d{4})?)$/;
  const match = normalized.match(fullPattern);

  if (match) {
    return {
      street: normalizeAddress(match[1]),
      city: match[2].trim().toUpperCase(),
      state: match[3].toUpperCase(),
      zip: match[4],
    };
  }

  // Pattern without zip: "123 Main St, City, ST"
  const noZipPattern = /^(.+?),\s*([A-Za-z\s]+?),\s*([A-Z]{2})$/;
  const match2 = normalized.match(noZipPattern);

  if (match2) {
    return {
      street: normalizeAddress(match2[1]),
      city: match2[2].trim().toUpperCase(),
      state: match2[3].toUpperCase(),
      zip: "",
    };
  }

  // Pattern: just street portion
  const streetOnly = /^(\d+\s+.+)$/;
  const match3 = normalized.match(streetOnly);

  if (match3) {
    return {
      street: normalizeAddress(match3[1]),
      city: "",
      state: "",
      zip: "",
    };
  }

  return null;
}

/**
 * Normalize a county name: uppercase, remove "county" suffix, trim.
 */
export function normalizeCounty(raw: string): string {
  if (!raw) return "";
  return raw
    .toUpperCase()
    .replace(/\bCOUNTY\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize a person or entity name:
 * - Uppercase
 * - Collapse whitespace
 * - Remove common suffixes like "et al", "et ux"
 * - Trim punctuation
 */
export function normalizeName(raw: string): string {
  if (!raw) return "";

  let name = raw
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

  // Remove common legal suffixes
  name = name
    .replace(/\bET\s+AL\.?\b/g, "")
    .replace(/\bET\s+UX\.?\b/g, "")
    .replace(/\bAKA\b.*$/g, "")
    .replace(/\bA\/K\/A\b.*$/g, "")
    .replace(/\bF\/K\/A\b.*$/g, "");

  // Remove trailing commas and extra whitespace
  name = name.replace(/[,;]+\s*$/, "").replace(/\s{2,}/g, " ").trim();

  return name;
}
