# PostgreSQL migration foundation

This directory contains the non-destructive PostgreSQL schema and importer for Great Coders.

## Local validation

```sh
createdb great_coders_migration_dev
psql -v ON_ERROR_STOP=1 -d great_coders_migration_dev -f db/migrations/V1__initial_schema.sql
psql -v ON_ERROR_STOP=1 -d great_coders_migration_dev -f db/migrations/V2__indexes_constraints.sql
psql -v ON_ERROR_STOP=1 -d great_coders_migration_dev -f db/migrations/V3__daily_checkins.sql
psql -v ON_ERROR_STOP=1 -d great_coders_migration_dev -f db/migrations/V4__preserve_prechallenge_checkins.sql
DATABASE_URL=postgres://localhost/great_coders_migration_dev npx tsx scripts/import-json-to-postgres.ts
```

The importer refuses to run unless the existing `great-coders-100-day-v3` snapshot contains exactly 100 tasks and 100 DSA problems. It runs in one transaction and rolls back on mapping errors. Pre-challenge wake-up records are retained by date without fabricating a challenge day.

## Current boundary

The current Node/React application still reads and writes `data/app_state.json`. These migrations are validated as a parallel import foundation; the application cutover to Spring Boot/JPA has not been completed. Do not delete or stop using the JSON store until the Spring service, API contract tests, and restart/cross-device tests pass.

## Target configuration

Use environment-provided `DATABASE_URL` (or equivalent Spring `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD`) for development, test, and production. Never commit database credentials.
