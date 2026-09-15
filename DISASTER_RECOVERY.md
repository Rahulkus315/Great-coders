# Disaster Recovery

## Recovery objective

Restore the managed PostgreSQL database first, then deploy a compatible application release. Application rollback must never delete or reset the database.

## Procedure

1. Declare the incident and stop writes if corruption is suspected.
2. Identify the latest known-good backup or point-in-time recovery timestamp.
3. Restore into a separate recovery instance.
4. Run read-only reconciliation checks for participants, authentication identities, challenge dates, 100-day curriculum, task completions, points ledger, DSA submissions, Today’s Live, self-control, check-ins, holidays, ratings, approvals, notifications, audit logs, and settlements.
5. Obtain application-owner approval before promoting the recovery instance.
6. Update the deployment secret for `DATABASE_URL`.
7. Restart the backend and verify `/api/health`, authentication, and cross-device recovery.
8. Preserve the damaged database and logs for investigation.

## Required provider verification

Backup frequency, retention, point-in-time recovery, isolated storage, and restore test status are NOT VERIFIABLE FROM CODEBASE. Complete [PRODUCTION_DATABASE_CHECKLIST.md](PRODUCTION_DATABASE_CHECKLIST.md) in the managed database provider.

## Data safety rules

Never use `TRUNCATE`, `DROP`, reset, seed, or import scripts during incident recovery. Never restore over the only surviving production copy. Keep application and database rollback decisions separate.
