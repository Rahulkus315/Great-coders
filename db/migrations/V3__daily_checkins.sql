CREATE TABLE daily_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id),
  challenge_day_id UUID REFERENCES challenge_days(id),
  checkin_date DATE NOT NULL,
  checked_in_at TIMESTAMPTZ NOT NULL,
  time_text TEXT NOT NULL,
  streak_day INTEGER NOT NULL CHECK (streak_day >= 1),
  coins_awarded INTEGER NOT NULL CHECK (coins_awarded >= 0),
  bonus_awarded BOOLEAN NOT NULL DEFAULT false,
  bonus_points INTEGER NOT NULL DEFAULT 0 CHECK (bonus_points >= 0),
  UNIQUE (participant_id, checkin_date)
);

CREATE INDEX idx_daily_checkins_participant_date ON daily_checkins(participant_id, checkin_date);
