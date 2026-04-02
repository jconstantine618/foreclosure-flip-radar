// ---------------------------------------------------------------------------
// County Adapter barrel exports and factory functions
// ---------------------------------------------------------------------------

export { BaseCountyAdapter } from "./base-adapter";
export {
  normalizeAddress,
  parseAddress,
  normalizeCounty,
  normalizeName,
} from "./normalizer";

export type {
  CountyAdapter,
  CountyAdapterConfig,
  RawNoticeRecord,
  NormalizedNotice,
} from "./types";

export { GreenvilleMIEAdapter } from "./greenville-mie";
export { HorryMIEAdapter } from "./horry-mie";
export { HorryUpsetBidAdapter } from "./horry-upset";
export { SCPublicNoticesAdapter } from "./sc-public-notices";

import type { CountyAdapter } from "./types";
import { GreenvilleMIEAdapter } from "./greenville-mie";
import { HorryMIEAdapter } from "./horry-mie";
import { HorryUpsetBidAdapter } from "./horry-upset";
import { SCPublicNoticesAdapter } from "./sc-public-notices";

/**
 * Create all available county adapters with default configuration.
 */
export function createCountyAdapters(): CountyAdapter[] {
  return [
    new GreenvilleMIEAdapter(),
    new HorryMIEAdapter(),
    new HorryUpsetBidAdapter(),
    new SCPublicNoticesAdapter(),
  ];
}

/**
 * Return all adapters that handle the given county name.
 * Matches are case-insensitive and ignore the word "County".
 */
export function getAdapterForCounty(county: string): CountyAdapter[] {
  const normalized = county
    .toUpperCase()
    .replace(/\bCOUNTY\b/gi, "")
    .trim();

  const allAdapters = createCountyAdapters();

  return allAdapters.filter((adapter) => {
    // The SC Public Notices adapter handles all counties
    if (adapter.county === "ALL") return true;
    return adapter.county === normalized;
  });
}
