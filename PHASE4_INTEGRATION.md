# Phase 4: Census ACS Neighborhood Demographics Integration

## Overview

This phase adds US Census Bureau American Community Survey (ACS) 5-Year Estimates data to properties. The system geocodes each property's coordinates to a census tract and retrieves neighborhood demographic metrics (median income, home values, rental rates, occupancy, vacancy).

---

## Database Schema Changes

### Property Model Extensions

Add these fields to the `Property` model in `prisma/schema.prisma`:

```prisma
model Property {
  // ... existing fields ...
  
  // Census ACS demographics (Phase 4)
  censusTract           String?
  medianHouseholdIncome Float?
  medianHomeValue       Float?
  vacancyRate           Float?
  ownerOccupiedRate     Float?
  medianGrossRent       Float?

  // ... rest of model ...
}
```

### SQL Migration (if not using Prisma)

If migrating directly via SQL:

```sql
ALTER TABLE "Property"
ADD COLUMN "censusTract" TEXT,
ADD COLUMN "medianHouseholdIncome" DOUBLE PRECISION,
ADD COLUMN "medianHomeValue" DOUBLE PRECISION,
ADD COLUMN "vacancyRate" DOUBLE PRECISION,
ADD COLUMN "ownerOccupiedRate" DOUBLE PRECISION,
ADD COLUMN "medianGrossRent" DOUBLE PRECISION;
```

---

## New Files Created

### `src/lib/providers/census/acs.ts`

Complete provider module with:

- `CensusACSData` interface defining the return shape
- `lookupCensusData(lat, lon)` async function
- Two-step process:
  1. **Geocoding**: Uses Census Geocoder API to convert coordinates to census tract
  2. **Data Query**: Uses ACS 5-Year Estimates API to fetch demographic metrics
- In-memory tract caching for efficient batch enrichment
- Robust error handling with 10-second timeouts
- Proper handling of Census API's special values (negatives = data unavailable)

**Variables queried from ACS 5-Year Estimates (2022):**
- `B19013_001E` – Median household income
- `B25077_001E` – Median home value
- `B25002_001E` – Total housing units
- `B25002_002E` – Occupied housing units
- `B25002_003E` – Vacant housing units
- `B25003_001E` – Total occupied units (by tenure)
- `B25003_002E` – Owner-occupied units
- `B25064_001E` – Median gross rent

**Calculated metrics:**
- `vacancyRate` = Vacant / Total
- `ownerOccupiedRate` = Owner-Occupied / Total-Occupied

---

## Integration Points

### 1. Enrichment API (`src/app/api/enrich/route.ts`)

Add census enrichment to the batch enrichment endpoint.

**Import the provider:**
```typescript
import { lookupCensusData } from "@/lib/providers/census/acs";
```

**In the main enrichment loop** (around line 77, after county data lookups):

```typescript
// ── Census ACS Demographics Lookup ──
// Always attempt if we have coords and no census data yet
const enrichCensus = body.census === true; // Pass { census: true } to enrich census demographics

if (enrichCensus && prop.latitude && prop.longitude && !prop.censusTract) {
  try {
    const censusData = await lookupCensusData(prop.latitude, prop.longitude);
    if (censusData) {
      updateData.censusTract = censusData.censusTract;
      updateData.medianHouseholdIncome = censusData.medianHouseholdIncome;
      updateData.medianHomeValue = censusData.medianHomeValue;
      updateData.vacancyRate = censusData.vacancyRate;
      updateData.ownerOccupiedRate = censusData.ownerOccupiedRate;
      updateData.medianGrossRent = censusData.medianGrossRent;
      console.log(
        `[Enrich] 📍 ${prop.streetAddress} — Tract ${censusData.censusTract} (Income: $${censusData.medianHouseholdIncome?.toLocaleString() ?? "n/a"})`
      );
    }
  } catch (censusErr) {
    console.warn(
      `[Enrich] 📍 Census lookup failed for ${prop.streetAddress}:`,
      censusErr instanceof Error ? censusErr.message : censusErr
    );
  }
}
```

**Usage:**
```bash
POST /api/enrich
{ "county": "Greenville", "census": true }
```

---

### 2. Opportunity Detail Page (`src/app/(dashboard)/opportunities/[id]/page.tsx`)

Add a new "Neighborhood Demographics" section to display census data.

**In the JSX, add after other sections (around the mid-page content):**

```tsx
{/* ── Neighborhood Demographics (Census ACS) ── */}
{property?.censusTract && (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <MapPin className="w-5 h-5" />
        Neighborhood Demographics
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-gray-600">Census Tract</p>
          <p className="font-semibold">{property.censusTract}</p>
        </div>
        {property.medianHouseholdIncome && (
          <div>
            <p className="text-sm text-gray-600">Median Household Income</p>
            <p className="font-semibold">
              {fmt(property.medianHouseholdIncome)}
            </p>
          </div>
        )}
        {property.medianHomeValue && (
          <div>
            <p className="text-sm text-gray-600">Median Home Value</p>
            <p className="font-semibold">
              {fmt(property.medianHomeValue)}
            </p>
          </div>
        )}
        {property.medianGrossRent && (
          <div>
            <p className="text-sm text-gray-600">Median Gross Rent</p>
            <p className="font-semibold">
              {fmt(property.medianGrossRent)}/mo
            </p>
          </div>
        )}
        {property.vacancyRate !== null && property.vacancyRate !== undefined && (
          <div>
            <p className="text-sm text-gray-600">Vacancy Rate</p>
            <p className="font-semibold">
              {(property.vacancyRate * 100).toFixed(1)}%
            </p>
          </div>
        )}
        {property.ownerOccupiedRate !== null && property.ownerOccupiedRate !== undefined && (
          <div>
            <p className="text-sm text-gray-600">Owner-Occupied Rate</p>
            <p className="font-semibold">
              {(property.ownerOccupiedRate * 100).toFixed(1)}%
            </p>
          </div>
        )}
      </div>
    </CardContent>
  </Card>
)}
```

---

### 3. Scoring Engine (`src/lib/scoring.ts`)

The scoring engine can optionally incorporate neighborhood strength as a factor.

**Proposed `neighborhoodStrength` factor:**

```typescript
/**
 * neighborhoodStrength: 0-100 score based on census metrics
 * Factors:
 * - Median income relative to property value (higher income = better)
 * - Owner-occupancy rate (higher = more stable)
 * - Vacancy rate (lower = healthier market)
 */
function calculateNeighborhoodStrength(
  medianIncome: number | null,
  medianHomeValue: number | null,
  propertyValue: number,
  ownerOccupiedRate: number | null,
  vacancyRate: number | null,
): number {
  let score = 50; // baseline

  // Income relative to property value
  if (medianIncome && medianHomeValue) {
    const incomeRatio = medianIncome / medianHomeValue;
    // Higher income-to-value ratio suggests better market fundamentals
    if (incomeRatio > 0.06) score += 15;
    else if (incomeRatio > 0.04) score += 10;
    else if (incomeRatio < 0.02) score -= 10;
  }

  // Owner-occupancy (stability indicator)
  if (ownerOccupiedRate) {
    if (ownerOccupiedRate > 0.65) score += 15;
    else if (ownerOccupiedRate > 0.50) score += 10;
    else if (ownerOccupiedRate < 0.30) score -= 15;
  }

  // Vacancy (market health)
  if (vacancyRate) {
    if (vacancyRate < 0.05) score += 10;
    else if (vacancyRate < 0.10) score += 5;
    else if (vacancyRate > 0.20) score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}
```

Integrate into the scoring engine's factor calculation in `calculateScore()`.

---

## Environment Configuration

### Vercel Deployment

Add to Vercel project settings under **Environment Variables**:

```
CENSUS_API_KEY=your_census_api_key_here
```

**Notes:**
- The Census API is free and works without a key for low-volume use (small test batches)
- For production/high-volume use, register for a free API key at https://api.census.gov/data/key_signup.html
- The key should be kept in Vercel secrets, not in git

### Local Development

```bash
# .env.local (do not commit)
CENSUS_API_KEY=your_test_key_or_leave_blank
```

---

## Testing

### Manual Test

```bash
curl -X POST http://localhost:3000/api/enrich \
  -H "Content-Type: application/json" \
  -d '{"county": "Greenville", "census": true}'
```

### Check Results

Query the database to verify census fields:

```sql
SELECT
  id,
  streetAddress,
  county,
  censusTract,
  medianHouseholdIncome,
  medianHomeValue,
  vacancyRate,
  ownerOccupiedRate,
  medianGrossRent
FROM "Property"
WHERE censusTract IS NOT NULL
LIMIT 10;
```

### Sample Data Points

After enrichment, properties should have:
- **South Carolina state FIPS**: 45
- **Greenville county FIPS**: 045
- **Horry county FIPS**: 051
- **Georgetown county FIPS**: 043
- **Census tract format**: 6-digit string (e.g., "001302")

---

## API Notes

### Census Geocoder API

- **Endpoint**: https://geocoding.geo.census.gov/geocoder/geographies/coordinates
- **Benchmarks**: `Public_AR_Current` (most recent annual release)
- **Vintage**: `Current_Current` (current Census geography)
- **No authentication required**

### Census Data API (ACS)

- **Endpoint**: https://api.census.gov/data/2022/acs/acs5
- **Dataset**: 2022 ACS 5-Year Estimates (most recent complete dataset)
- **Key**: Optional for low-volume queries; highly recommended for production
- **Response format**: Array of arrays `[headers[], data[]]`
- **Special values**: Negative numbers indicate missing/suppressed data (treated as null)
- **Rate limits**: ~120 requests per minute without key; higher with key

---

## Caching Strategy

The `acs.ts` module implements an in-memory tract cache:
- **Maps**: `"lat,lon"` → `{ state, county, tract }`
- **Scope**: Single enrichment run (cleared between requests)
- **Benefit**: Eliminates redundant geocoding for nearby properties
- **Trade-off**: Memory usage grows with batch size (negligible for typical 1000-property batches)

For long-running processes, consider Redis caching (not implemented in Phase 4).

---

## Error Handling

All errors are gracefully handled:
- **Timeout**: 10 seconds on both API calls (fast-fail)
- **Missing data**: Returns `null` for specific metrics, not entire object
- **API errors**: Logged with `[CensusACS]` prefix; process continues
- **Invalid FIPS codes**: Handled by API response validation

---

## Future Enhancements

- **Redis caching** for census tract lookups across multiple enrichment runs
- **Batch geocoding** (Census Batch Geocoder API) for 1000s of properties at once
- **Decennial Census** (2020, 2030) as alternative data source
- **Additional ACS metrics**: education, age demographics, housing type distribution
- **Neighborhood strength scoring** (Phase 4.1) incorporating census metrics into flip scoring

---

## References

- [Census Geocoder API Documentation](https://www.census.gov/cgi-bin/geo/shapefiles2010/main)
- [Census Data API Guide](https://api.census.gov/data.html)
- [ACS Data Profile Documentation](https://www.census.gov/acs/www/data/data-tables-and-tools/)
- [SC FIPS Codes](https://www.census.gov/library/reference/code-lists/ansi/ansi-codes-for-states.html)
