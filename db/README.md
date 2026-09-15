# PostgreSQL migration foundation

This directory contains the non-destructive PostgreSQL schema and importer for Great Coders.

## Local validation

```sh
createdb great_coders_migration_dev
psql -v ON_ERROR_STOP=1 -d great_coders_migration_dev -f db/migrations/V1__initial_schema.sql
psql -v ON_ERROR_STOP=1 -d great_coders_migration_dev -f db/migrations/V2__indexes_constraints.sql
psql -v ON_ERROR_STOP=1 -d great_coders_migration_dev -f db/migrations/V3__daily_checkins.sql
psql -v ON_ERROR_STOP=1 -d great_coders_migration_dev -f db/migrations/V4__preserve_prechallenge_checkins.sql
psql -v ON_ERROR_STOP=1 -d great_coders_migration_dev -f db/migrations/V5__daily_settlement_log.sql
psql -v ON_ERROR_STOP=1 -d great_coders_migration_dev -f db/migrations/V6__task_completion_idempotency.sql
psql -v ON_ERROR_STOP=1 -d great_coders_migration_dev -f db/migrations/V7__wake_up_checkin_idempotency.sql
psql -v ON_ERROR_STOP=1 -d great_coders_migration_dev -f db/migrations/V8__daily_activity_idempotency.sql
psql -v ON_ERROR_STOP=1 -d great_coders_migration_dev -f db/migrations/V9__participant_auth_credentials.sql
psql -v ON_ERROR_STOP=1 -d great_coders_migration_dev -f db/migrations/V10__server_sessions.sql
psql -v ON_ERROR_STOP=1 -d great_coders_migration_dev -f db/migrations/V11__oauth_transactions.sql
psql -v ON_ERROR_STOP=1 -d great_coders_migration_dev -f db/migrations/V12__change_request_external_keys.sql
DATABASE_URL=postgres://localhost/great_coders_migration_dev npx tsx scripts/import-json-to-postgres.ts
```

The importer refuses to run unless the existing `great-coders-100-day-v3` snapshot contains exactly 100 tasks and 100 DSA problems. It runs in one transaction and rolls back on mapping errors. Pre-challenge wake-up records are retained by date without fabricating a challenge day.

## Current boundary

The Node/React application uses PostgreSQL for normalized business records. The compatibility `runtime_state` table is a non-authoritative cache used by legacy routes while the remaining approval/analytics cutover is completed; it must never be treated as a backup or source of truth.

## Target configuration

Use environment-provided `DATABASE_URL` (or equivalent Spring `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD`) for development, test, and production. Never commit database credentials.
