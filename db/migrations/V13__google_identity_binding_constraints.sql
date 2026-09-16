ALTER TABLE oauth_states ALTER COLUMN participant_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_authentication_identities_provider_participant
  ON authentication_identities(provider, participant_id);
