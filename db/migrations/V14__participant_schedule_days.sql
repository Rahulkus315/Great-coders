CREATE TABLE IF NOT EXISTS participant_schedule_days (
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  curriculum_day_number INTEGER NOT NULL,
  effective_date DATE NOT NULL,
  source_challenge_day_id UUID NOT NULL REFERENCES challenge_days(id),
  challenge_day_id UUID REFERENCES challenge_days(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (participant_id, challenge_id, curriculum_day_number)
);

ALTER TABLE participant_schedule_days ADD COLUMN IF NOT EXISTS effective_date DATE;
ALTER TABLE participant_schedule_days ADD COLUMN IF NOT EXISTS source_challenge_day_id UUID;
ALTER TABLE participant_schedule_days ADD COLUMN IF NOT EXISTS challenge_day_id UUID;
UPDATE participant_schedule_days psd
SET effective_date = COALESCE(psd.effective_date, cd.calendar_date),
  source_challenge_day_id = COALESCE(psd.source_challenge_day_id, psd.challenge_day_id),
  challenge_day_id = COALESCE(psd.challenge_day_id, psd.source_challenge_day_id)
FROM challenge_days cd
WHERE cd.id = COALESCE(psd.source_challenge_day_id, psd.challenge_day_id);

CREATE INDEX IF NOT EXISTS idx_participant_schedule_days_lookup
  ON participant_schedule_days(participant_id, challenge_id, effective_date);