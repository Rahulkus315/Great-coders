
<<<<<<< HEAD
=======
# Great Coders

This application is a Node/Express + React application backed by PostgreSQL. PostgreSQL is the authoritative store for participant progress and competition records; browser storage is not required for recovery on another device.

## Local development

1. Install dependencies:
   `npm install`
2. Copy the example environment file:
   `cp .env.example .env`
3. Fill in your Google OAuth values:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI`
   - `VITE_GOOGLE_CLIENT_ID`
4. Run the app:
   `npm run dev`

For production deployment and recovery controls, see [DEPLOYMENT.md](DEPLOYMENT.md), [PRODUCTION_DATABASE_CHECKLIST.md](PRODUCTION_DATABASE_CHECKLIST.md), and [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md).

## Google OAuth setup

1. Create or select a Google Cloud project.
2. Enable the Google Identity Services / OAuth 2.0 credentials.
3. Configure the OAuth consent screen with the required app information.
4. Create OAuth 2.0 Client ID credentials.
5. Add your authorized JavaScript origins, for example:
   - `http://localhost:5173`
   - `http://localhost:3000`
   - `https://your-production-domain.com`
6. Add authorized redirect URIs, for example:
   - `http://localhost:3000/api/auth/google/callback`
   - `https://your-production-domain.com/api/auth/google/callback`
7. Store secrets in environment variables and never commit them to source control.

## Environment variables

Example values:

```
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

## Security rules

- The backend validates the Google `id_token` using Google’s official OAuth/OIDC verification.
- The Google `sub` claim is the permanent external identity key.
- Email address changes do not rebind the participant.
- Participant binding is immutable after confirmation.
- Challenge registration is closed once both participant slots are occupied.
- Production uses an opaque PostgreSQL-backed session token; a participant ID alone is never an authentication credential.
- Run database migrations explicitly before deploying application code. The application does not drop or recreate competition tables at startup.
>>>>>>> a1d04dc (fix all the errors and deployed)
