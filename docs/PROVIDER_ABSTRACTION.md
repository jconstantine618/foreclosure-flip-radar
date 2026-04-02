# Provider Abstraction Layer

This document describes the provider abstraction used in Foreclosure Flip Radar. The abstraction lets the platform swap data sources without changing business logic in the ingestion service, scoring engine, or UI.

## Overview

All external data access goes through typed provider interfaces defined in `src/lib/providers/interfaces.ts`. Concrete implementations wrap vendor-specific APIs and normalize their output into a canonical `NormalizedProperty` or `NormalizedNotice` shape.

The system defines four provider types:

| Interface | Purpose | Current Implementations |
|-----------|---------|------------------------|
| `PropertyProvider` | Search, detail, and enrichment of property records | BatchData (primary), ATTOM (fallback) |
| `NoticeProvider` | Fetch foreclosure / distress notices by county | None yet (county adapters fill this role today) |
| `ValuationProvider` | Estimated market value and comparable sales | None yet (planned) |
| `GeocodingProvider` | Address-to-coordinates resolution | None yet (planned) |

## Provider Interface Contracts

### PropertyProvider

```typescript
interface PropertyProvider {
  readonly name: string;

  searchProperties(params: PropertySearchParams): Promise<PropertySearchResult>;
  getPropertyDetails(id: string): Promise<NormalizedProperty | null>;
  enrichProperty(property: NormalizedProperty): Promise<NormalizedProperty>;
}
```

- **`searchProperties`** -- Accepts normalized filter parameters (county, state, zip codes, distress statuses, property types, equity range, price range, pagination). Returns a `PropertySearchResult` containing an array of `NormalizedProperty` objects plus pagination metadata and the provider name.
- **`getPropertyDetails`** -- Fetches a single property by its provider-specific ID. Returns `null` when the property cannot be found.
- **`enrichProperty`** -- Takes an existing `NormalizedProperty` and fills in missing fields (valuation, owner info, mortgage data) from this provider. The merge logic preserves existing non-null values and only overwrites nulls/undefined fields.

### NoticeProvider

```typescript
interface NoticeProvider {
  readonly name: string;

  fetchNotices(
    county: string,
    options?: { since?: Date; noticeType?: string },
  ): Promise<NormalizedNotice[]>;
}
```

- **`fetchNotices`** -- Returns foreclosure/distress notices for a given county, optionally filtered by date range or notice type.

### ValuationProvider

```typescript
interface ValuationProvider {
  readonly name: string;

  getEstimatedValue(
    address: string,
    zipCode: string,
  ): Promise<{ value: number; confidence: number } | null>;

  getComparables(
    address: string,
    zipCode: string,
    radius?: number,
  ): Promise<ComparableSale[]>;
}
```

- **`getEstimatedValue`** -- Returns a market value estimate with a confidence score (0 to 1). Returns `null` when estimation is not possible.
- **`getComparables`** -- Returns comparable sales within a given radius (default varies by implementation).

### GeocodingProvider

```typescript
interface GeocodingProvider {
  readonly name: string;

  geocode(address: string): Promise<{ lat: number; lng: number } | null>;
}
```

- **`geocode`** -- Resolves a free-text address string to latitude/longitude coordinates. Returns `null` when the address cannot be resolved.

## Provider Registry

The registry is a singleton defined in `src/lib/providers/registry.ts`. It stores registered providers by type and tracks which provider is the default for each type.

### Key behaviors

1. **Singleton pattern** -- `ProviderRegistry.getInstance()` returns the single global instance. Exported as `providerRegistry`.
2. **First-registered becomes default** -- When only one provider is registered for a type, it automatically becomes the default. Subsequent registrations only become default when explicitly flagged with `isDefault = true`.
3. **Lookup by name or default** -- `getPropertyProvider('attom')` returns a specific provider. `getPropertyProvider()` (no argument) returns the current default.
4. **List all** -- `getAllPropertyProviders()` returns every registered provider for iteration (e.g., fallback chains).
5. **Reset** -- `clear()` removes all registrations. Used in test suites.

### Registration example

```typescript
import { providerRegistry } from '@/lib/providers';

const batchdata = new BatchDataPropertyProvider(config);
providerRegistry.registerPropertyProvider(batchdata, true); // primary

const attom = new AttomPropertyProvider(config);
providerRegistry.registerPropertyProvider(attom, false);     // fallback
```

## Implementing a New PropertyProvider

1. Create a directory under `src/lib/providers/<name>/`.
2. Create `client.ts` with the raw API client (HTTP calls, response parsing, Zod schemas for response validation).
3. Create `provider.ts` with a class that implements `PropertyProvider`.
4. Implement the three required methods: `searchProperties`, `getPropertyDetails`, `enrichProperty`.
5. Add a private `mapToNormalizedProperty` method that converts the vendor-specific response shape to `NormalizedProperty`.
6. Register in `src/lib/providers/index.ts` inside `initializeProviders()`.

### Mapping checklist

Your `mapToNormalizedProperty` must populate every field of `NormalizedProperty`. Use `null` for fields the vendor does not provide. Key fields:

| Category | Fields |
|----------|--------|
| Location | `address`, `city`, `state`, `zipCode`, `county`, `parcelNumber`, `latitude`, `longitude` |
| Property | `propertyType`, `bedrooms`, `bathrooms`, `sqft`, `lotSizeSqft`, `yearBuilt`, `stories` |
| Ownership | `ownerName`, `ownerAddress`, `ownerOccupied`, `absenteeOwner` |
| Valuation | `estimatedValue`, `assessedValue`, `lastSalePrice`, `lastSaleDate`, `taxAmount` |
| Mortgage | `mortgageBalance`, `equityEstimate`, `equityPercent`, `lienAmount` |
| Distress | `distressStage`, `listingPrice`, `auctionDate`, `defaultAmount`, `recordingDate` |
| Meta | `externalId`, `provider`, `rawData` |

Always store the full raw API response in `rawData` for auditing and debugging.

## Implementing a New NoticeProvider

1. Create a class implementing `NoticeProvider` in `src/lib/providers/<name>/`.
2. Implement `fetchNotices(county, options?)` returning `NormalizedNotice[]`.
3. Register via `providerRegistry.registerNoticeProvider(provider)`.

A `NormalizedNotice` contains: `county`, `noticeType`, `caseNumber`, `address`, `parcelNumber`, `borrowerName`, `lenderName`, `auctionDate`, `defaultAmount`, `documentUrl`, `rawData`.

## BatchData vs ATTOM Field Mapping Differences

The two providers return structurally different API responses. The normalization layer handles this transparently, but developers should be aware of coverage gaps.

### Address fields

| Canonical Field | BatchData Path | ATTOM Path |
|----------------|---------------|------------|
| `address` | `address.street` | `address.line1` or `address.oneLine` |
| `city` | `address.city` | `address.locality` |
| `state` | `address.state` | `address.countrySubd` |
| `zipCode` | `address.zip` | `address.postal1` |
| `county` | `address.county` | `location.county` |
| `parcelNumber` | `parcel.parcelNumber` or `parcel.apn` | `identifier.apn` |
| `latitude` | `location.latitude` (number) | `location.latitude` (string or number) |
| `longitude` | `location.longitude` (number) | `location.longitude` (string or number) |

### Property details

| Canonical Field | BatchData Path | ATTOM Path |
|----------------|---------------|------------|
| `propertyType` | `property.type` (lowercase string) | `summary.proptype` (mixed-case descriptive string) |
| `bedrooms` | `property.bedrooms` | `building.rooms.beds` |
| `bathrooms` | `property.bathrooms` | `building.rooms.bathstotal` |
| `sqft` | `property.sqft` | `building.size.livingsize` or `building.size.universalsize` |
| `yearBuilt` | `property.yearBuilt` | `summary.yearbuilt` |

### Valuation and mortgage

| Canonical Field | BatchData Path | ATTOM Path |
|----------------|---------------|------------|
| `estimatedValue` | `valuation.estimatedValue` | `avm.amount.value` or `assessment.market.mktttlvalue` |
| `assessedValue` | `valuation.assessedValue` | `assessment.assessed.assdttlvalue` |
| `lastSalePrice` | `valuation.lastSalePrice` | `sale.amount.saleamt` |
| `mortgageBalance` | `mortgage.balance` | Not provided directly |
| `equityEstimate` | `mortgage.equityEstimate` | Not provided directly |
| `equityPercent` | `mortgage.equityPercent` | Not provided directly |

### Distress data

| Canonical Field | BatchData | ATTOM |
|----------------|-----------|-------|
| `distressStage` | `distress.stage` (mapped via lookup table) | Not provided in basic search |
| `auctionDate` | `distress.auctionDate` | Not provided in basic search |
| `defaultAmount` | `distress.defaultAmount` | Not provided in basic search |

**Key takeaway:** BatchData provides significantly richer distress and mortgage/equity data. ATTOM excels at valuation (AVM endpoint) and property details. This is why BatchData is the primary provider and ATTOM is used for enrichment.

### Ownership and occupancy

| Canonical Field | BatchData | ATTOM |
|----------------|-----------|-------|
| `ownerOccupied` | `owner.ownerOccupied` (boolean) | Derived from `summary.absenteeInd` ("O" = occupied, "A" = absentee) |
| `absenteeOwner` | `owner.absenteeOwner` (boolean) | Derived from `summary.absenteeInd` or `owner.absenteeOwnerStatus` |

## Fallback Behavior

When BatchData rate limits are hit or returns an error, the system does not automatically fall back to ATTOM at the request level. Instead, fallback is handled at two levels:

### Initialization-time fallback

In `src/lib/providers/index.ts`, if `BATCHDATA_API_KEY` is not configured, ATTOM is registered as the default property provider. This provides a deployment-time fallback for environments without BatchData access.

### Enrichment-level fallback

The ATTOM provider is used specifically for enrichment of properties that lack valuation data. The `attom-enrichment` job in `src/lib/jobs/processors/property-sync.ts` queries properties with `estimatedValue: null` created within the last 7 days and enriches them via the ATTOM AVM endpoint. This fills gaps left by BatchData's response.

### Manual fallback

Application code can iterate over all registered providers:

```typescript
const providers = providerRegistry.getAllPropertyProviders();
for (const provider of providers) {
  try {
    const result = await provider.getPropertyDetails(id);
    if (result) return result;
  } catch {
    continue; // try next provider
  }
}
```

### Rate limit configuration

Each provider accepts a `rateLimit` config value (requests per minute) via environment variables:

- `BATCHDATA_RATE_LIMIT` -- Default: 60 requests/minute
- `ATTOM_RATE_LIMIT` -- Default: 30 requests/minute

The `ProviderConfig` object passes this to the underlying client for throttling.

## Provider Config in AdminSettings

Provider configuration is managed through the admin panel at `/admin`. The admin settings allow:

1. **Enable/disable providers** -- Toggle individual providers on or off without redeployment.
2. **View API key status** -- See whether API keys are configured (keys themselves are not displayed).
3. **Adjust rate limits** -- Modify the `rateLimit` value for each provider.
4. **View sync history** -- The `ProviderSyncJob` table tracks every sync run with status (`RUNNING`, `COMPLETED`, `COMPLETED_WITH_ERRORS`, `FAILED`), record counts, and error messages.
5. **Trigger manual sync** -- The `/api/sync/providers` endpoint accepts a POST to trigger an immediate sync for any registered provider.

### Environment variables for providers

```bash
# BatchData (primary)
BATCHDATA_API_KEY=your-key-here
BATCHDATA_BASE_URL=https://api.batchdata.com/api/v1   # optional override
BATCHDATA_RATE_LIMIT=60                                 # requests per minute

# ATTOM (fallback / enrichment)
ATTOM_API_KEY=your-key-here
ATTOM_BASE_URL=https://api.gateway.attomdata.com/propertyapi/v1.0.0  # optional override
ATTOM_RATE_LIMIT=30
```

## File Reference

| File | Purpose |
|------|---------|
| `src/lib/providers/interfaces.ts` | Provider interface definitions |
| `src/lib/providers/registry.ts` | Singleton provider registry |
| `src/lib/providers/index.ts` | Barrel exports and `initializeProviders()` |
| `src/lib/providers/batchdata/client.ts` | BatchData HTTP client with Zod schemas |
| `src/lib/providers/batchdata/provider.ts` | BatchData `PropertyProvider` implementation |
| `src/lib/providers/attom/client.ts` | ATTOM HTTP client |
| `src/lib/providers/attom/provider.ts` | ATTOM `PropertyProvider` implementation |
