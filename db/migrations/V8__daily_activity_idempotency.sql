CREATE UNIQUE INDEX uq_daily_checkin_reward
  ON points_ledger (participant_id, challenge_day_id, event_type)
  WHERE event_type IN ('DAILY_CHECKIN', 'CHECKIN_STREAK_7_BONUS');

CREATE UNIQUE INDEX uq_leave_reward
  ON points_ledger (participant_id, challenge_day_id, event_type)
  WHERE event_type = 'LEAVE_HOLIDAY_APPLIED';
