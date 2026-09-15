# Production Database Checklist

This repository cannot inspect managed-provider settings. Complete and retain evidence for each item in the provider console.

- [ ] Managed PostgreSQL instance is separate from development and test databases.
- [ ] `DATABASE_URL` is stored as a deployment secret, not committed or exposed to the browser.
- [ ] Automated daily backups are enabled.
- [ ] Point-in-time recovery is enabled where supported.
- [ ] Backup retention meets the required recovery objective.
- [ ] Backups are stored in provider-managed isolated storage or a separate account/project.
- [ ] High-availability/failover settings are enabled where required.
- [ ] Network access is restricted to the backend deployment.
- [ ] TLS is required for database connections when supported by the provider.
- [ ] A restore has been performed into a separate non-production database.
- [ ] Restore verification checked participants, challenge dates, curriculum, ledger totals, Today’s Live, and audit rows.
- [ ] Recovery owner and escalation contact are documented.
- [ ] Production migrations are applied by an explicit release step and are not run by destructive application startup code.

Status from this repository: NOT VERIFIABLE FROM CODEBASE.
