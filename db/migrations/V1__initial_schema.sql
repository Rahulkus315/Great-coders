CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  timezone TEXT NOT NULL,
  curriculum_days INTEGER NOT NULL CHECK (curriculum_days > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id TEXT UNIQUE,
  display_name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  target_role TEXT,
  bound_identity TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE authentication_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  email TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  participant_id UUID NOT NULL REFERENCES participants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  UNIQUE (provider, provider_subject)
);

CREATE TABLE profiles (
  participant_id UUID PRIMARY KEY REFERENCES participants(id),
  display_name TEXT NOT NULL,
  headline TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  cover_theme TEXT NOT NULL DEFAULT 'default',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE challenge_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id),
  calendar_date DATE NOT NULL,
  curriculum_day_number INTEGER CHECK (curriculum_day_number BETWEEN 1 AND 100),
  scheduled_execution_day INTEGER CHECK (scheduled_execution_day BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'ACTIVE', 'HISTORICAL', 'FUTURE', 'LOCKED')),
  timezone TEXT NOT NULL,
  UNIQUE (challenge_id, calendar_date),
  UNIQUE (challenge_id, curriculum_day_number)
);

CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code IN ('DSA', 'JAVA', 'OS', 'DBMS')),
  display_name TEXT NOT NULL UNIQUE
);

CREATE TABLE curriculum_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id TEXT NOT NULL UNIQUE,
  challenge_id UUID NOT NULL REFERENCES challenges(id),
  challenge_day_id UUID NOT NULL REFERENCES challenge_days(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  learning_objective TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes > 0),
  difficulty TEXT NOT NULL,
  priority TEXT NOT NULL,
  category TEXT NOT NULL,
  badges JSONB NOT NULL DEFAULT '[]'::jsonb,
  resources JSONB NOT NULL DEFAULT '[]'::jsonb,
  interview_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  study_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dsa_problems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id TEXT NOT NULL UNIQUE,
  challenge_day_id UUID NOT NULL REFERENCES challenge_days(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  points INTEGER NOT NULL CHECK (points >= 0),
  base_problem_count INTEGER NOT NULL CHECK (base_problem_count >= 0),
  upper_tier_problems JSONB NOT NULL DEFAULT '[]'::jsonb,
  leetcode_url TEXT,
  description TEXT NOT NULL,
  approach TEXT NOT NULL,
  time_complexity TEXT NOT NULL,
  space_complexity TEXT NOT NULL
);

CREATE TABLE task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id),
  curriculum_task_id UUID NOT NULL REFERENCES curriculum_tasks(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'COMPLETED_ON_TIME', 'COMPLETED_LATE', 'MISSED', 'REVERSED')),
  points_awarded INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 0,
  UNIQUE (participant_id, curriculum_task_id, subject_id)
);

CREATE TABLE dsa_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id),
  dsa_problem_id UUID NOT NULL REFERENCES dsa_problems(id),
  submission_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SOLVED', 'ATTEMPTED')),
  time_taken_minutes INTEGER NOT NULL CHECK (time_taken_minutes >= 0),
  notes TEXT NOT NULL DEFAULT '',
  code_snippet TEXT,
  solved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE points_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id),
  challenge_id UUID NOT NULL REFERENCES challenges(id),
  challenge_day_id UUID REFERENCES challenge_days(id),
  curriculum_task_id UUID REFERENCES curriculum_tasks(id),
  amount INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  reference_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wake_up_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id),
  challenge_day_id UUID NOT NULL REFERENCES challenge_days(id),
  status TEXT NOT NULL CHECK (status IN ('NOT_OPEN', 'OPEN', 'COMPLETED', 'MISSED')),
  checked_in_at TIMESTAMPTZ,
  points_awarded INTEGER NOT NULL DEFAULT 0 CHECK (points_awarded IN (0, 2)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participant_id, challenge_day_id)
);

CREATE TABLE self_control_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id),
  challenge_day_id UUID NOT NULL REFERENCES challenge_days(id),
  status TEXT NOT NULL CHECK (status IN ('NO_REPORT', 'REPORTED_RELAPSE', 'HOLIDAY')),
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participant_id, challenge_day_id)
);

CREATE TABLE holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id),
  challenge_id UUID NOT NULL REFERENCES challenges(id),
  challenge_day_id UUID NOT NULL REFERENCES challenge_days(id),
  holiday_number INTEGER NOT NULL CHECK (holiday_number BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('APPROVED', 'CANCELLED')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participant_id, challenge_day_id),
  UNIQUE (participant_id, challenge_id, holiday_number)
);

CREATE TABLE todays_live (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id),
  challenge_day_id UUID NOT NULL REFERENCES challenge_days(id),
  summary TEXT NOT NULL DEFAULT '',
  what_i_learned TEXT NOT NULL DEFAULT '',
  what_i_built TEXT NOT NULL DEFAULT '',
  what_i_struggled_with TEXT NOT NULL DEFAULT '',
  mistakes TEXT NOT NULL DEFAULT '',
  mistakes_lessons TEXT NOT NULL DEFAULT '',
  tomorrow_focus TEXT NOT NULL DEFAULT '',
  additional_notes TEXT NOT NULL DEFAULT '',
  study_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
  focused_execution_minutes INTEGER,
  focused_execution_finalized BOOLEAN NOT NULL DEFAULT false,
  focused_execution_finalized_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SUBMITTED', 'LOCKED')),
  version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participant_id, challenge_day_id),
  CHECK ((focused_execution_finalized = false) OR focused_execution_minutes IS NOT NULL)
);

CREATE TABLE todays_live_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  todays_live_id UUID NOT NULL REFERENCES todays_live(id),
  rater_participant_id UUID NOT NULL REFERENCES participants(id),
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (todays_live_id, rater_participant_id)
);

CREATE TABLE change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_participant_id UUID NOT NULL REFERENCES participants(id),
  target_participant_id UUID NOT NULL REFERENCES participants(id),
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  old_value JSONB,
  proposed_value JSONB,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'DECLINED', 'EXPIRED', 'APPLIED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  CHECK (requester_participant_id <> target_participant_id)
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_participant_id UUID REFERENCES participants(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_participant_id UUID NOT NULL REFERENCES participants(id),
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_preferences (
  participant_id UUID PRIMARY KEY REFERENCES participants(id),
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
