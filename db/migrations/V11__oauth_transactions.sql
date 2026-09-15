CREATE TABLE IF NOT EXISTS oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_token_hash TEXT NOT NULL UNIQUE,
  participant_id UUID NOT NULL REFERENCES participants(id),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_states(expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS oauth_bind_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_token_hash TEXT NOT NULL UNIQUE,
  participant_id UUID NOT NULL REFERENCES participants(id),
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  email TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_bind_transactions_expiry ON oauth_bind_transactions(expires_at) WHERE consumed_at IS NULL;