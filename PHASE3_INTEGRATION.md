# Phase 3: Public Records URL Enrichment Integration

## Overview

Phase 3 adds deep-link URLs to South Carolina county public records services (court case index, Register of Deeds, and tax portals) to each property opportunity. The enrichment is a pure URL construction task — no external API calls, no scraping.

**Key Points:**
- Supported counties: Greenville, Horry, Georgetown
- URLs are constructed from existing data in the database (case numbers, owner names, parcel numbers, addresses)
- SC Courts has expressly prohibited scraping — we only construct URLs
- The enrichment integrates with the existing `/api/enrich` flow
- No new database tables required — URLs are stored in existing `CountyNotice` and `Property` fields

---

## Database Schema Changes

### CountyNotice Model Updates

The `CountyNotice` model has the following fields (added via SQL migration):

```prisma
model CountyNotice {
  // ... existing fields ...
  
  // Phase 3: Public Records URLs (all nullable)
  courtIndexUrl   String?  // Deep link to SC Courts Public Index
  rodSearchUrl    String?  // Deep link to county Register of Deeds
  taxPortalUrl    String?  // Deep link to county Tax Portal
  judgmentAmount  Float?   // Additional field for future use
  
  // ... rest of model ...
}
```

### Property Model Updates (if applicable)

For properties **without** CountyNotice records, the following fields are available for tax delinquency context:

```prisma
model Property {
  // ... existing fields ...
  
  // Phase 3: Tax enrichment context (nullable)
  taxDelinquentYears Int?  // Number of years delinquent
  totalTaxDue        Float? // Total tax due
  lastAssessedValue  Float? // Last assessed value for tax purposes
  assessmentYear     Int?   // Year of last assessment
  
  // ... rest of model ...
}
```

**Note:** These Property fields are not implemented in Phase 3 but are available for future enhancements.

---

## API Endpoint Changes

### POST `/api/enrich`

**New Behavior:**

After the existing valuation and flood zone enrichment (Lines 1-158), add public records URL construction for each property with a CountyNotice record.

**Location:** `src/app/api/enrich/route.ts`

**Code Changes:**

#### 1. Add Import at Top (After Line 13)

```typescript
import { buildRecordLinks } from "@/lib/providers/public-records";
```

#### 2. Update Enrichment Logic (After Line 158, before final result return)

Add the following code block to process all properties with county notices:

```typescript
// ── Phase 3: Build Public Records URLs ──
// Fetch all county notices for enriched properties and build deep-link URLs
const countyNotices = await prisma.countyNotice.findMany({
  where: {
    propertyId: { in: properties.map(p => p.id) },
  },
});

for (const notice of countyNotices) {
  try {
    // Build URLs from notice and property data
    const prop = properties.find(p => p.id === notice.propertyId);
    if (!prop) continue;

    const links = buildRecordLinks({
      county: notice.county,
      caseNumber: notice.caseNumber,
      ownerName: notice.defendant, // Typically the property owner in foreclosure
      parcelNumber: prop.parcelNumber,
      streetAddress: prop.streetAddress,
    });

    // Update CountyNotice with URLs only if they don't already exist
    // (avoid overwriting manually entered or previously enriched URLs)
    const updateData: Record<string, unknown> = {};
    if (!notice.courtIndexUrl && links.courtIndexUrl) {
      updateData.courtIndexUrl = links.courtIndexUrl;
    }
    if (!notice.rodSearchUrl && links.rodSearchUrl) {
      updateData.rodSearchUrl = links.rodSearchUrl;
    }
    if (!notice.taxPortalUrl && links.taxPortalUrl) {
      updateData.taxPortalUrl = links.taxPortalUrl;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.countyNotice.update({
        where: { id: notice.id },
        data: updateData,
      });
      console.log(
        `[Enrich] ✓ Public records URLs for case ${notice.caseNumber} (${notice.county})`
      );
    }
  } catch (err) {
    console.warn(
      `[Enrich] ✗ Failed to build URLs for notice ${notice.id}:`,
      err instanceof Error ? err.message : err
    );
  }
}
```

**Result:** CountyNotice records are updated with courtIndexUrl, rodSearchUrl, and taxPortalUrl.

---

## UI Component Changes

### Opportunity Detail Page Updates

**Location:** `src/app/(dashboard)/opportunities/[id]/page.tsx`

**Component:** "Foreclosure Details" Card (Court Information Section)

**Changes:**

#### 1. Add Import for Public Records Hook

Add near the top with other imports:

```typescript
// For fetching county notices with URLs
import { useEffect, useState } from "react";
```

#### 2. Add State for County Notices

Inside the component function, after the `useParams()` and `useState` declarations, add:

```typescript
const [countyNotices, setCountyNotices] = useState<Array<{
  id: string;
  county: string;
  caseNumber: string | null;
  saleDate: string | null;
  courtIndexUrl: string | null;
  rodSearchUrl: string | null;
  taxPortalUrl: string | null;
}>>([]);

const [noticesLoading, setNoticesLoading] = useState(false);
```

#### 3. Add useEffect to Fetch Notices

After the existing data fetching useEffect (typically around Line 120-180), add:

```typescript
// Fetch county notices for this opportunity
useEffect(() => {
  if (!opportunity?.propertyId) return;

  const fetchNotices = async () => {
    setNoticesLoading(true);
    try {
      const res = await fetch(
        `/api/opportunities/${opportunity.id}?include=notices`
      );
      const data = await res.json();
      if (data.notices) {
        setCountyNotices(data.notices);
      }
    } catch (err) {
      console.error("Failed to fetch county notices:", err);
    } finally {
      setNoticesLoading(false);
    }
  };

  fetchNotices();
}, [opportunity?.propertyId, opportunity?.id]);
```

#### 4. Add Public Records Link Buttons

In the JSX, find the "Foreclosure Details" card section (typically after the "Case Information" heading) and add:

```typescript
{/* Public Records Links Section */}
{countyNotices.length > 0 && (
  <div className="space-y-3 border-t pt-3">
    <h4 className="font-semibold text-sm text-gray-700">Public Records Links</h4>
    {countyNotices.map((notice) => (
      <div key={notice.id} className="space-y-2">
        {notice.caseNumber && (
          <div className="text-xs text-gray-600">Case: {notice.caseNumber}</div>
        )}
        <div className="flex flex-wrap gap-2">
          {notice.courtIndexUrl && (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="text-xs"
            >
              <a
                href={notice.courtIndexUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileText className="w-3 h-3 mr-1" />
                Court Index
              </a>
            </Button>
          )}
          {notice.rodSearchUrl && (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="text-xs"
            >
              <a
                href={notice.rodSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileText className="w-3 h-3 mr-1" />
                Deeds Search
              </a>
            </Button>
          )}
          {notice.taxPortalUrl && (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="text-xs"
            >
              <a
                href={notice.taxPortalUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileText className="w-3 h-3 mr-1" />
                Tax Portal
              </a>
            </Button>
          )}
        </div>
      </div>
    ))}
  </div>
)}
```

**Visual Result:**
- New "Public Records Links" section appears in the Foreclosure Details card
- Three buttons per notice (if URLs available): Court Index, Deeds Search, Tax Portal
- All buttons open in new tabs (target="_blank")
- Each button is clearly labeled with an icon

---

## API Response Changes

### GET `/api/opportunities/[id]`

**New Optional Parameter:** `?include=notices`

**New Response Field:**

```typescript
{
  opportunity: { /* existing fields */ },
  property: { /* existing fields */ },
  notices: [  // NEW: only returned if ?include=notices
    {
      id: "...",
      county: "Greenville",
      caseNumber: "2024CV123456",
      saleDate: "2024-06-15T00:00:00Z",
      courtIndexUrl: "https://publicindex.sccourts.org/greenville/publicindex/",
      rodSearchUrl: "https://www.greenvillecounty.org/rod/searchrecords.aspx",
      taxPortalUrl: "https://www.gcgis.org/apps/GreenvilleJS/?PIN=R12345678"
    }
  ]
}
```

**Implementation:** In `src/app/api/opportunities/[id]/route.ts`, update the handler:

```typescript
const includeNotices = searchParams.get("include")?.includes("notices");

if (includeNotices) {
  const notices = await prisma.countyNotice.findMany({
    where: { propertyId: opportunity.propertyId },
    select: {
      id: true,
      county: true,
      caseNumber: true,
      saleDate: true,
      courtIndexUrl: true,
      rodSearchUrl: true,
      taxPortalUrl: true,
    },
  });
  return NextResponse.json({
    opportunity,
    property,
    notices,
  });
}

return NextResponse.json({
  opportunity,
  property,
});
```

---

## URL Builder Reference

### Import

```typescript
import { buildRecordLinks } from "@/lib/providers/public-records";
```

### Function Signature

```typescript
function buildRecordLinks(params: {
  county: string;
  caseNumber?: string | null;
  ownerName?: string | null;
  parcelNumber?: string | null;
  streetAddress?: string | null;
}): {
  courtIndexUrl: string | null;
  rodSearchUrl: string | null;
  taxPortalUrl: string | null;
}
```

### Example Usage

```typescript
const links = buildRecordLinks({
  county: "Greenville",
  caseNumber: "2024CV123456",
  ownerName: "John Smith",
  parcelNumber: "R0123456789",
  streetAddress: "123 Main St, Greenville, SC 29601",
});

console.log(links);
// Output:
// {
//   courtIndexUrl: "https://publicindex.sccourts.org/greenville/publicindex/",
//   rodSearchUrl: "https://www.greenvillecounty.org/rod/searchrecords.aspx",
//   taxPortalUrl: "https://www.gcgis.org/apps/GreenvilleJS/?PIN=R0123456789"
// }
```

### Returned URLs by County

#### Greenville County

| Service | URL | Notes |
|---------|-----|-------|
| Court Index | `https://publicindex.sccourts.org/greenville/publicindex/` | Requires manual search on site |
| Register of Deeds | `https://www.greenvillecounty.org/rod/searchrecords.aspx` | Main ROD search page |
| Tax Portal | `https://www.gcgis.org/apps/GreenvilleJS/?PIN={parcelNumber}` | Direct GIS link with PIN parameter (if parcel available) |

#### Horry County

| Service | URL | Notes |
|---------|-----|-------|
| Court Index | `https://publicindex.sccourts.org/horry/publicindex/` | Requires manual search on site |
| Register of Deeds | `https://www.horrycountysc.gov/apps/LandRecords/` | Land Records portal (login required for addresses as of 3/16/2026) |
| Tax Portal | `https://www.horrycountysc.gov/apps/LandRecords/` | Same as ROD (Land Records includes tax info) |

#### Georgetown County

| Service | URL | Notes |
|---------|-----|-------|
| Court Index | `https://publicindex.sccourts.org/georgetown/publicindex/` | Requires manual search on site |
| Register of Deeds | `https://www.georgetowndeeds.com/` | Online deed record system |
| Tax Portal | `https://qpublic.schneidercorp.com/Application.aspx?App=GeorgetownCountySC&Layer=Parcels&PageType=Search` | qPublic-based parcel search |

---

## Implementation Checklist

- [ ] Verify database schema includes courtIndexUrl, rodSearchUrl, taxPortalUrl on CountyNotice
- [ ] Create `/src/lib/providers/public-records/url-builder.ts` with buildRecordLinks function
- [ ] Create `/src/lib/providers/public-records/index.ts` with exports
- [ ] Add `import { buildRecordLinks }` to `src/app/api/enrich/route.ts`
- [ ] Add county notice URL enrichment logic to POST `/api/enrich` (after line 158)
- [ ] Update `src/app/api/opportunities/[id]/route.ts` to support `?include=notices` query param
- [ ] Add useState for countyNotices and noticesLoading to opportunity detail page
- [ ] Add useEffect to fetch notices when opportunity loads
- [ ] Add "Public Records Links" section with three buttons (Court Index, Deeds, Tax Portal)
- [ ] Test enrichment: POST to `/api/enrich` with target county
- [ ] Verify URLs appear on opportunity detail page
- [ ] Test each URL opens correct county service in new tab

---

## Testing

### Manual Enrichment Test

```bash
curl -X POST http://localhost:3000/api/enrich \
  -H "Content-Type: application/json" \
  -d '{"county": "Greenville"}'
```

Expected output:
```json
{
  "data": {
    "results": [
      {
        "county": "Greenville",
        "total": 10,
        "enriched": 8,
        "failed": 0,
        "skipped": 2
      }
    ],
    "totalProcessed": 10
  }
}
```

### Browser Test

1. Navigate to an opportunity detail page
2. Scroll to "Foreclosure Details" / "Court Information" section
3. Verify "Public Records Links" section appears (if county notices exist)
4. Click each button and verify it opens the correct URL in a new tab
5. Verify the URL contains expected parameters (e.g., PIN parameter for Greenville tax portal)

---

## No-Scraping Compliance

All URLs are constructed from existing database data only. No HTTP requests are made to county services during enrichment. The buildRecordLinks function is deterministic and based purely on string formatting:

- Court case numbers are passed as-is to county URL
- Parcel numbers are URL-encoded when used as query parameters
- Owner names and addresses are provided as context but not included in query strings (counties require manual search)
- All source data comes from our database (case numbers from MIE notices, addresses from Property records)

**References:**
- SC Courts Policy: https://www.sccourts.org/ (prohibits scraping)
- We comply by constructing only deep-link URLs, never fetching or parsing pages

---

## Future Enhancements

1. **Direct Case Search Parameters:** When SC Courts documents URL parameters for direct case lookup, update buildCourtIndexUrl to include case number as query parameter
2. **Parcel Search Parameters:** When Register of Deeds services document URL parameters for parcel search (e.g., owner name, address), include them in rodSearchUrl
3. **Tax Delinquency Context:** Populate Property.taxDelinquentYears, totalTaxDue, etc. from court notices for additional scoring signals
4. **Click Tracking:** Log when users click public records links for analytics and optimization
5. **Link Validation:** Periodically verify URLs still resolve without errors (scheduled task)
6. **County Expansion:** Add additional SC counties (Charleston, Richland, Lexington, etc.) following the same pattern

---

## References

- Greenville County Register of Deeds: https://www.greenvillecounty.org/rod/
- Greenville County Real Property Search: https://www.greenvillecounty.org/appsas400/RealProperty/
- Greenville County GIS: https://www.gcgis.org/apps/GreenvilleJS/
- Horry County Register of Deeds: https://www.horrycountysc.gov/departments/register-of-deeds/
- Horry County Land Records: https://www.horrycountysc.gov/apps/LandRecords/
- Georgetown County Register of Deeds: https://www.gtcounty.org/178/Register-of-Deeds
- Georgetown County Online Deeds: https://www.georgetowndeeds.com/
- SC Courts Public Index: https://publicindex.sccourts.org/
- SC Courts Case Records: https://www.sccourts.org/case-records-search/
