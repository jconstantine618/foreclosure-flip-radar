# Foreclosure Flip Radar (FFR)

A production-ready MVP platform for discovering, evaluating, and acting on distressed residential property opportunities in South Carolina, with focus on Greenville County and the Myrtle Beach coastal region (Horry County priority).

## Tech Stack

- **Framework:** Next.js 15 (App Router, TypeScript)
- **Database:** PostgreSQL + Prisma ORM
- **Styling:** Tailwind CSS + shadcn/ui
- **Background Jobs:** BullMQ + Redis
- **Auth:** NextAuth.js (v5 beta)
- **Validation:** Zod
- **Logging:** Pino
- **Email:** Nodemailer

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis 7+

### Setup

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd foreclosure-flip-radar
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your database, Redis, and API credentials
   ```

4. Set up the database:
   ```bash
   npx prisma generate
   npx prisma db push
   npm run db:seed
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Start the background worker (separate terminal):
   ```bash
   npm run jobs:worker
   ```

7. Open http://localhost:3000

## Architecture

### Provider Abstraction Layer

FFR uses a provider abstraction so data sources can be swapped without changing business logic:

- **PropertyProvider** - search/detail/enrichment (BatchData primary, ATTOM fallback)
- **NoticeProvider** - county notice ingestion
- **ValuationProvider** - property valuation
- **GeocodingProvider** - address geocoding

### County Adapters

Independent adapters fetch foreclosure data from county sources:

| Adapter | County | Source | Type |
|---------|--------|--------|------|
| GreenvilleMIEAdapter | Greenville | Master in Equity | HTTP/Parse |
| HorryMIEAdapter | Horry | Master in Equity | HTTP/Parse |
| HorryUpsetBidAdapter | Horry | Upset Bid Sales | HTTP/Parse |
| SCPublicNoticesAdapter | Statewide | Public Notices | HTTP/Parse |

Adding a new county requires implementing `BaseCountyAdapter` with `fetchNotices()` and `parseNotice()`.

### Flip Scoring Engine

Scores opportunities 0-100 using 12 weighted factors:

| Factor | Default Weight | Description |
|--------|---------------|-------------|
| Equity Score | 15 | Equity percentage of estimated value |
| Distress Urgency | 12 | Stage urgency (AUCTION > PRE_FORECLOSURE > REO) |
| ARV Confidence | 10 | After-repair value estimate confidence |
| Days Until Sale | 10 | Urgency based on auction proximity |
| Occupancy Risk | 8 | Vacancy vs owner-occupied |
| Neighborhood Turnover | 5 | Market activity velocity |
| Rehab Complexity | 10 | Age, size, type complexity |
| List-to-Market Speed | 5 | Local market absorption rate |
| Spread After Costs | 15 | Net margin after all costs |
| Title Complexity | 5 | Lien/notice complexity penalty |
| Condo/HOA Penalty | 3 | HOA cost penalty |
| Flood Zone Risk | 2 | Flood zone penalty |

Weights are admin-configurable and sum to 100.

### Data Flow

```
County Source / API → Adapter/Provider → Normalize → Match/Dedupe → Score → Alert → Dashboard
```

1. Raw data ingested from provider or county adapter
2. Normalized to canonical property model
3. Matched against existing records (address, APN, case number)
4. Flip score calculated
5. Alerts evaluated and dispatched
6. Available in dashboard within next refresh cycle

### Background Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| BatchData Sync | Every 6 hours | Poll BatchData for new properties |
| Greenville MIE | Every 4 hours | Fetch Greenville Master in Equity sales |
| Horry MIE | Every 4 hours | Fetch Horry Master in Equity sales |
| Horry Upset Bid | Every 4 hours | Fetch Horry upset bid sales |
| SC Public Notices | Every 8 hours | Fetch SC public notices |
| Score Recalculation | Daily 2 AM | Recalculate all active scores |
| Daily Digest | Daily 7 AM | Send daily opportunity digest |
| Auction Reminders | Daily 8 AM | Send auction approaching alerts |
| Stale Cleanup | Weekly Sunday 3 AM | Mark old opportunities inactive |
| Duplicate Reconciliation | Daily 4 AM | Re-match unmatched notices |

### Alert System

Configurable alerts with multiple channels:

- **NEW_OPPORTUNITY** - New property discovered
- **HOT_LEAD** - Score exceeds threshold
- **AUCTION_APPROACHING** - 14/7/3/1 day warnings
- **STATUS_CHANGED** - Distress stage change
- **DAILY_DIGEST** - Daily summary

Channels: Email (active), SMS (placeholder), Slack (placeholder), Webhook (active)

## Pages

| Route | Description |
|-------|-------------|
| `/dashboard` | Overview with stats, recent opportunities, notices |
| `/opportunities` | Filterable opportunity list |
| `/opportunities/[id]` | Underwriting/detail screen |
| `/auctions` | Upcoming auction calendar |
| `/notices` | County notice feed |
| `/pipeline` | Kanban pipeline board |
| `/watchlist` | Saved properties |
| `/saved-searches` | Saved filter sets |
| `/settings` | User preferences and alerts |
| `/admin` | Provider config, adapters, weights, logs |

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/sync/providers` | Trigger provider sync |
| POST | `/api/sync/county` | Trigger county adapter sync |
| GET | `/api/opportunities` | List opportunities (filtered) |
| GET/PATCH | `/api/opportunities/[id]` | Get/update opportunity |
| GET | `/api/opportunities/export` | Export CSV |
| GET/POST/DELETE | `/api/watchlist` | Manage watchlist |
| CRUD | `/api/saved-searches` | Manage saved searches |
| POST | `/api/scoring/recalculate` | Recalculate scores |
| POST | `/api/alerts/test` | Send test alert |
| CRUD | `/api/alerts/rules` | Manage alert rules |
| POST | `/api/properties/[id]/refresh` | Refresh property data |

## Environment Variables

See `.env.example` for all required variables. Key ones:

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `BATCHDATA_API_KEY` - BatchData API key
- `ATTOM_API_KEY` - ATTOM API key (optional fallback)
- `NEXTAUTH_SECRET` - Auth secret
- `SMTP_*` - Email configuration
- `ENABLE_SKIP_TRACE` - Enable skip trace (default: false)
- `ENABLE_CONTACT_DATA` - Enable contact data (default: false)

## Testing

```bash
npm test          # Watch mode
npm run test:run  # Single run
```

## Deployment

Designed for:
- **App:** Vercel
- **Database:** Neon / Supabase / Railway PostgreSQL
- **Redis:** Upstash / Railway Redis
- **Workers:** Railway / Render background worker

## Adding New Counties

1. Create adapter extending `BaseCountyAdapter` in `src/lib/county-adapters/`
2. Implement `fetchNotices()` and `parseNotice()` methods
3. Register in `src/lib/county-adapters/index.ts`
4. Add scheduled job in `src/lib/jobs/scheduler.ts`
5. Add county to seed data

Planned expansion: Georgetown, Marion, Florence, Dillon, Williamsburg (SC), Brunswick, Columbus (NC).

## License

Private - All rights reserved.
