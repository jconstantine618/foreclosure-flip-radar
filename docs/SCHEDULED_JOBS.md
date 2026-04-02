# Scheduled Jobs

This document covers all background jobs in Foreclosure Flip Radar, their schedules, configuration, manual invocation, deployment, and monitoring.

## Job Architecture

Background jobs use BullMQ with Redis as the message broker. Jobs are organized into six queues, each processed by a dedicated worker:

| Queue | Worker | Concurrency | Purpose |
|-------|--------|-------------|---------|
| `property-ingestion` | `createPropertySyncWorker` | 2 | BatchData polling and ATTOM enrichment |
| `county-adapter` | `createCountySyncWorker` | 1 | County-specific notice scraping |
| `scoring` | `createScoringWorker` | 1 | Flip score recalculation |
| `alerts` | `createAlertWorker` | 5 | Alert evaluation and dispatch |
| `enrichment` | (reserved) | -- | Future enrichment pipeline |
| `maintenance` | `createMaintenanceWorker` | 1 | Cleanup, dedup reconciliation, health checks |

All queues share a single Redis connection configured via the `REDIS_URL` environment variable (default: `redis://localhost:6379`).

## All Scheduled Jobs

### Property Ingestion

| Job Name | Queue | Cron Expression | Schedule | Description |
|----------|-------|-----------------|----------|-------------|
| `batchdata-sync` | `property-ingestion` | `0 */6 * * *` | Every 6 hours at :00 | Polls BatchData API for distressed properties in Greenville, Horry, and Georgetown counties. Creates/updates Property records, upserts Opportunities, and calculates flip scores. |

### County Adapter Syncs

| Job Name | Queue | Cron Expression | Schedule | Description |
|----------|-------|-----------------|----------|-------------|
| `greenville-sync` | `county-adapter` | `0 */4 * * *` | Every 4 hours at :00 | Fetches Greenville County Master in Equity sale notices. |
| `horry-mie-sync` | `county-adapter` | `0 1,5,9,13,17,21 * * *` | Every 4 hours at :01 (offset) | Fetches Horry County Master in Equity sale notices. Offset by 1 hour from Greenville to avoid concurrent scraping. |
| `horry-upset-sync` | `county-adapter` | `0 2,6,10,14,18,22 * * *` | Every 4 hours at :02 (offset) | Fetches Horry County upset bid sale notices. Offset by 2 hours. |
| `sc-notices-sync` | `county-adapter` | `0 */8 * * *` | Every 8 hours at :00 | Fetches statewide SC public notices. |

### Scoring

| Job Name | Queue | Cron Expression | Schedule | Description |
|----------|-------|-----------------|----------|-------------|
| `recalculate-scores` | `scoring` | `0 2 * * *` | Daily at 2:00 AM | Recalculates flip scores for all active Opportunities. Processes in batches of 50. Logs score changes. |

### Alerts

| Job Name | Queue | Cron Expression | Schedule | Description |
|----------|-------|-----------------|----------|-------------|
| `daily-digest` | `alerts` | `0 7 * * *` | Daily at 7:00 AM | Generates and sends daily digest emails to users subscribed to DAILY_DIGEST alert rules. Includes all new opportunities from the last 24 hours. |
| `auction-reminders` | `alerts` | `0 8 * * *` | Daily at 8:00 AM | Checks for upcoming auctions at 14, 7, 3, and 1 day milestones. Sends AUCTION_APPROACHING alerts. |

### Maintenance

| Job Name | Queue | Cron Expression | Schedule | Description |
|----------|-------|-----------------|----------|-------------|
| `stale-cleanup` | `maintenance` | `0 3 * * 0` | Weekly, Sunday at 3:00 AM | Deactivates opportunities where the auction date passed more than 30 days ago, or where there have been no updates for 90 days. |
| `duplicate-reconciliation` | `maintenance` | `0 4 * * *` | Daily at 4:00 AM | Finds county notices with no linked property (`propertyId: null`) and re-runs entity matching. Processes up to 200 unmatched notices per run. |
| `sync-health-check` | `maintenance` | `0 6,18 * * *` | Every 12 hours (6 AM, 6 PM) | Runs `healthCheck()` on all registered county adapters. Checks for recent failed adapter runs and adapters that have not run in the last 24 hours. |

## How to Modify Schedules

Schedules are defined in `src/lib/jobs/scheduler.ts` using BullMQ repeatable job patterns. To change a schedule:

1. Open `src/lib/jobs/scheduler.ts`.
2. Find the `await <queue>.add()` call for the job you want to modify.
3. Change the `repeat.pattern` value. This accepts standard 5-field cron expressions:
   ```
   ┌───────────── minute (0-59)
   │ ┌───────────── hour (0-23)
   │ │ ┌───────────── day of month (1-31)
   │ │ │ ┌───────────── month (1-12)
   │ │ │ │ ┌───────────── day of week (0-6, Sunday=0)
   │ │ │ │ │
   * * * * *
   ```
4. Restart the worker process. BullMQ will remove the old repeatable schedule and register the new one.

### Important notes on schedule changes

- BullMQ stores repeatable job configurations in Redis. Simply changing the code and restarting will create a new repeatable job, but the old one may still exist in Redis. The worker startup calls `setupScheduledJobs()` which adds jobs idempotently by name. If you change the cron pattern for an existing job name, BullMQ creates a new repeatable entry. You may need to clean up stale repeatable entries via the BullMQ dashboard or Redis CLI.
- All times are in the server's local timezone. For production, ensure the server timezone is set consistently (UTC recommended).

## Running Jobs Manually via API

### Provider sync

```bash
# Trigger BatchData property sync
curl -X POST http://localhost:3000/api/sync/providers \
  -H "Content-Type: application/json" \
  -d '{"provider": "batchdata", "counties": ["Greenville", "Horry"]}'
```

### County adapter sync

```bash
# Trigger a specific county adapter
curl -X POST http://localhost:3000/api/sync/county \
  -H "Content-Type: application/json" \
  -d '{"adapter": "greenville-sync"}'
```

### Score recalculation

```bash
# Recalculate all active scores
curl -X POST http://localhost:3000/api/scoring/recalculate

# Recalculate specific opportunities
curl -X POST http://localhost:3000/api/scoring/recalculate \
  -H "Content-Type: application/json" \
  -d '{"opportunityIds": ["id1", "id2"]}'
```

### Test alert

```bash
curl -X POST http://localhost:3000/api/alerts/test \
  -H "Content-Type: application/json" \
  -d '{"alertType": "NEW_OPPORTUNITY", "channel": "EMAIL"}'
```

## Worker Deployment

### Development

Run the worker in a separate terminal:

```bash
npm run jobs:worker
```

This starts all five workers and registers all scheduled jobs. The worker listens for SIGINT and SIGTERM for graceful shutdown (waits for active jobs to finish before closing).

### Production -- Railway / Render

Deploy the worker as a separate service from the web application:

1. **Procfile / start command:** `npm run jobs:worker`
2. **Environment variables:** The worker needs the same variables as the web app, specifically:
   - `DATABASE_URL` -- PostgreSQL connection string
   - `REDIS_URL` -- Redis connection string
   - `BATCHDATA_API_KEY` -- For property sync jobs
   - `ATTOM_API_KEY` -- For enrichment jobs (optional)
   - `SMTP_*` -- For email alert dispatch
   - `ALERT_WEBHOOK_URL` -- For webhook alert dispatch (optional)
3. **Single instance:** Run exactly one worker instance to avoid duplicate scheduled job registration. BullMQ handles concurrency within the worker process.
4. **Health monitoring:** The worker logs to stdout via Pino. Monitor for `worker started` and watch for `job failed` log entries.

### Production -- Vercel + external worker

Vercel does not support long-running processes. Deploy the worker separately:

1. Deploy the Next.js app to Vercel.
2. Deploy the worker to Railway, Render, or a VPS.
3. Both must share the same `DATABASE_URL` and `REDIS_URL`.
4. The web app enqueues jobs via the BullMQ queue API. The worker picks them up.

## Job Retry and Error Handling

### Automatic retries

BullMQ provides built-in retry behavior. The default retry configuration for FFR workers is:

- Jobs that throw an error are marked as `failed` by BullMQ.
- BullMQ's default retry policy allows jobs to be retried based on the queue configuration. FFR does not currently set custom `attempts` or `backoff` on individual jobs, so failed jobs are not automatically retried by default.
- To enable automatic retries, add options when scheduling or enqueueing jobs:

```typescript
await propertyIngestionQueue.add(
  'batchdata-sync',
  { counties: ['Greenville', 'Horry'] },
  {
    repeat: { pattern: '0 */6 * * *' },
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
);
```

### Application-level retry

Within job processors, individual record processing is wrapped in try/catch blocks. A single failed property or notice does not abort the entire job. Instead:

- The error is logged with context (property address, notice case number, adapter name).
- An error counter is incremented.
- Processing continues with the next record.
- The final status reflects partial failure: `COMPLETED_WITH_ERRORS` vs `COMPLETED`.

### County adapter retry

The `BaseCountyAdapter.fetchWithRetry()` method retries HTTP requests up to 3 times with exponential backoff (2s, 4s, 8s). This handles transient network errors and temporary HTTP 5xx responses from county sources.

### Webhook retry

The `AlertDispatcher` retries webhook delivery up to 3 times with 1s/2s delay between attempts. See the WEBHOOK_EVENT_FLOW.md document for details.

### Error tracking in the database

| Table | Tracks |
|-------|--------|
| `ProviderSyncJob` | Provider sync runs (status, record counts, error message) |
| `CountyAdapterRun` | County adapter runs (status, notice counts, error message) |
| `AlertEvent` | Individual alert dispatch attempts (status: PENDING/SENT/FAILED/SKIPPED, error message) |

## Monitoring Job Health

### Sync health check job

The `sync-health-check` maintenance job runs every 12 hours and performs:

1. **Adapter health checks** -- Calls `healthCheck()` on each county adapter, which makes a HEAD request to the adapter's base URL and reports HTTP status.
2. **Recent failure detection** -- Queries `CountyAdapterRun` records from the last 24 hours and logs warnings for any with `FAILED` status.
3. **Missing run detection** -- Compares the list of registered adapters against recent runs and warns about adapters that have not run in the last 24 hours.

### Log monitoring

All workers use Pino structured logging with these key fields:

- `module: 'worker'` or `module: 'scheduler'` -- Source module
- `worker: '<name>'` -- Worker type (property-sync, county-sync, scoring, alerts, maintenance)
- `jobId` -- BullMQ job identifier
- `jobName` -- Human-readable job name
- `adapter` -- County adapter name (for county-sync jobs)

Key log events to monitor:

| Log Level | Event | Meaning |
|-----------|-------|---------|
| `info` | `job completed` | Job finished successfully |
| `error` | `job failed` | Job threw an unrecoverable error |
| `warn` | `adapter unhealthy` | County source is unreachable |
| `warn` | `no recent runs found for adapter` | An adapter has not run in 24+ hours |
| `error` | `failed to ingest property` | Individual property ingestion failed |
| `error` | `failed to process notice` | Individual notice processing failed |
| `info` | `recalculate-scores: completed` | Score batch complete (check `totalChanged` and `totalErrors`) |

### Manual health check via admin panel

The `/admin` page displays:

- Recent `ProviderSyncJob` records with status, timing, and record counts.
- Recent `CountyAdapterRun` records with status and notice counts.
- Recent `AlertEvent` records with delivery status.

### Redis monitoring

Use the Redis CLI or a dashboard (e.g., BullMQ Board, Bull Dashboard) to inspect:

- Queue lengths (backlog)
- Active jobs
- Failed jobs (stuck in failed state)
- Repeatable job registrations
- Delayed jobs

```bash
# Check queue lengths via Redis CLI
redis-cli LLEN bull:property-ingestion:wait
redis-cli LLEN bull:county-adapter:wait
redis-cli LLEN bull:scoring:wait
redis-cli LLEN bull:alerts:wait
redis-cli LLEN bull:maintenance:wait
```

## File Reference

| File | Purpose |
|------|---------|
| `src/lib/jobs/queue.ts` | Queue definitions and shared Redis connection |
| `src/lib/jobs/scheduler.ts` | Cron schedule registration for all repeatable jobs |
| `src/lib/jobs/worker.ts` | Worker entrypoint (start all workers, graceful shutdown) |
| `src/lib/jobs/processors/property-sync.ts` | BatchData sync and ATTOM enrichment processors |
| `src/lib/jobs/processors/county-sync.ts` | County adapter sync processor |
| `src/lib/jobs/processors/scoring.ts` | Score recalculation processor |
| `src/lib/jobs/processors/alerts.ts` | Alert evaluation, dispatch, digest, and reminder processors |
| `src/lib/jobs/processors/maintenance.ts` | Stale cleanup, duplicate reconciliation, health check processors |
