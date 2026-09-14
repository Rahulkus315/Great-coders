<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Great Coders

This application includes a production-style Google OIDC authentication flow for the Great Coders challenge experience.

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
