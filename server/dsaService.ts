import { Pool, PoolClient } from 'pg';
import { getISTNow, calculateDayInfo } from './timeUtils';
import { ensureParticipantSchedule } from './participantScheduleService';

export class DsaServiceError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'DsaServiceError';
  }
}

async function participant(client: PoolClient, legacyId: string) {
  const result = await client.query(`SELECT id FROM participants WHERE legacy_id = $1 AND status = 'ACTIVE' FOR SHARE`, [legacyId]);
  if (!result.rowCount) throw new DsaServiceError(404, 'Authenticated participant is not present in PostgreSQL.');
  return result.rows[0].id as string;
}

export async function getDsaAttempt(pool: Pool, legacyUserId: string, problemLegacyId: string) {
  const client = await pool.connect();
  try {
    const id = await participant(client, legacyUserId);
    const result = await client.query(
      `SELECT ds.id, ds.submission_date::text AS date, ds.status, ds.time_taken_minutes AS "timeTakenMinutes", ds.notes, ds.code_snippet AS "codeSnippet", ds.solved_at AS "solvedAt"
       FROM dsa_submissions ds JOIN participants p ON p.id = ds.participant_id
       JOIN dsa_problems dp ON dp.id = ds.dsa_problem_id
       WHERE ds.participant_id = $1 AND dp.legacy_id = $2
       ORDER BY ds.solved_at DESC LIMIT 1`,
      [id, problemLegacyId]
    );
    return result.rows[0] || null;
  } finally { client.release(); }
}

export async function recordDsaAttempt(pool: Pool, legacyUserId: string, problemLegacyId: string, status: 'SOLVED' | 'ATTEMPTED', timeTakenMinutes: number, notes: string, codeSnippet?: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))", [legacyUserId, problemLegacyId]);
    const id = await participant(client, legacyUserId);
    const problem = await client.query(
      `SELECT dp.id, dp.points, dp.title, dp.challenge_day_id, cd.challenge_id,
              cd.calendar_date::text AS date, cd.curriculum_day_number AS "dayNumber"
       FROM dsa_problems dp JOIN challenge_days cd ON cd.id = dp.challenge_day_id
       WHERE dp.legacy_id = $1 FOR SHARE`,
      [problemLegacyId]
    );
    if (!problem.rowCount) throw new DsaServiceError(404, 'DSA problem not found in PostgreSQL.');
    const currentDate = calculateDayInfo().currentDate;
    await ensureParticipantSchedule(client, id, problem.rows[0].challenge_id);
    const schedule = await client.query(
      `SELECT effective_date::text AS date FROM participant_schedule_days
       WHERE participant_id=$1 AND challenge_id=$2 AND curriculum_day_number=$3`,
      [id, problem.rows[0].challenge_id, problem.rows[0].dayNumber],
    );
    const effectiveDate = schedule.rows[0]?.date as string | undefined;
    if (!effectiveDate) throw new DsaServiceError(409, 'Participant schedule is not available for this DSA problem.');
    if (effectiveDate > currentDate) {
      throw new DsaServiceError(403, 'Future DSA problems cannot be attempted early.');
    }
    let approvedLateRequestId: string | null = null;
    if (effectiveDate < currentDate) {
      const lateRequest = await client.query(
        `SELECT cr.id
         FROM change_requests cr
         WHERE cr.requester_participant_id = $1
           AND cr.target_type = 'RETROACTIVE_COMPLETION'
           AND cr.target_id = $2
           AND cr.status = 'APPROVED'
         FOR UPDATE`,
        [id, problem.rows[0].id],
      );
      if (!lateRequest.rowCount) throw new DsaServiceError(403, 'Past DSA problems require partner approval before late completion.');
      approvedLateRequestId = lateRequest.rows[0].id as string;
    }
    const existing = await client.query(`SELECT status FROM dsa_submissions WHERE participant_id = $1 AND dsa_problem_id = $2 ORDER BY solved_at DESC LIMIT 1 FOR UPDATE`, [id, problem.rows[0].id]);
    const wasSolved = existing.rowCount && existing.rows[0].status === 'SOLVED';
    const nowIso = getISTNow().toISOString();
    const submission = await client.query(
      `INSERT INTO dsa_submissions (participant_id, dsa_problem_id, submission_date, status, time_taken_minutes, notes, code_snippet, solved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, submission_date::text AS date, status, time_taken_minutes AS "timeTakenMinutes", notes, code_snippet AS "codeSnippet", solved_at AS "solvedAt"`,
      [id, problem.rows[0].id, currentDate, status, Math.max(0, Number(timeTakenMinutes) || 0), notes || '', codeSnippet || null, nowIso]
    );
    let pointsAwarded = 0;
    if (status === 'SOLVED' && !wasSolved) {
      pointsAwarded = approvedLateRequestId ? 1 : Number(problem.rows[0].points);
      await client.query(
        `INSERT INTO points_ledger (participant_id, challenge_id, challenge_day_id, amount, event_type, reason, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [id, problem.rows[0].challenge_id, problem.rows[0].challenge_day_id, pointsAwarded, approvedLateRequestId ? 'TASK_COMPLETED_LATE' : 'DSA_COMPLETED', `Solved DSA Problem: ${problem.rows[0].title} (+${pointsAwarded} pts)`, JSON.stringify({ sourceProblemId: problemLegacyId, section: 'DSA' }), nowIso]
      );
      if (approvedLateRequestId) {
        await client.query(`UPDATE change_requests SET status='APPLIED', applied_at=$2 WHERE id=$1 AND status='APPROVED'`, [approvedLateRequestId, nowIso]);
      }
    }
    await client.query('COMMIT');
    return { attempt: submission.rows[0], pointsAwarded };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
