# Great Coders Security Notes

- PostgreSQL is server-only and configured with `DATABASE_URL`.
- Authenticated sessions use opaque random tokens stored as SHA-256 hashes in `auth_sessions`.
- The legacy participant-ID cookie is ignored for authentication.
- Google OIDC validates the ID token and uses the stable `sub` claim.
- OAuth state and first-bind transactions are stored server-side with expiry and single-use consumption.
- Participant identity is derived from the authenticated session on protected APIs.
- Points are calculated by backend services and written to the PostgreSQL ledger.
- Sensitive self-control notes/history are not returned as partner data.
- Production must use HTTPS, secure cookies, restricted `APP_ORIGIN`, provider-managed secrets, and rate limiting at the edge.
- Do not log passwords, OAuth tokens, database URLs, session tokens, or private journal/self-control content.

The repository cannot verify managed-provider network policy, WAF/rate limiting, backup configuration, or secret rotation. Those require deployment-console verification.
