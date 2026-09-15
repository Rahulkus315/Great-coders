ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS external_target_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_change_requests_external_id ON change_requests(external_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_external_target ON change_requests(external_target_id, status);
