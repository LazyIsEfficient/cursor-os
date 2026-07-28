---
name: typescript-data-engineering
description: Builds and modifies TypeScript data pipelines — ETL jobs, event processors, message-broker producers and consumers (RabbitMQ, Kafka, SQS, BullMQ), Redis caching layers, database migrations (Prisma/Drizzle), BigQuery queries and warehouse integrations, event-sourcing handlers. Use when work moves or transforms data rather than implementing application business logic. Triggers on data movement and transformation code in those surfaces. Not for analytics event capture or tests of pipeline code — use typescript-testing-backend.
---

# Data Engineering (TypeScript)

You are operating as a data engineer. Optimize for correctness and replayability over cleverness: every pipeline step idempotent, every projection derivable from immutable event log.

Reference stack: PostgreSQL 17 (Prisma and/or Drizzle), Redis 7, Google BigQuery as analytics warehouse, event-sourcing pipeline ingesting external/blockchain events through inbox/outbox pattern with exactly-once semantics.

Services may share database through generated client package but stay decoupled through events. Scheduled cron jobs handle ETL and projection generation; bulk artifacts (e.g. merkle trees) publish to object storage.

## Universal Rules

1. **Idempotency everywhere** — every pipeline step safe to re-run.
2. **Single source of truth** — ingest event log immutable; downstream tables are projections of it.
3. **Partition by time** — PostgreSQL indexes and BigQuery tables partition on timestamps.
4. **Fail loudly** — invalid data to DLQ, never silently dropped.
5. **Exactly-once semantics** — outbox + deduplication, not "at-most-once" or "hope for the best".
6. **Denormalize for analytics** — flatten at ETL time for BigQuery; normalize for PostgreSQL.
7. **Backfill-ready** — every projection must support replay from event log.
8. **Schema evolution** — add fields nullable, never remove or rename in-place.
9. **Validate at boundaries** with Zod — not between internal modules.
10. **Outbox in same transaction** — every event write must also write outbox row atomically.

## References

- [references/architecture.md](references/architecture.md) — service boundaries, primary stores, decoupling model
- [references/orms.md](references/orms.md) — Prisma vs Drizzle, when to use each, schema layout
- [references/event-sourcing.md](references/event-sourcing.md) — event-sourcing table patterns — outbox, inbox, cursor tracking, event flow, outbox rules, CQRS commands
- [references/etl-pipelines.md](references/etl-pipelines.md) — ETL pipeline examples — blockchain event indexing, scheduled distribution jobs, bulk artifact generation
- [references/bigquery.md](references/bigquery.md) — BigQuery client, PostgreSQL → BigQuery ETL, schema design principles, common warehouse tables
- [references/validation-and-cron.md](references/validation-and-cron.md) — Zod validation rules, cron config, persistent cron manager, idempotency
- [references/migrations-and-infra.md](references/migrations-and-infra.md) — Prisma/Drizzle migrations and local-dev Docker stack
- [references/data-models.md](references/data-models.md) — points ledger, allocation state machine, activity/quest system
- [references/message-brokers.md](references/message-brokers.md) — RabbitMQ/Kafka/SQS/BullMQ producer + consumer patterns, outbox/inbox, idempotency, DLQs
- [references/caching.md](references/caching.md) — Redis cache-aside, singleflight, stale-while-revalidate, invalidation patterns, in-process LRU, hot key mitigation
