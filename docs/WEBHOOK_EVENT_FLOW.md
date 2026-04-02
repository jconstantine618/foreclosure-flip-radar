# Webhook and Event Flow

This document describes the end-to-end data flow through Foreclosure Flip Radar, from ingestion through scoring and alert dispatch. It also covers the outgoing webhook payload format and configuration.

## Property Ingestion Flow

Properties enter the system via the BatchData provider sync job. The full flow is:

### Step 1: Job triggers

The `batchdata-sync` job fires on its cron schedule (`0 */6 * * *`, every 6 hours) or via a manual POST to `/api/sync/providers`. The job receives a list of target counties (default: Greenville, Horry, Georgetown).

### Step 2: Provider search

The `property-sync` processor calls `BatchDataPropertyProvider.searchProperties()` with county, state, and distress status filters (`PRE_FORECLOSURE`, `AUCTION_SCHEDULED`, `TAX_LIEN`). The provider maps filters to the BatchData API format, makes the HTTP call, validates the response with Zod schemas, and maps each result to a `NormalizedProperty`.

### Step 3: Ingestion service

For each `NormalizedProperty`, the processor calls `IngestionService.ingestProperty(normalized, 'BATCHDATA')`. The ingestion service orchestrates:

1. **Address normalization** -- `EntityMatcher.normalizeForComparison()` standardizes the address string for dedup matching (uppercase, remove punctuation, expand abbreviations).
2. **Match/dedupe** -- Queries up to 500 properties in the same county and runs the `EntityMatcher.matchProperty()` algorithm. Matching uses address similarity, parcel number/APN exact match, and owner name fuzzy match. Returns a `MatchResult` with `matched: boolean`, `matchedPropertyId`, and `confidence` (0 to 1).
3. **Create or update Property** -- If matched, merges the new data into the existing record (only overwriting null/undefined fields). If not matched, creates a new `Property` row.
4. **PropertySourceRecord** -- Creates a `PropertySourceRecord` linking the property to this provider fetch, storing the full raw payload, normalized data, fetch timestamp, and match confidence.
5. **Upsert Opportunity** -- Creates or updates an `Opportunity` for this property with distress stage, auction date, days until sale, and estimated ARV.
6. **Score calculation** -- Calls `FlipScoringEngine.calculateScore()` with an `ExtendedFlipScoreInput` built from the property, opportunity, notice count, and lien count. Persists the resulting score and financial projections (max allowable offer, target purchase price, rehab cost, gross/net margin, days to flip) to the Opportunity record.
7. **Change detection** -- If updating an existing property, the matcher generates a list of changed fields. These are stored as `PropertyChangeEvent` records for the audit trail.

### Step 4: Sync tracking

The processor creates a `ProviderSyncJob` record at the start of each run and updates it on completion with status (`COMPLETED`, `COMPLETED_WITH_ERRORS`, `FAILED`), record counts, and any error message.

### Step 5: ATTOM enrichment (separate job)

Properties with `estimatedValue: null` created in the last 7 days are periodically enriched via the `attom-enrichment` job. This calls `AttomPropertyProvider.enrichProperty()` to fill in AVM valuation data, then re-ingests the enriched property through the same `IngestionService.ingestProperty()` flow.

## Notice Ingestion Flow

County notices enter through the county adapter sync jobs. The flow is:

### Step 1: Job triggers

Each county adapter has its own scheduled job (e.g., `greenville-sync` at `0 */4 * * *`). The `county-sync` processor instantiates the appropriate adapter via a factory function.

### Step 2: Fetch raw notices

The adapter's `fetchNotices()` method scrapes the county source. The `BaseCountyAdapter` provides:
- Rate limiting (minimum 2 seconds between HTTP requests)
- Retry with exponential backoff (3 attempts, 2s/4s/8s delays)
- `robots.txt` checking
- HTML table parsing utilities

Each adapter returns an array of `RawNoticeRecord` objects (county-specific shape).

### Step 3: Parse to normalized format

For each raw notice, the adapter's `parseNotice()` method converts it to a `NormalizedNotice` with canonical fields: county, notice type, case number, address, parcel number, borrower/lender names, auction date, default amount, document URL, and raw data.

### Step 4: Ingestion service

The processor calls `IngestionService.ingestNotice(normalized, 'COUNTY_SCRAPER')`. The ingestion service:

1. **Match to property** -- If the notice has an address or parcel number, runs `EntityMatcher.matchProperty()` against properties in the same county. Uses address similarity and owner name (defendant) matching.
2. **Deduplicate notice** -- Checks for an existing `CountyNotice` with the same case number and county. Updates if found, creates if new.
3. **Create CountyNotice** -- Stores the notice with its matched property ID (if any), notice type (mapped to enum: `MASTER_IN_EQUITY`, `UPSET_BID`, `LIS_PENDENS`, `TAX_SALE`, `PUBLIC_NOTICE`, `OTHER`), case details, and match confidence.
4. **Upsert Opportunity** -- If matched to a property, creates or updates an Opportunity with the distress stage derived from the notice type (e.g., `MASTER_IN_EQUITY` maps to `AUCTION_SCHEDULED`).
5. **Score calculation** -- Recalculates the flip score for the matched property with updated distress data.

### Step 5: Adapter run tracking

A `CountyAdapterRun` record tracks each adapter execution with: adapter name, county, status, start/end times, notices found/processed/failed, and error message.

## Score Calculation Trigger Flow

Scores are calculated at three points:

### On ingestion (inline)

Every call to `IngestionService.ingestProperty()` or `IngestionService.ingestNotice()` (when matched to a property) triggers an immediate score calculation. The score is persisted to the Opportunity record.

### Scheduled recalculation (batch)

The `recalculate-scores` job runs daily at 2 AM (`0 2 * * *`). It loads all active Opportunities with their Property records, recalculates scores in batches of 50, and updates every Opportunity. It logs score changes (old vs new) for monitoring.

### Manual recalculation (API)

POST to `/api/scoring/recalculate` triggers the same logic. Accepts an optional `opportunityIds` array to recalculate specific opportunities, or recalculates all active ones if omitted.

### Score calculation internals

The `FlipScoringEngine` computes 12 factor scores (each 0-100) and combines them via weighted average:

```
finalScore = sum(factorScore[i] * weight[i]) / sum(weight[i])
```

The engine also computes financial projections:
- **Max allowable offer** = ARV * 0.70 - rehab cost (70% rule)
- **Target purchase price** = max allowable offer * 0.85
- **Projected gross margin** = resale price - purchase price - rehab cost
- **Projected net margin** = gross margin - closing costs (6% of resale) - holding costs ($2,500/month)
- **Projected days to flip** = 90-180 days based on county market speed, rehab scope, property size, and age

## Alert Evaluation and Dispatch Flow

### Evaluation triggers

Alerts are evaluated at these points:

1. **New opportunity / score update** -- The `evaluate-alerts` job is queued after property ingestion. It runs `AlertEngine.evaluateOpportunity()` which checks the opportunity against all active `NEW_OPPORTUNITY` alert rules, then checks `HOT_LEAD` rules against the current flip score.
2. **Daily digest** -- The `daily-digest` job runs at 7 AM. `AlertEngine.generateDailyDigest()` gathers all opportunities created in the last 24 hours, groups them by alert rule, and sends one digest per subscribed user.
3. **Auction reminders** -- The `auction-reminders` job runs at 8 AM. `AlertEngine.checkAuctionAlerts()` finds opportunities with auction dates at 14, 7, 3, or 1 day milestones and dispatches `AUCTION_APPROACHING` alerts.
4. **Status changes** -- `AlertEngine.checkStatusChangeAlert()` is called when an opportunity's distress stage changes during ingestion.

### Rule matching

Each alert rule can specify filters:

| Filter | Field | Description |
|--------|-------|-------------|
| County | `countyFilter` (array) | Only match properties in these counties |
| Score threshold | `scoreThreshold` (number) | Only match when flip score >= threshold |
| Distress stages | `filters.distressStages` (array) | Only match specific distress stages |
| Property types | `filters.propertyTypes` (array) | Only match specific property types |
| ARV range | `filters.minARV`, `filters.maxARV` | Only match within ARV range |
| Margin range | `filters.minMargin`, `filters.maxMargin` | Only match within projected net margin range |

### Dispatch

When a rule matches, the `AlertEngine`:

1. Builds template data from the opportunity and property records.
2. Generates email subject and HTML body via `getAlertEmailHtml(alertType, templateData)`.
3. Creates an `AlertEvent` record with status `PENDING`.
4. Calls `AlertDispatcher.dispatch()` with the event.

The `AlertDispatcher` routes by channel:

| Channel | Status | Behavior |
|---------|--------|----------|
| `EMAIL` | Active | Sends via Nodemailer using `SMTP_*` environment variables. Resolves recipient from alert rule user or explicit email in payload. |
| `SMS` | Placeholder | Logs a warning and marks the event as `SKIPPED`. |
| `SLACK` | Placeholder | Logs a warning and marks the event as `SKIPPED`. |
| `WEBHOOK` | Active | POSTs JSON payload to the configured URL with retry. |

After successful dispatch, the `AlertEvent` record is updated to status `SENT` with a `sentAt` timestamp. On failure, it is marked `FAILED` with the error message.

## Webhook Payload Format

Outgoing webhooks send a POST request with `Content-Type: application/json`. The payload structure is:

```json
{
  "alertType": "NEW_OPPORTUNITY",
  "alertEventId": "clu1abc2def3ghi4jkl",
  "channel": "WEBHOOK",
  "payload": {
    "subject": "New Opportunity: 123 Main St, Greenville, SC",
    "html": "<html>...</html>",
    "opportunityId": "clu5mno6pqr7stu8vwx",
    "address": "123 Main St",
    "county": "Greenville",
    "propertyType": "SINGLE_FAMILY",
    "flipScore": 78,
    "estimatedARV": 245000,
    "estimatedRehabCost": 35000,
    "maxAllowableOffer": 136500,
    "targetPurchasePrice": 116025,
    "projectedGrossMargin": 72000,
    "projectedNetMargin": 42300,
    "projectedDaysToFlip": 105,
    "auctionDate": "2026-05-15T00:00:00.000Z",
    "daysUntilSale": 44,
    "distressStage": "AUCTION_SCHEDULED",
    "pipelineStage": "NEW"
  },
  "sentAt": "2026-04-01T14:30:00.000Z"
}
```

### Alert type variations

The `payload` contents vary by alert type:

**NEW_OPPORTUNITY** -- Full opportunity template data as shown above.

**HOT_LEAD** -- Same as NEW_OPPORTUNITY plus a `score` field.

**AUCTION_APPROACHING** -- Same as NEW_OPPORTUNITY plus `daysUntilSale` (the milestone value: 14, 7, 3, or 1) and `daysUntilAuction`.

**STATUS_CHANGED** -- Same as NEW_OPPORTUNITY plus `oldStage` and `newStage`.

**DAILY_DIGEST** -- Contains `opportunities` (array of opportunity template data objects), `count` (number of matches), and `matchCount`.

## Webhook Retry Behavior

The dispatcher retries failed webhook deliveries up to 3 times with exponential backoff:

- Attempt 1: immediate
- Attempt 2: 1 second delay
- Attempt 3: 2 seconds delay

A non-2xx HTTP status code from the webhook endpoint is treated as a failure and triggers a retry. After all retries are exhausted, the `AlertEvent` is marked `FAILED`.

## Configuring Webhook Endpoints

Webhook URLs can be configured at three levels (checked in order):

1. **Per-rule payload** -- The alert rule's payload can include a `webhookUrl` or `url` field.
2. **Environment variable** -- Set `ALERT_WEBHOOK_URL` as a global default.
3. **Not configured** -- If no URL is found, the webhook dispatch throws an error and the alert event is marked `FAILED`.

### Setting up a webhook endpoint

1. Navigate to `/settings` or `/admin` in the dashboard.
2. Create or edit an alert rule.
3. Set the channel to `WEBHOOK`.
4. Provide the webhook URL in the rule configuration.
5. Use the `/api/alerts/test` endpoint to send a test alert and verify delivery.

### Webhook security considerations

- Webhook payloads currently do not include HMAC signatures for verification. If you need to verify that webhooks originate from FFR, implement URL-based secret tokens (e.g., `https://your-endpoint.com/webhook?token=secret`).
- Webhook delivery is best-effort. The 3-retry policy handles transient failures but does not queue for later redelivery after all retries fail.
- The `AlertEvent` table provides a full audit log of all dispatch attempts, statuses, and error messages.

## File Reference

| File | Purpose |
|------|---------|
| `src/lib/services/ingestion.ts` | `IngestionService` -- property and notice ingestion orchestration |
| `src/lib/alerts/engine.ts` | `AlertEngine` -- rule evaluation for all alert types |
| `src/lib/alerts/dispatcher.ts` | `AlertDispatcher` -- multi-channel delivery (email, webhook) |
| `src/lib/alerts/templates.ts` | Email HTML template generation |
| `src/lib/scoring/engine.ts` | `FlipScoringEngine` -- 12-factor scoring with financial projections |
| `src/lib/matching/matcher.ts` | `EntityMatcher` -- address/parcel/owner dedup matching |
| `src/lib/jobs/processors/property-sync.ts` | BatchData sync and ATTOM enrichment job processors |
| `src/lib/jobs/processors/county-sync.ts` | County adapter sync job processor |
| `src/lib/jobs/processors/alerts.ts` | Alert evaluation and dispatch job processors |
| `src/lib/jobs/processors/scoring.ts` | Score recalculation job processor |
