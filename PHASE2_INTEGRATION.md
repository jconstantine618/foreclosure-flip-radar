# Phase 2: Enhanced GIS Data Enrichment Integration Spec

## Overview

This document details the code changes needed to integrate the new `enhanced-gis.ts` provider module into the FFR app. Phase 2 adds six new property fields (zoning, school districts, water/sewer service, fire districts) sourced from county ArcGIS endpoints.

**Status:** Implementation ready. Layer numbers for Horry and Georgetown counties require field verification against live MapServer endpoints.

---

## 1. Database Schema Changes

### 1.1 Prisma Schema Update

Add the following fields to the `Property` model in `prisma/schema.prisma`:

```prisma
model Property {
  // ... existing fields ...
  
  // Phase 2 Enhanced GIS Fields
  zoningCode          String?
  zoningDescription   String?
  schoolDistrict      String?
  waterService        String?
  sewerService        String?
  fireDistrict        String?

  // ... rest of model ...
}
```

### 1.2 Database Migration

Create a new Prisma migration to add these columns to the `Property` table:

```bash
npx prisma migrate dev --name add_enhanced_gis_fields
```

This will:
1. Generate a migration file in `prisma/migrations/`
2. Create the six new nullable string columns in PostgreSQL
3. Update `prisma/client.ts` generated types

**Alternative (direct SQL):** If using raw SQL migrations:
```sql
ALTER TABLE "Property"
  ADD COLUMN "zoningCode" TEXT,
  ADD COLUMN "zoningDescription" TEXT,
  ADD COLUMN "schoolDistrict" TEXT,
  ADD COLUMN "waterService" TEXT,
  ADD COLUMN "sewerService" TEXT,
  ADD COLUMN "fireDistrict" TEXT;
```

---

## 2. Enrich Route Integration

### 2.1 Update `/src/app/api/enrich/route.ts`

**Step 1:** Import the new enhanced GIS functions at the top of the file:

```typescript
import { 
  lookupEnhancedGreenville, 
  lookupEnhancedHorry, 
  lookupEnhancedGeorgetown,
  type EnhancedGISData 
} from "@/lib/providers/county/enhanced-gis";
```

**Step 2:** Modify the request body interface to support a new flag:

```typescript
interface EnrichRequestBody {
  county?: string;
  flood?: boolean;
  gis?: boolean; // NEW: Pass { gis: true } to enrich enhanced GIS data
}
```

**Step 3:** Update the `POST` handler logic (after line 30):

```typescript
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({})))) as EnrichRequestBody;
    const targetCounty: string | undefined = body.county;

    const enrichFlood = body.flood === true;
    const enrichGIS = body.gis === true; // NEW

    // Find properties based on enrichment type
    const where: Record<string, unknown> = {
      latitude: { not: null },
      longitude: { not: null },
    };
    
    if (enrichFlood) {
      where.floodZoneCode = null;
    } else if (enrichGIS) {
      // For GIS enrichment: get properties missing zoning or school district
      where.OR = [
        { zoningCode: null },
        { schoolDistrict: null },
      ];
    } else {
      // Default: get properties missing valuations
      where.estimatedValue = null;
    }
    
    if (targetCounty) {
      where.county = { equals: targetCounty, mode: "insensitive" };
    }
    
    // ... rest of existing code ...
```

**Step 4:** Add enhanced GIS lookup after county parcel data (after line 114, before the flood zone section):

```typescript
        // ── Enhanced County GIS Lookup (Zoning, School Districts, Fire, etc.) ──
        if (enrichGIS) {
          let enhancedData: EnhancedGISData | null = null;
          
          if (county.toLowerCase() === "greenville") {
            enhancedData = await lookupEnhancedGreenville(prop.latitude, prop.longitude);
          } else if (county.toLowerCase() === "horry") {
            enhancedData = await lookupEnhancedHorry(prop.latitude, prop.longitude);
          } else if (county.toLowerCase() === "georgetown") {
            enhancedData = await lookupEnhancedGeorgetown(prop.latitude, prop.longitude);
          }
          
          if (enhancedData) {
            if (enhancedData.zoningCode) updateData.zoningCode = enhancedData.zoningCode;
            if (enhancedData.zoningDescription) updateData.zoningDescription = enhancedData.zoningDescription;
            if (enhancedData.schoolDistrict) updateData.schoolDistrict = enhancedData.schoolDistrict;
            if (enhancedData.waterService) updateData.waterService = enhancedData.waterService;
            if (enhancedData.sewerService) updateData.sewerService = enhancedData.sewerService;
            if (enhancedData.fireDistrict) updateData.fireDistrict = enhancedData.fireDistrict;
            
            console.log(`[Enrich] 🗺️ ${prop.streetAddress} — Zone: ${enhancedData.zoningCode || "N/A"}, School: ${enhancedData.schoolDistrict || "N/A"}`);
          }
        }
```

---

## 3. UI Display Integration

### 3.1 Update `/src/app/(dashboard)/opportunities/[id]/page.tsx`

Add a new section to display enhanced GIS data on the property detail page. Find the existing section displaying property details (typically a card or panel) and add:

```tsx
{/* Enhanced GIS Information */}
<div className="mt-6 border-t pt-4">
  <h3 className="text-sm font-semibold text-gray-700 mb-3">Zoning & Services</h3>
  <div className="grid grid-cols-2 gap-4 text-sm">
    <div>
      <p className="text-gray-600">Zoning Code</p>
      <p className="font-medium">{property.zoningCode || "—"}</p>
    </div>
    <div>
      <p className="text-gray-600">Zoning Description</p>
      <p className="font-medium text-xs">{property.zoningDescription || "—"}</p>
    </div>
    <div>
      <p className="text-gray-600">School District</p>
      <p className="font-medium">{property.schoolDistrict || "—"}</p>
    </div>
    <div>
      <p className="text-gray-600">Fire District</p>
      <p className="font-medium">{property.fireDistrict || "—"}</p>
    </div>
    {property.waterService && (
      <div>
        <p className="text-gray-600">Water Service</p>
        <p className="font-medium">{property.waterService}</p>
      </div>
    )}
    {property.sewerService && (
      <div>
        <p className="text-gray-600">Sewer Service</p>
        <p className="font-medium">{property.sewerService}</p>
      </div>
    )}
  </div>
</div>
```

---

## 4. Scoring Engine Updates (Optional)

### 4.1 If Zoning Affects Flip Score

If zoning classification should influence the flip score, update `src/lib/scoring.ts`:

```typescript
// Add to ScoringInput interface
export interface ScoringInput {
  // ... existing fields ...
  zoningCode?: string | null;
  zoningDescription?: string | null;
}

// In calculateScore() method, add zoning penalty/bonus logic:
if (input.zoningCode) {
  const restrictiveZones = ['INDUSTRIAL', 'AGRICULTURAL', 'CONSERVATION'];
  const commercialZones = ['COMMERCIAL', 'MIXED_USE'];
  
  if (restrictiveZones.some(z => input.zoningCode?.includes(z))) {
    // Reduce score for restrictive zoning
    score *= 0.85;
  } else if (commercialZones.some(z => input.zoningCode?.includes(z))) {
    // Boost score for commercial (higher flip potential)
    score *= 1.05;
  }
}
```

---

## 5. ArcGIS Layer Discovery Guide

### 5.1 How to Discover Layer Numbers

To verify and update layer IDs in `enhanced-gis.ts`, use the county MapServer endpoints:

**Greenville:**
```
https://www.gcgis.org/arcgis/rest/services/GreenvilleJS/Map_Layers_JS/MapServer?f=json
```
Look for layers named "Zoning", "School Districts", "Fire Districts", etc.
Update the layer IDs in `queryGreenvilleLayer()` calls.

**Horry:**
```
https://www.horrycounty.org/parcelapp/rest/services/HorryCountyGISApp/MapServer?f=json
```
Search the layer list for zoning and fire district layers.
Update the `-1` placeholders in `queryHorryLayer()` with correct IDs.

**Georgetown:**
```
https://gis1.georgetowncountysc.org/arcgis/rest/services?f=json
```
Check if additional FeatureServers are available (e.g., GCGIS_Planning, GCGIS_Services).
Georgetown's data may be more limited; document findings in code comments.

### 5.2 Testing Layer Queries

Once layer IDs are known, test queries manually:

```bash
curl "https://www.gcgis.org/arcgis/rest/services/GreenvilleJS/Map_Layers_JS/MapServer/0/query?geometry=%7B%22x%22%3A-82.4%2C%22y%22%3A34.8%7D&geometryType=esriGeometryPoint&inSR=4326&outFields=*&f=json"
```

Replace:
- `0` with the layer ID
- `-82.4, 34.8` with test coordinates (lon, lat)
- Change `outFields=*` to specific field names once discovered

---

## 6. Deployment Checklist

- [ ] Create and run Prisma migration to add six new fields
- [ ] Update `/src/app/api/enrich/route.ts` with enhanced GIS calls
- [ ] Update opportunity detail page to display zoning and service info
- [ ] (Optional) Update scoring engine if zoning should affect flip score
- [ ] Discover and update layer IDs for Horry and Georgetown
- [ ] Test enrichment endpoint: `POST /api/enrich` with `{ gis: true }`
- [ ] Verify data appears in property detail page
- [ ] Deploy to staging, then production

---

## 7. Usage Examples

### 7.1 Enrich All Greenville Properties with GIS Data

```bash
curl -X POST https://foreclosure-flip-radar.vercel.app/api/enrich \
  -H "Content-Type: application/json" \
  -d '{"county": "greenville", "gis": true}'
```

### 7.2 Enrich All Horry Properties

```bash
curl -X POST https://foreclosure-flip-radar.vercel.app/api/enrich \
  -H "Content-Type: application/json" \
  -d '{"county": "horry", "gis": true}'
```

### 7.3 Enrich and Check Logs

After running the enrich endpoint, check server logs for:
- `[EnhancedGIS-*]` prefixed messages indicating successes and failures
- TODO comments in `enhanced-gis.ts` that still need layer discovery

---

## 8. Known Limitations

1. **Layer availability varies by county:**
   - Greenville: Presumed to have zoning, school districts, fire districts
   - Horry: Layer IDs must be confirmed; may lack water/sewer layers
   - Georgetown: Data may be very limited; multiple layers may return null

2. **Water/Sewer data:** Not yet assigned to specific layers. May require:
   - Separate service queries (e.g., utilities MapServer)
   - Manual county data sources
   - Or remain null for now

3. **Field name inconsistency:** County GIS systems use different field names. Fallback fields are included in code, but exact matches should be verified.

---

## 9. Future Enhancements

- Bulk import water/sewer service areas from county sources
- Create fire district lookup service (if Horry/Georgetown lack layers)
- Add zoning code translations (e.g., "R1" → "Single-Family Residential")
- Cache layer metadata to speed up queries
- Implement property-level zoning compliance checker (e.g., "Can this be flipped as a duplex?")
