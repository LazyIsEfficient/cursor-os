# Architecture Overview

Platform uses microservices architecture with:

- **PostgreSQL 17** primary OLTP database (via Prisma and Drizzle ORMs)
- **Google BigQuery** data warehouse for analytics, reporting, long-term storage
- **Redis 7.x** pub/sub messaging and job queues
- **Event sourcing** with inbox/outbox pattern for reliable cross-service communication
- **Scheduled cron jobs** for recurring ETL and data distribution tasks

## Service Boundaries

| Service | Purpose | Port | Database Access |
|---|---|---|---|
| `evm-indexer` | Blockchain event ingestion pipeline | 3000 | Shared PostgreSQL (writes events, allocations) |
| `points-service` | Scheduled points distribution + quest resets | 3001 | Shared PostgreSQL (reads/writes points, activities) |
| `platform-app` | Next.js web frontend + API routes | 3000 | Shared PostgreSQL (reads all, writes user data) |
| `redeem-api` | Token redemption platform | 4000 | Separate PostgreSQL (Drizzle migrations) |

Services share PostgreSQL database via `@repo/prisma`, decoupled through event sourcing inbox/outbox pattern.
