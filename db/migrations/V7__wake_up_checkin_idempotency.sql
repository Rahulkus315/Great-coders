CREATE UNIQUE INDEX uq_morning_checkin_reward
  ON points_ledger (participant_id, challenge_day_id, event_type)
  WHERE event_type = 'MORNING_CHECKIN_SUCCESS';
