import dotenv from 'dotenv';
import { Pool, PoolClient } from 'pg';
import { generateCurriculum } from '../server/curriculumData';

dotenv.config({ path: '.env', override: true, quiet: true });

const START = '2026-09-17';
const END = '2026-12-25';
const DAYS = 100;
const TIMEZONE = 'Asia/Kolkata';
const SUBJECTS = ['DSA', 'JAVA', 'OS', 'DBMS'] as const;

function addDays(start: string, offset: number) {
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function json(value: unknown) {
  return JSON.stringify(value ?? null);
}

function subjectTopic(task: any, problem: any, subject: typeof SUBJECTS[number]) {
  if (subject === 'DSA') return { title: problem.title, description: problem.description, minutes: task.estimatedMinutes };
  const topic = task.studyTopics?.find((item: any) => item.subject === subject);
  return { title: topic?.title || `${subject} study topic`, description: topic?.description || task.description, minutes: topic?.estimatedMinutes || task.estimatedMinutes };
}

async function ensureSchema(client: PoolClient) {
  await client.query(`CREATE TABLE IF NOT EXISTS challenge_participants (
    challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (challenge_id, participant_id)
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS participant_schedule_days (
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    curriculum_day_number INTEGER NOT NULL,
    effective_date DATE NOT NULL,
    source_challenge_day_id UUID NOT NULL REFERENCES challenge_days(id),
    challenge_day_id UUID REFERENCES challenge_days(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (participant_id, challenge_id, curriculum_day_number)
  )`);
}

async function main() {
  const raw = process.env.DATABASE_URL || '';
  if (process.env.LOCAL_CHALLENGE_RESET_CONFIRM !== 'YES') throw new Error('Refusing reset. Set LOCAL_CHALLENGE_RESET_CONFIRM=YES explicitly.');
  if (!raw) throw new Error('DATABASE_URL is required.');
  const url = new URL(raw);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) throw new Error(`Refusing reset: database host is not local (${url.hostname}).`);
  if (/supabase|amazonaws|azure|render|neon/i.test(url.hostname)) throw new Error('Refusing reset: production-like database host.');

  const curriculum = generateCurriculum();
  if (curriculum.tasks.length !== DAYS || curriculum.dsaProblems.length !== DAYS) throw new Error('Curriculum must contain exactly 100 tasks and 100 DSA problems.');
  if (addDays(START, DAYS - 1) !== END) throw new Error(`Date boundary mismatch: ${addDays(START, DAYS - 1)} !== ${END}`);

  const pool = new Pool({ connectionString: raw });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('great-coders-local-reset-v2'))");
    await ensureSchema(client);

    const oldChallenge = (await client.query(`SELECT id FROM challenges WHERE name = 'Great Coders' ORDER BY created_at DESC LIMIT 1`)).rows[0];
    if (oldChallenge) {
      const id = oldChallenge.id;
      await client.query(`DELETE FROM todays_live_ratings WHERE todays_live_id IN (SELECT id FROM todays_live WHERE challenge_day_id IN (SELECT id FROM challenge_days WHERE challenge_id=$1))`, [id]);
      await client.query(`DELETE FROM dsa_submissions WHERE dsa_problem_id IN (SELECT id FROM dsa_problems WHERE challenge_day_id IN (SELECT id FROM challenge_days WHERE challenge_id=$1))`, [id]);
      await client.query(`DELETE FROM task_completions WHERE curriculum_task_id IN (SELECT id FROM curriculum_tasks WHERE challenge_id=$1)`, [id]);
      await client.query(`DELETE FROM points_ledger WHERE challenge_id=$1 OR challenge_day_id IN (SELECT id FROM challenge_days WHERE challenge_id=$1)`, [id]);
      await client.query(`DELETE FROM change_requests`);
      await client.query(`DELETE FROM audit_logs`);
      await client.query(`DELETE FROM notifications`);
      await client.query(`DELETE FROM daily_checkins WHERE challenge_day_id IN (SELECT id FROM challenge_days WHERE challenge_id=$1)`, [id]);
      await client.query(`DELETE FROM wake_up_checkins WHERE challenge_day_id IN (SELECT id FROM challenge_days WHERE challenge_id=$1)`, [id]);
      await client.query(`DELETE FROM self_control_entries WHERE challenge_day_id IN (SELECT id FROM challenge_days WHERE challenge_id=$1)`, [id]);
      await client.query(`DELETE FROM todays_live WHERE challenge_day_id IN (SELECT id FROM challenge_days WHERE challenge_id=$1)`, [id]);
      await client.query(`DELETE FROM daily_settlements WHERE settlement_date IN (SELECT calendar_date FROM challenge_days WHERE challenge_id=$1)`, [id]);
      await client.query(`DELETE FROM holidays WHERE challenge_id=$1`, [id]);
      await client.query(`DELETE FROM participant_schedule_days WHERE challenge_id=$1`, [id]);
      await client.query(`DELETE FROM challenge_participants WHERE challenge_id=$1`, [id]);
      await client.query(`DELETE FROM dsa_problems WHERE challenge_day_id IN (SELECT id FROM challenge_days WHERE challenge_id=$1)`, [id]);
      await client.query(`DELETE FROM curriculum_tasks WHERE challenge_id=$1`, [id]);
      await client.query(`DELETE FROM challenge_days WHERE challenge_id=$1`, [id]);
      await client.query(`DELETE FROM challenges WHERE id=$1`, [id]);
    }

    const challenge = (await client.query(`INSERT INTO challenges (name,start_date,end_date,timezone,curriculum_days) VALUES ('Great Coders',$1,$2,$3,$4) RETURNING id`, [START, END, TIMEZONE, DAYS])).rows[0];
    const challengeId = challenge.id as string;
    const participants = (await client.query(`SELECT id FROM participants WHERE legacy_id IN ('user-rahul','user-dileep') AND status='ACTIVE'`)).rows;
    if (participants.length !== 2) throw new Error('Expected both active participant accounts.');
    for (const participant of participants) await client.query(`INSERT INTO challenge_participants (challenge_id,participant_id) VALUES ($1,$2)`, [challengeId, participant.id]);

    const subjectIds = new Map<string, string>();
    for (const code of SUBJECTS) subjectIds.set(code, (await client.query(`SELECT id FROM subjects WHERE code=$1`, [code])).rows[0].id);
    const dayIds = new Map<number, string>();
    for (let day = 1; day <= DAYS; day += 1) {
      const row = (await client.query(`INSERT INTO challenge_days (challenge_id,calendar_date,curriculum_day_number,scheduled_execution_day,status,timezone) VALUES ($1,$2,$3,$3,'PLANNED',$4) RETURNING id`, [challengeId, addDays(START, day - 1), day, TIMEZONE])).rows[0];
      dayIds.set(day, row.id);
    }
    for (const task of curriculum.tasks) {
      const problem = curriculum.dsaProblems.find(item => item.dayNumber === task.dayNumber)!;
      for (const subject of SUBJECTS) {
        const topic = subjectTopic(task, problem, subject);
        await client.query(`INSERT INTO curriculum_tasks (legacy_id,challenge_id,challenge_day_id,subject_id,title,description,learning_objective,estimated_minutes,difficulty,priority,category,badges,resources,interview_questions,study_topics) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb)`, [`${task.id}-${subject}`, challengeId, dayIds.get(task.dayNumber), subjectIds.get(subject), topic.title, topic.description, task.learningObjective, topic.minutes, task.difficulty, task.priority, subject === 'JAVA' ? 'CORE_JAVA' : subject, json(task.badges), json(task.resources), json(task.interviewQuestions), json(task.studyTopics)]);
      }
    }
    for (const problem of curriculum.dsaProblems) await client.query(`INSERT INTO dsa_problems (legacy_id,challenge_day_id,title,category,difficulty,points,base_problem_count,upper_tier_problems,leetcode_url,description,approach,time_complexity,space_complexity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13)`, [problem.id, dayIds.get(problem.dayNumber), problem.title, problem.category, problem.difficulty, problem.points, problem.baseProblemCount ?? 0, json(problem.upperTierProblems), problem.leetcodeUrl ?? null, problem.description, problem.approach, problem.timeComplexity, problem.spaceComplexity]);
    for (const participant of participants) await client.query(`INSERT INTO participant_schedule_days (participant_id,challenge_id,curriculum_day_number,effective_date,source_challenge_day_id,challenge_day_id) SELECT $1,$2,curriculum_day_number,calendar_date,id,id FROM challenge_days WHERE challenge_id=$2`, [participant.id, challengeId]);

    await client.query('COMMIT');
    console.log(JSON.stringify({ success: true, environment: { host: url.hostname, database: url.pathname.slice(1), productionLike: false }, challenge: { id: challengeId, name: 'Great Coders', start: START, end: END, days: DAYS, day1: addDays(START, 0), day100: addDays(START, DAYS - 1) }, preservedParticipants: participants.length }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
