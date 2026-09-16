CREATE TABLE IF NOT EXISTS challenge_participants (
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, participant_id)
);

INSERT INTO challenge_participants (challenge_id, participant_id)
SELECT c.id, p.id
FROM challenges c
JOIN participants p ON p.legacy_id IN ('user-rahul', 'user-dileep') AND p.status = 'ACTIVE'
WHERE c.name = 'Great Coders'
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_challenge_participants_participant
  ON challenge_participants(participant_id, challenge_id);
