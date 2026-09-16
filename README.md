
# Great Coders

This application is a Node/Express + React application backed by PostgreSQL. PostgreSQL is the authoritative store for participant progress and competition records; browser storage is not required for recovery on another device.

## Local development

1. Install dependencies:
   `npm install`
2. Copy the example environment file:
   `cp .env.example .env`
3. Set local PostgreSQL connection settings and bcrypt password hashes:
   - `DATABASE_URL`
   - `RAHUL_PASSWORD_HASH`
   - `DILEEP_PASSWORD_HASH`
4. Run the app:
   `npm run dev`

For production deployment and recovery controls, see [DEPLOYMENT.md](DEPLOYMENT.md), [PRODUCTION_DATABASE_CHECKLIST.md](PRODUCTION_DATABASE_CHECKLIST.md), and [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md).

## Environment variables

Example values:

```
RAHUL_PASSWORD_HASH=replace-with-bcrypt-hash
DILEEP_PASSWORD_HASH=replace-with-bcrypt-hash
```

## Security rules

- Login verifies bcrypt password hashes stored on the existing PostgreSQL participant records.
- Production uses an opaque PostgreSQL-backed session token; a participant ID alone is never an authentication credential.
- Protected APIs derive participant identity only from that server-side session.
- Run database migrations explicitly before deploying application code. The application does not drop or recreate competition tables at startup.
