import fs from 'node:fs';
import dotenv from 'dotenv';
import { Pool, PoolClient } from 'pg';
import { generateCurriculum } from '../server/curriculumData';
import type { DailyTask, DSAProblem, StudySubject } from '../src/types';

dotenv.config();

const rawDatabaseUrl = process.env.DATABASE_URL;
const rahulPasswordHash = process.env.RAHUL_PASSWORD_HASH;
const dileepPasswordHash = process.env.DILEEP_PASSWORD_HASH;
const CHALLENGE_NAME = 'Great Coders';
const CHALLENGE_START = '2026-09-17';
const CHALLENGE_END = '2026-12-25';
const TIMEZONE = 'Asia/Kolkata';
const CURRICULUM_DAYS = 100;
const TOTAL_CHALLENGE_DAYS = 100;

const participants = [
  {
    legacyId: 'user-rahul',
    displayName: 'Rahul',
    email: 'rahulkushwaha181@gmail.com',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    targetRole: 'DSA + Java + OS + DBMS - Interview Ready Engineer',
    profile: {
      headline: 'DSA - Java OOP - OS - DBMS',
      bio: 'Building every day. Becoming a better coder.',
      skills: 'DSA - Java - Operating Systems - DBMS - Collections',
      coverTheme: 'default',
    },
  },
  {
    legacyId: 'user-dileep',
    displayName: 'Dileep',
    email: 'dileepkewat011@gmail.com',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    targetRole: 'DSA + Java + OS + DBMS - Interview Ready Engineer',
    profile: {
      headline: 'DSA - Java OOP - OS - DBMS',
      bio: 'Building every day. Becoming a better coder.',
      skills: 'DSA - Java - Operating Systems - DBMS - Collections',
      coverTheme: 'developer',
    },
  },
] as const;

const subjects = [
  ['DSA', 'DSA'],
  ['JAVA', 'Java'],
  ['OS', 'Operating Systems'],
  ['DBMS', 'DBMS'],
] as const;

type SubjectCode = (typeof subjects)[number][0];

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function json(value: unknown) {
  return JSON.stringify(value ?? null);
}

function getSubjectTopic(task: DailyTask, problem: DSAProblem, subject: SubjectCode) {
  if (subject === 'DSA') {
    return {
      title: problem.title,
      description: problem.description,
      estimatedMinutes: task.estimatedMinutes,
    };
  }

  const topic = task.studyTopics?.find(candidate => candidate.subject === subject as StudySubject);
  if (!topic) {
    throw new Error(`Missing ${subject} topic for curriculum day ${task.dayNumber}.`);
  }
  return topic;
}

async function getPreflightCounts(client: PoolClient) {
  const result = await client.query(`
    SELECT json_build_object(
      'challenges', (SELECT count(*) FROM challenges),
      'participants', (SELECT count(*) FROM participants),
      'profiles', (SELECT count(*) FROM profiles),
      'authentication_identities', (SELECT count(*) FROM authentication_identities),
      'challenge_days', (SELECT count(*) FROM challenge_days),
      'subjects', (SELECT count(*) FROM subjects),
      'curriculum_tasks', (SELECT count(*) FROM curriculum_tasks),
      'dsa_problems', (SELECT count(*) FROM dsa_problems),
      'task_completions', (SELECT count(*) FROM task_completions),
      'dsa_submissions', (SELECT count(*) FROM dsa_submissions),
      'points_ledger', (SELECT count(*) FROM points_ledger),
      'wake_up_checkins', (SELECT count(*) FROM wake_up_checkins),
      'self_control_entries', (SELECT count(*) FROM self_control_entries),
      'todays_live', (SELECT count(*) FROM todays_live),
      'holidays', (SELECT count(*) FROM holidays),
      'daily_checkins', (SELECT count(*) FROM daily_checkins),
      'auth_sessions', (SELECT count(*) FROM auth_sessions),
      'oauth_states', (SELECT count(*) FROM oauth_states),
      'oauth_bind_transactions', (SELECT count(*) FROM oauth_bind_transactions)
    ) AS counts
  `);
  return result.rows[0].counts as Record<string, number>;
}

async function main() {
  if (!rawDatabaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }
  if (!rahulPasswordHash || !dileepPasswordHash) {
    throw new Error('RAHUL_PASSWORD_HASH and DILEEP_PASSWORD_HASH are required.');
  }

  const curriculum = generateCurriculum();
  if (curriculum.tasks.length !== CURRICULUM_DAYS || curriculum.dsaProblems.length !== CURRICULUM_DAYS) {
    throw new Error('Refusing initialization: authoritative curriculum is not exactly 100 tasks and 100 DSA problems.');
  }

  const databaseUrl = new URL(rawDatabaseUrl);
  databaseUrl.searchParams.delete('sslmode');
  const connectionString = databaseUrl.toString();
  const sslRequired = process.env.PGSSLMODE === 'require' || connectionString.includes('pooler.supabase.com');
  const sslConfig = sslRequired ? (() => {
    if (process.env.SUPABASE_CA_CERT) {
      return { rejectUnauthorized: true, ca: process.env.SUPABASE_CA_CERT };
    }

    if (process.env.PGSSLROOTCERT) {
      try {
        return { rejectUnauthorized: true, ca: fs.readFileSync(process.env.PGSSLROOTCERT, 'utf8') };
      } catch {
        return { rejectUnauthorized: true };
      }
    }

    return { rejectUnauthorized: true };
  })() : undefined;
  const pool = new Pool({
    connectionString,
    ...(sslConfig ? { ssl: sslConfig } : {}),
  });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('great-coders-production-initialization-v1'))");

    const counts = await getPreflightCounts(client);
    const existingEntries = Object.entries(counts).filter(([, count]) => Number(count) > 0);
    if (existingEntries.length > 0) {
      throw new Error(`Refusing initialization: production is not empty (${existingEntries.map(([table, count]) => `${table}=${count}`).join(', ')}).`);
    }

    const challengeResult = await client.query(
      `INSERT INTO challenges (name, start_date, end_date, timezone, curriculum_days)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [CHALLENGE_NAME, CHALLENGE_START, CHALLENGE_END, TIMEZONE, CURRICULUM_DAYS]
    );
    const challengeId = challengeResult.rows[0].id as string;

    const participantIds = new Map<string, string>();
    for (const participant of participants) {
      const passwordHash = participant.legacyId === 'user-rahul' ? rahulPasswordHash : dileepPasswordHash;
      const result = await client.query(
        `INSERT INTO participants (legacy_id, display_name, email, avatar_url, target_role, password_hash, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
         RETURNING id`,
        [participant.legacyId, participant.displayName, participant.email, participant.avatarUrl, participant.targetRole, passwordHash]
      );
      const participantId = result.rows[0].id as string;
      participantIds.set(participant.legacyId, participantId);

      await client.query(
        `INSERT INTO profiles (participant_id, display_name, headline, bio, skills, avatar_url, cover_theme)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [participantId, participant.displayName, participant.profile.headline, participant.profile.bio, participant.profile.skills, participant.avatarUrl, participant.profile.coverTheme]
      );
    }

    const subjectIds = new Map<SubjectCode, string>();
    for (const [code, displayName] of subjects) {
      const result = await client.query(
        `INSERT INTO subjects (code, display_name)
         VALUES ($1, $2)
         RETURNING id`,
        [code, displayName]
      );
      subjectIds.set(code, result.rows[0].id as string);
    }

    const challengeDayIds = new Map<string, string>();
    for (let dayNumber = 1; dayNumber <= TOTAL_CHALLENGE_DAYS; dayNumber += 1) {
      const date = addDays(CHALLENGE_START, dayNumber - 1);
      const result = await client.query(
        `INSERT INTO challenge_days (challenge_id, calendar_date, curriculum_day_number, scheduled_execution_day, status, timezone)
         VALUES ($1, $2, $3, $4, 'PLANNED', $5)
         RETURNING id`,
        [challengeId, date, dayNumber <= CURRICULUM_DAYS ? dayNumber : null, dayNumber <= CURRICULUM_DAYS ? dayNumber : null, TIMEZONE]
      );
      challengeDayIds.set(date, result.rows[0].id as string);
    }

    const dsaByDay = new Map(curriculum.dsaProblems.map(problem => [problem.dayNumber, problem]));
    let curriculumTaskCount = 0;
    for (const task of curriculum.tasks) {
      const challengeDayId = challengeDayIds.get(task.date);
      const problem = dsaByDay.get(task.dayNumber);
      if (!challengeDayId || !problem) {
        throw new Error(`Missing challenge-day mapping for curriculum day ${task.dayNumber}.`);
      }

      for (const [subject] of subjects) {
        const subjectId = subjectIds.get(subject);
        if (!subjectId) throw new Error(`Missing subject mapping for ${subject}.`);
        const topic = getSubjectTopic(task, problem, subject);
        await client.query(
          `INSERT INTO curriculum_tasks (
             legacy_id, challenge_id, challenge_day_id, subject_id, title, description,
             learning_objective, estimated_minutes, difficulty, priority, category,
             badges, resources, interview_questions, study_topics
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb)`,
          [
            `${task.id}-${subject}`,
            challengeId,
            challengeDayId,
            subjectId,
            topic.title,
            topic.description,
            task.learningObjective,
            topic.estimatedMinutes,
            task.difficulty,
            task.priority,
            subject === 'JAVA' ? 'CORE_JAVA' : subject,
            json(task.badges),
            json(task.resources),
            json(task.interviewQuestions),
            json(task.studyTopics),
          ]
        );
        curriculumTaskCount += 1;
      }
    }

    for (const problem of curriculum.dsaProblems) {
      const challengeDayId = challengeDayIds.get(problem.date);
      if (!challengeDayId) throw new Error(`Missing challenge-day mapping for DSA day ${problem.dayNumber}.`);
      await client.query(
        `INSERT INTO dsa_problems (
           legacy_id, challenge_day_id, title, category, difficulty, points,
           base_problem_count, upper_tier_problems, leetcode_url, description,
           approach, time_complexity, space_complexity
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)`,
        [
          problem.id,
          challengeDayId,
          problem.title,
          problem.category,
          problem.difficulty,
          problem.points,
          problem.baseProblemCount ?? 0,
          json(problem.upperTierProblems),
          problem.leetcodeUrl ?? null,
          problem.description,
          problem.approach,
          problem.timeComplexity,
          problem.spaceComplexity,
        ]
      );
    }

    await client.query('COMMIT');
    console.log(JSON.stringify({
      success: true,
      inserted: {
        challenges: 1,
        participants: participantIds.size,
        profiles: participantIds.size,
        subjects: subjects.length,
        challengeDays: TOTAL_CHALLENGE_DAYS,
        curriculumTasks: curriculumTaskCount,
        dsaProblems: curriculum.dsaProblems.length,
        authenticationIdentities: 0,
        activityAndLedgerRecords: 0,
      },
    }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Initialization failed.');
  process.exitCode = 1;
});
