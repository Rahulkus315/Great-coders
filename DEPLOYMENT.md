# Great Coders Deployment

## Architecture

Deploy the existing Node/Express server and Vite frontend as one service or as a frontend proxying to the backend. The backend connects to managed PostgreSQL through the server-only `DATABASE_URL` variable.

Required production variables:

- `NODE_ENV=production`
- `PORT`
- `DATABASE_URL`
- `APP_BASE_URL`
- `APP_ORIGIN`
- `RAHUL_PASSWORD_HASH`
- `DILEEP_PASSWORD_HASH`
- `GEMINI_API_KEY` only if the AI feature is enabled

Do not put `DATABASE_URL`, password hashes, or `GEMINI_API_KEY` in frontend variables or committed files.

## Release sequence

1. Build the application with `npm ci` and `npm run build`.
2. Take a provider backup or confirm a recent point-in-time recovery point.
3. Apply versioned SQL migrations from `db/migrations/` using a migration runner or an operator-controlled release job.
4. Verify the existing participants and 100-day curriculum before starting the new application version.
5. Deploy the backend with production secrets injected by the hosting platform.
6. Configure `APP_ORIGIN`.
7. Check `/api/health` and authenticated `/api/auth/me`.
8. Perform a read-only cross-device recovery check.

## Rollback

Roll back the application image or release without deleting PostgreSQL data. Do not run seed/import scripts as part of rollback. A database rollback is a separate, reviewed migration operation and must use a provider snapshot or a tested migration-specific procedure.

## Local development

Use a separate local PostgreSQL database. Never point import or seed scripts at a production URL. Run `npm run lint`, `npm test`, and `npm run build` before release.
