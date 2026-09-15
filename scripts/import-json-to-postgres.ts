import { readFile } from 'node:fs/promises';
import { Pool, PoolClient } from 'pg';

type JsonState = any;
type SubjectCode = 'DSA' | 'JAVA' | 'OS' | 'DBMS';
const subjects: Array<[SubjectCode, string]> = [
  ['DSA', 'DSA'],
  ['JAVA', 'Java'],
  ['OS', 'Operating Systems'],
  ['DBMS', 'DBMS'],
];

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing JSON import while NODE_ENV=production. Use an explicitly reviewed migration process against a non-production database.');
}

const db = process.env.DATABASE_URL || 'postgres://localhost/great_coders_migration_dev';
const challengeStart = '2026-09-15';
const challengeEnd = '2026-12-31';
const timezone = 'Asia/Kolkata';

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function json(value: unknown) {
  return JSON.stringify(value ?? null);
}

async function one(client: PoolClient, sql: string, values: unknown[] = []) {
  const result = await client.query(sql, values);
  return result.rows[0];
}

async function main() {
  const state = JSON.parse(await readFile('data/app_state.json', 'utf8')) as JsonState;
  if (state.tasks?.length !== 100 || state.dsaProblems?.length !== 100 || state.curriculumVersion !== 'great-coders-100-day-v3') {
    throw new Error('Refusing migration: expected the intact 100-day curriculum snapshot.');
  }

  const pool = new Pool({ connectionString: db });
  const client = await pool.connect();
  const participants = new Map<string, string>();
  const challengeDays = new Map<string, string>();
  const subjectIds = new Map<SubjectCode, string>();
  const taskIds = new Map<string, string>();
  const dsaIds = new Map<string, string>();

  try {
    await client.query('BEGIN');
    const challenge = await one(client, `INSERT INTO challenges (name, start_date, end_date, timezone, curriculum_days)
      VALUES ('Great Coders', $1, $2, $3, 100) ON CONFLICT (name) DO UPDATE SET updated_at = now() RETURNING id`, [challengeStart, challengeEnd, timezone]);

    for (const participant of state.users) {
      const row = await one(client, `INSERT INTO participants (legacy_id, display_name, email, avatar_url, target_role, bound_identity, password_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (legacy_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now() RETURNING id`,
        [participant.id, participant.name, participant.email, participant.avatar, participant.targetRole, participant.boundIdentity, participant.passwordHash]);
      participants.set(participant.id, row.id);
      const profile = state.profiles?.[participant.id];
      if (profile) await client.query(`INSERT INTO profiles (participant_id, display_name, headline, bio, skills, avatar_url, cover_theme)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (participant_id) DO UPDATE SET display_name=EXCLUDED.display_name, headline=EXCLUDED.headline, bio=EXCLUDED.bio, skills=EXCLUDED.skills, avatar_url=EXCLUDED.avatar_url, cover_theme=EXCLUDED.cover_theme, updated_at=now()`,
        [row.id, profile.displayName, profile.headline, profile.bio, profile.skills, profile.avatarUrl, profile.coverTheme]);
    }

    for (const identity of state.authIdentities || []) {
      const participantId = participants.get(identity.participantId);
      if (!participantId) throw new Error(`Missing participant for identity ${identity.id}`);
      await client.query(`INSERT INTO authentication_identities (provider, provider_subject, email, email_verified, participant_id, created_at, last_login_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (provider, provider_subject) DO NOTHING`,
        [identity.provider, identity.providerSubject, identity.email, identity.emailVerified, participantId, identity.createdAt, identity.lastLoginAt]);
    }

    for (const [code, displayName] of subjects) {
      const row = await one(client, `INSERT INTO subjects (code, display_name) VALUES ($1,$2) ON CONFLICT (code) DO UPDATE SET display_name=EXCLUDED.display_name RETURNING id`, [code, displayName]);
      subjectIds.set(code, row.id);
    }

    for (let day = 1; day <= 108; day += 1) {
      const date = addDays(challengeStart, day - 1);
      const row = await one(client, `INSERT INTO challenge_days (challenge_id, calendar_date, curriculum_day_number, scheduled_execution_day, status, timezone)
        VALUES ($1,$2,$3,$3,$4,$5) ON CONFLICT (challenge_id, calendar_date) DO UPDATE SET status=EXCLUDED.status RETURNING id`,
        [challenge.id, date, day <= 100 ? day : null, day <= 100 ? 'PLANNED' : 'PLANNED', timezone]);
      challengeDays.set(date, row.id);
    }

    for (const task of state.tasks) {
      const dayId = challengeDays.get(task.date);
      if (!dayId) throw new Error(`Missing challenge day for ${task.date}`);
      const dsa = state.dsaProblems.find((item: any) => item.dayNumber === task.dayNumber);
      for (const [code] of subjects) {
        const topic = code === 'DSA' ? { title: dsa.title, description: dsa.description, estimatedMinutes: task.estimatedMinutes } : task.studyTopics?.find((item: any) => item.subject === code);
        if (!topic) throw new Error(`Missing ${code} topic for curriculum day ${task.dayNumber}`);
        const row = await one(client, `INSERT INTO curriculum_tasks (legacy_id, challenge_id, challenge_day_id, subject_id, title, description, learning_objective, estimated_minutes, difficulty, priority, category, badges, resources, interview_questions, study_topics)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb)
          ON CONFLICT (legacy_id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description RETURNING id`,
          [`${task.id}-${code}`, challenge.id, dayId, subjectIds.get(code), topic.title, topic.description, task.learningObjective, topic.estimatedMinutes, task.difficulty, task.priority, task.category, json(task.badges), json(task.resources), json(task.interviewQuestions), json(task.studyTopics)]);
        taskIds.set(`${task.id}-${code}`, row.id);
      }
    }

    for (const problem of state.dsaProblems) {
      const row = await one(client, `INSERT INTO dsa_problems (legacy_id, challenge_day_id, title, category, difficulty, points, base_problem_count, upper_tier_problems, leetcode_url, description, approach, time_complexity, space_complexity)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13) ON CONFLICT (legacy_id) DO UPDATE SET title=EXCLUDED.title RETURNING id`,
        [`${problem.id}`, challengeDays.get(problem.date), problem.title, problem.category, problem.difficulty, problem.points, problem.baseProblemCount, json(problem.upperTierProblems), problem.leetcodeUrl, problem.description, problem.approach, problem.timeComplexity, problem.spaceComplexity]);
      dsaIds.set(problem.id, row.id);
    }

    for (const status of state.scheduleSectionStatuses || []) {
      const participantId = participants.get(status.userId);
      const taskId = taskIds.get(`${status.taskId}-${status.section}`);
      const subjectId = subjectIds.get(status.section as SubjectCode);
      if (!participantId || !taskId || !subjectId) throw new Error(`Cannot map section completion ${status.taskId}:${status.section}`);
      await client.query(`INSERT INTO task_completions (participant_id, curriculum_task_id, subject_id, status, points_awarded, completed_at)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (participant_id, curriculum_task_id, subject_id) DO UPDATE SET status=EXCLUDED.status, points_awarded=EXCLUDED.points_awarded, completed_at=EXCLUDED.completed_at`,
        [participantId, taskId, subjectId, status.status, status.pointsAwarded, status.completedAt || null]);
    }

    for (const entry of state.pointLedger || []) {
      const participantId = participants.get(entry.userId);
      if (!participantId) throw new Error(`Cannot map ledger participant ${entry.userId}`);
      const dayId = challengeDays.get(entry.date);
      await client.query(`INSERT INTO points_ledger (participant_id, challenge_id, challenge_day_id, amount, event_type, reason, metadata, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`, [participantId, challenge.id, dayId || null, entry.points, entry.eventType, entry.reason, json(entry.metadata), entry.timestamp]);
    }

    for (const checkin of state.morningCheckins || []) {
      const participantId = participants.get(checkin.userId);
      const dayId = challengeDays.get(checkin.date);
      await client.query(`INSERT INTO wake_up_checkins (participant_id, challenge_day_id, checkin_date, status, checked_in_at, points_awarded)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (participant_id, checkin_date) DO UPDATE SET status=EXCLUDED.status, checked_in_at=EXCLUDED.checked_in_at, points_awarded=EXCLUDED.points_awarded`,
        [participantId, dayId || null, checkin.date, checkin.status === 'CHECKED_IN' ? 'COMPLETED' : checkin.status, checkin.checkedInAt || null, checkin.points || 0]);
    }

    for (const entry of state.habits || []) {
      const participantId = participants.get(entry.userId);
      const dayId = challengeDays.get(entry.date);
      await client.query(`INSERT INTO self_control_entries (participant_id, challenge_day_id, status, notes, recorded_at)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (participant_id, challenge_day_id) DO UPDATE SET status=EXCLUDED.status, notes=EXCLUDED.notes, recorded_at=EXCLUDED.recorded_at`, [participantId, dayId, entry.status, entry.notes || null, entry.recordedAt]);
    }

    for (const entry of state.dailyCheckins || []) {
      const participantId = participants.get(entry.userId);
      const dayId = challengeDays.get(entry.date);
      await client.query(`INSERT INTO daily_checkins (participant_id, challenge_day_id, checkin_date, checked_in_at, time_text, streak_day, coins_awarded, bonus_awarded, bonus_points)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (participant_id, checkin_date) DO NOTHING`, [participantId, dayId, entry.date, entry.checkedInAt, entry.timeStr, entry.streakDay, entry.coinsAwarded, entry.bonusAwarded || false, entry.bonusPoints || 0]);
    }

    for (const entry of state.journals || []) {
      const participantId = participants.get(entry.userId);
      const dayId = challengeDays.get(entry.date);
      if (!dayId) continue;
      await client.query(`INSERT INTO todays_live (participant_id, challenge_day_id, summary, what_i_learned, what_i_built, what_i_struggled_with, mistakes, mistakes_lessons, tomorrow_focus, additional_notes, study_hours, focused_execution_minutes, focused_execution_finalized, focused_execution_finalized_at, status, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)
        ON CONFLICT (participant_id, challenge_day_id) DO NOTHING`, [participantId, dayId, entry.summary || entry.todayRoutine || '', entry.whatILearned, entry.whatIBuilt, entry.whatIStruggledWith, entry.mistakes, entry.mistakesLessons || '', entry.tomorrowFocus || entry.tomorrowImprovements || '', entry.additionalNotes || '', entry.studyHours || 0, entry.focusedExecutionMinutes || null, !!entry.focusedExecutionFinalized, entry.focusedExecutionFinalizedAt || null, entry.status || 'OPEN', entry.updatedAt || new Date().toISOString()]);
    }

    for (const entry of state.notifications || []) {
      const participantId = participants.get(entry.userId);
      await client.query(`INSERT INTO notifications (recipient_participant_id, notification_type, title, message, data, read_at, created_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`, [participantId, entry.type, entry.title, entry.message, json(entry), entry.read ? entry.createdAt : null, entry.createdAt]);
    }

    for (const entry of state.auditLogs || []) {
      const actorId = participants.get(entry.actorId);
      await client.query(`INSERT INTO audit_logs (actor_participant_id, action, entity_type, entity_id, reason, new_value, created_at) VALUES ($1,$2,$3,NULL,$4,$5::jsonb,$6)`, [actorId || null, entry.action, entry.targetType, entry.reason, json({ legacyTargetId: entry.targetId }), entry.timestamp]);
    }

    await client.query('COMMIT');
    console.log(JSON.stringify({ success: true, database: db, participants: participants.size, curriculumTasks: taskIds.size, dsaProblems: dsaIds.size }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
