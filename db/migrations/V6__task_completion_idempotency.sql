CREATE UNIQUE INDEX uq_task_completion_reward
  ON points_ledger (participant_id, curriculum_task_id, (metadata->>'section'), event_type)
  WHERE event_type IN ('TASK_COMPLETED_ON_TIME', 'TASK_COMPLETED_LATE');

CREATE UNIQUE INDEX uq_task_reversal_reward
  ON points_ledger (participant_id, curriculum_task_id, (metadata->>'reversalOf'), event_type)
  WHERE event_type = 'TASK_REVERSED';
