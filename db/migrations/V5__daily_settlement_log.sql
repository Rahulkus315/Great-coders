CREATE TABLE daily_settlements (
  settlement_date DATE PRIMARY KEY,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_settlements_finalized_at ON daily_settlements(finalized_at);
