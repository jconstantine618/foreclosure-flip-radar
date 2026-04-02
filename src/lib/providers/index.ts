// ---------------------------------------------------------------------------
// Provider barrel exports & initialization
// ---------------------------------------------------------------------------

export { providerRegistry } from "./registry";
export type {
  PropertyProvider,
  NoticeProvider,
  ValuationProvider,
  GeocodingProvider,
  ComparableSale,
} from "./interfaces";
export { BatchDataClient } from "./batchdata/client";
export { BatchDataPropertyProvider } from "./batchdata/provider";
export { AttomClient } from "./attom/client";
export { AttomPropertyProvider } from "./attom/provider";

import { providerRegistry } from "./registry";
import { BatchDataPropertyProvider } from "./batchdata/provider";
import { AttomPropertyProvider } from "./attom/provider";
import type { ProviderConfig } from "@/types";

// ---------------------------------------------------------------------------
// Initialization – call once at app startup (e.g. in instrumentation.ts or
// a top-level server layout).
// ---------------------------------------------------------------------------

let initialized = false;

/**
 * Create provider instances from environment variables and register them.
 * BatchData is set as the default property provider when configured.
 *
 * Safe to call multiple times; only runs once.
 */
export function initializeProviders(): void {
  if (initialized) return;
  initialized = true;

  // --- BatchData ---
  const batchdataApiKey = process.env.BATCHDATA_API_KEY;
  if (batchdataApiKey) {
    const config: ProviderConfig = {
      apiKey: batchdataApiKey,
      baseUrl: process.env.BATCHDATA_BASE_URL ?? "https://api.batchdata.com/api/v1",
      rateLimit: parseInt(process.env.BATCHDATA_RATE_LIMIT ?? "60", 10),
      enabled: true,
    };
    const batchdata = new BatchDataPropertyProvider(config);
    // BatchData is the primary / default provider
    providerRegistry.registerPropertyProvider(batchdata, true);
  }

  // --- ATTOM ---
  const attomApiKey = process.env.ATTOM_API_KEY;
  if (attomApiKey) {
    const config: ProviderConfig = {
      apiKey: attomApiKey,
      baseUrl: process.env.ATTOM_BASE_URL ?? "https://api.gateway.attomdata.com/propertyapi/v1.0.0",
      rateLimit: parseInt(process.env.ATTOM_RATE_LIMIT ?? "30", 10),
      enabled: true,
    };
    const attom = new AttomPropertyProvider(config);
    // ATTOM becomes default only if BatchData is not configured
    const isDefault = !batchdataApiKey;
    providerRegistry.registerPropertyProvider(attom, isDefault);
  }

  // TODO: Register notice providers (county scrapers, etc.)
  // TODO: Register valuation providers
  // TODO: Register geocoding providers
}
