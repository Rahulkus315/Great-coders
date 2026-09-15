# Isolated PostgreSQL Integration Tests

The PostgreSQL integration tests are intentionally opt-in and never use the application `DATABASE_URL` fallback.

Required variables:

```bash
export PHASE2D_DATABASE_URL='postgres://test_user:test_password@127.0.0.1:5432/great_coders_phase2d'
export PHASE2E_DATABASE_URL='postgres://test_user:test_password@127.0.0.1:5432/great_coders_phase2e'
```

Each database must be disposable and must not contain production data. Apply all migrations before running tests:

```bash
for migration in db/migrations/*.sql; do
  psql "$PHASE2D_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done
for migration in db/migrations/*.sql; do
  psql "$PHASE2E_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done
```

The test fixtures delete only their own dedicated test rows. Never set either variable to a production or shared development database.

Run:

```bash
npx tsc --noEmit
PHASE2D_DATABASE_URL="$PHASE2D_DATABASE_URL" PHASE2E_DATABASE_URL="$PHASE2E_DATABASE_URL" npm test
```

Current environment status: the dedicated variables are not configured, so the two PostgreSQL integration suites remain skipped. No production data was used.
