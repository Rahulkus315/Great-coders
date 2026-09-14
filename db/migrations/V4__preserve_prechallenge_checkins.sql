ALTER TABLE wake_up_checkins ALTER COLUMN challenge_day_id DROP NOT NULL;
ALTER TABLE wake_up_checkins ADD COLUMN IF NOT EXISTS checkin_date DATE;
UPDATE wake_up_checkins w SET checkin_date = d.calendar_date
FROM challenge_days d WHERE w.challenge_day_id = d.id AND w.checkin_date IS NULL;
ALTER TABLE wake_up_checkins ALTER COLUMN checkin_date SET NOT NULL;
CREATE UNIQUE INDEX uq_wake_up_checkins_participant_date ON wake_up_checkins(participant_id, checkin_date);
