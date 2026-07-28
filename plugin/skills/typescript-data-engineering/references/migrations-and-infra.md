# Migrations and Local Dev Infrastructure

> **Scope:** database migrations and **local development** stack (Docker Compose) only.
> Cloud provisioning — GCP/AWS/Cloudflare resources, Pulumi/IaC, secrets management —
> out of scope for this skill, not authored here. This file covers how migrations run
> and how to stand up stores on your machine, not how production stores are provisioned.

## Database Migration Rules

### Prisma Migrations

```bash
# Generate migration from schema changes
npx prisma migrate dev --name descriptive_migration_name

# Apply migrations in CI/production (Cloud Build)
npx prisma migrate deploy
```

Cloud Build config: `packages/prisma/cloudbuild.migrate.yaml`

### Drizzle Migrations

```bash
# Generate migration
npx drizzle-kit generate

# Apply migration
npx drizzle-kit migrate
```

### Migration Rules

- **Never** modify deployed migration — create new one
- Migrations must be backwards-compatible: add columns nullable, backfill, then add constraints
- Name migrations descriptively: `add_user_wallet_address`, `create_point_categories_table`
- Test migrations against copy of production data before deploying
- Include both `up` and `down` logic where possible

## Infrastructure

### Local Development

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:17
  redis:
    image: redis:7.2
    # password-protected
```

### Cloud (provisioning out of scope for this skill)

Production data stores this pipeline targets — Cloud Storage buckets, BigQuery warehouse, managed Postgres/Redis, secrets, DNS/CDN — **provisioned by infrastructure-as-code practice (Pulumi/Terraform), outside this skill's boundary**. Do not author provisioning here. Treat those stores as given; connect via environment config.

One cloud touchpoint that *is* data-engineering's concern: **where migrations run** in CI/CD — `npx prisma migrate deploy` invoked from deployment pipeline (see Cloud Build config above). Pipeline wiring itself out of scope.

### Monorepo Structure

> Layout below is orientation for where pipeline/migration code lives. Repo build/deploy tooling and cloud wiring out of scope.

```
platform-monorepo/
├── apps/
│   └── platform-app/       ← Next.js frontend + API routes
├── services/
│   ├── evm-indexer/         ← Blockchain data pipeline
│   └── points-service/      ← Scheduled points distribution
└── packages/
    ├── prisma/              ← Shared database client + schema
    ├── config/              ← Shared configuration
    └── typescript-config/   ← Shared tsconfig
```

Build orchestration: **Turbo** (v2.4.4+) with **pnpm** (v10.2.0+) workspaces.
