import { Pool, PoolClient } from 'pg';
import { calculateDayInfo, getISTNow } from './timeUtils';
import { ensureParticipantSchedule } from './participantScheduleService';

export type TaskSection = 'DSA' | 'JAVA' | 'OS' | 'DBMS';

const SECTION_POINTS: Record<TaskSection, number> = {
  DSA: 3,
  JAVA: 2,
  OS: 1,
  DBMS: 1,
};
const LATE_POINTS = 1;

export class TaskCompletionError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'TaskCompletionError';
  }
}

interface TaskRow {
  id: string;
  legacy_id: string;
  challenge_id: string;
  challenge_day_id: string;
  subject_id: string;
  title: string;
  category: string;
  calendar_date: string;
}

interface CompletionResult {
  section: string;
  status: 'COMPLETED_ON_TIME' | 'COMPLETED_LATE';
  pointsAwarded: number;
  newTotal: number;
}

interface UndoResult {
  section: string;
  pointsReversed: number;
  newTotal: number;
}

function normalizeSection(section: string): TaskSection {
  const normalized = section.toUpperCase() as TaskSection;
  if (!Object.hasOwn(SECTION_POINTS, normalized)) {
    throw new TaskCompletionError(400, 'Invalid Daily Schedule section.');
  }
  return normalized;
}

async function resolveParticipant(client: PoolClient, legacyUserId: string) {
  const result = await client.query(
    `SELECT id FROM participants WHERE legacy_id = $1 AND status = 'ACTIVE' FOR SHARE`,
    [legacyUserId]
  );
  if (result.rowCount === 0) {
    throw new TaskCompletionError(404, 'Authenticated participant is not present in PostgreSQL.');
  }
  return result.rows[0].id as string;
}

async function resolveTask(client: PoolClient, taskId: string, section: TaskSection): Promise<TaskRow> {
  const result = await client.query(
    `SELECT ct.id, ct.legacy_id, ct.challenge_id, ct.challenge_day_id,
            ct.subject_id, ct.title, ct.category, cd.calendar_date::text
     FROM curriculum_tasks ct
     JOIN challenge_days cd ON cd.id = ct.challenge_day_id
     WHERE ct.legacy_id = $1
     FOR SHARE`,
    [`${taskId}-${section}`]
  );
  if (result.rowCount === 0) {
    throw new TaskCompletionError(404, 'Task section is not present in PostgreSQL curriculum records.');
  }
  return result.rows[0] as TaskRow;
}

async function validateTaskDate(client: PoolClient, participantId: string, task: TaskRow) {
  const currentDate = calculateDayInfo().currentDate;
  await ensureParticipantSchedule(client, participantId, task.challenge_id);
  const schedule = await client.query(
    `SELECT effective_date::text AS date
     FROM participant_schedule_days
     WHERE participant_id = $1 AND challenge_id = $2 AND curriculum_day_number = (
       SELECT curriculum_day_number FROM challenge_days WHERE id = $3
     )`,
    [participantId, task.challenge_id, task.challenge_day_id],
  );
  const effectiveDate = schedule.rows[0]?.date as string | undefined;
  if (!effectiveDate) throw new TaskCompletionError(409, 'Participant schedule is not available for this task.');
  if (effectiveDate > currentDate) {
    throw new TaskCompletionError(403, 'Future curriculum sections cannot be completed early.');
  }
  return effectiveDate === currentDate;
}

async function consumeApprovedLateRequest(client: PoolClient, participantId: string, taskId: string, section: TaskSection, task: TaskRow) {
  const request = await client.query(
    `SELECT cr.id
     FROM change_requests cr
     WHERE cr.requester_participant_id = $1
       AND cr.target_type = 'RETROACTIVE_COMPLETION'
       AND cr.target_id = $2
       AND cr.status = 'APPROVED'
     FOR UPDATE`,
    [participantId, task.id],
  );
  if (!request.rowCount) {
    throw new TaskCompletionError(403, 'Past curriculum sections require partner approval before late completion.');
  }
  return request.rows[0].id as string;
}

async function currentTotal(client: PoolClient, participantId: string) {
  const result = await client.query(
    `SELECT COALESCE(SUM(amount), 0)::int AS total FROM points_ledger WHERE participant_id = $1`,
    [participantId]
  );
  return Number(result.rows[0]?.total || 0);
}

async function writeAudit(
  client: PoolClient,
  participantId: string,
  task: TaskRow,
  action: string,
  reason: string,
  nowIso: string
) {
  await client.query(
    `INSERT INTO audit_logs (actor_participant_id, action, entity_type, entity_id, reason, created_at)
     VALUES ($1, $2, 'CURRICULUM_TASK', $3, $4, $5)`,
    [participantId, action, task.id, reason, nowIso]
  );
}

export async function completeTaskSection(
  pool: Pool,
  legacyUserId: string,
  taskId: string,
  requestedSection: string
): Promise<CompletionResult> {
  const section = normalizeSection(requestedSection);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2 || ':' || $3))`, [legacyUserId, taskId, section]);

    const participantId = await resolveParticipant(client, legacyUserId);
    const task = await resolveTask(client, taskId, section);
    const isToday = await validateTaskDate(client, participantId, task);
    const approvedRequestId = isToday ? null : await consumeApprovedLateRequest(client, participantId, taskId, section, task);
    const points = SECTION_POINTS[section];
    const awardedPoints = isToday ? points : LATE_POINTS;
    const status = isToday ? 'COMPLETED_ON_TIME' : 'COMPLETED_LATE';
    const nowIso = getISTNow().toISOString();

    const existing = await client.query(
      `SELECT status FROM task_completions
       WHERE participant_id = $1 AND curriculum_task_id = $2
       FOR UPDATE`,
      [participantId, task.id]
    );
    const priorReversal = await client.query(
      `SELECT 1 FROM points_ledger
       WHERE participant_id = $1 AND curriculum_task_id = $2 AND event_type = 'TASK_REVERSED'
       LIMIT 1`,
      [participantId, task.id]
    );
    if (priorReversal.rowCount || (existing.rowCount && existing.rows[0].status === 'REVERSED')) {
      throw new TaskCompletionError(409, 'This section was already reversed and cannot be completed again.');
    }
    if (existing.rowCount && ['COMPLETED_ON_TIME', 'COMPLETED_LATE'].includes(existing.rows[0].status)) {
      throw new TaskCompletionError(409, 'This section is already completed.');
    }

    await client.query(
      `INSERT INTO task_completions
         (participant_id, curriculum_task_id, subject_id, status, points_awarded, completed_at, version)
       VALUES ($1, $2, $3, $4, $5, $6, 1)
       ON CONFLICT (participant_id, curriculum_task_id, subject_id)
       DO UPDATE SET status = EXCLUDED.status,
                     points_awarded = EXCLUDED.points_awarded,
                     completed_at = EXCLUDED.completed_at,
                     version = task_completions.version + 1`,
      [participantId, task.id, task.subject_id, status, awardedPoints, nowIso]
    );

    await client.query(
      `INSERT INTO points_ledger
         (participant_id, challenge_id, challenge_day_id, curriculum_task_id, amount, event_type, reason, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
      [
        participantId,
        task.challenge_id,
        task.challenge_day_id,
        task.id,
        awardedPoints,
        status === 'COMPLETED_ON_TIME' ? 'TASK_COMPLETED_ON_TIME' : 'TASK_COMPLETED_LATE',
        `${section} section completed for '${task.title}' (+${awardedPoints} pts)`,
        JSON.stringify({ section, sourceTaskId: taskId, sourceTaskTitle: task.title, category: task.category }),
        nowIso,
      ]
    );

    await writeAudit(client, participantId, task, 'MARK_SCHEDULE_SECTION_COMPLETE', `${section} section completed.`, nowIso);
    if (approvedRequestId) {
      await client.query(
        `UPDATE change_requests SET status = 'APPLIED', applied_at = $2 WHERE id = $1 AND status = 'APPROVED'`,
        [approvedRequestId, nowIso],
      );
    }
    const newTotal = (await currentTotal(client, participantId));
    await client.query('COMMIT');
    return { section, status, pointsAwarded: awardedPoints, newTotal };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function undoTaskSection(
  pool: Pool,
  legacyUserId: string,
  taskId: string,
  requestedSection: string
): Promise<UndoResult> {
  const section = normalizeSection(requestedSection);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2 || ':' || $3))`, [legacyUserId, taskId, section]);

    const participantId = await resolveParticipant(client, legacyUserId);
    const task = await resolveTask(client, taskId, section);
    const isToday = await validateTaskDate(client, participantId, task);
    if (!isToday) {
      throw new TaskCompletionError(403, 'Only the current challenge-day section can be undone.');
    }

    const completion = await client.query(
      `SELECT status, points_awarded FROM task_completions
       WHERE participant_id = $1 AND curriculum_task_id = $2
       FOR UPDATE`,
      [participantId, task.id]
    );
    if (!completion.rowCount || !['COMPLETED_ON_TIME', 'COMPLETED_LATE'].includes(completion.rows[0].status)) {
      throw new TaskCompletionError(409, 'This section is not currently completed.');
    }

    const original = await client.query(
      `SELECT id, amount FROM points_ledger
       WHERE participant_id = $1 AND curriculum_task_id = $2
         AND event_type IN ('TASK_COMPLETED_ON_TIME', 'TASK_COMPLETED_LATE')
         AND metadata->>'section' = $3
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE`,
      [participantId, task.id, section]
    );
    if (!original.rowCount) {
      throw new TaskCompletionError(409, 'The original completion reward could not be found.');
    }

    const nowIso = getISTNow().toISOString();
    await client.query(
      `UPDATE task_completions
       SET status = 'PENDING', points_awarded = 0, completed_at = $3, version = version + 1
       WHERE participant_id = $1 AND curriculum_task_id = $2`,
      [participantId, task.id, nowIso]
    );
    await client.query(
      `INSERT INTO points_ledger
         (participant_id, challenge_id, challenge_day_id, curriculum_task_id, amount, event_type, reason, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, 'TASK_REVERSED', $6, $7::jsonb, $8)`,
      [
        participantId,
        task.challenge_id,
        task.challenge_day_id,
        task.id,
        -Number(original.rows[0].amount),
        `${section} section completion reversed for '${task.title}'`,
        JSON.stringify({ section, reversalOf: original.rows[0].id, sourceTaskId: taskId }),
        nowIso,
      ]
    );
    await writeAudit(client, participantId, task, 'REVERSE_SCHEDULE_SECTION_COMPLETION', `${section} section reversed.`, nowIso);
    const newTotal = await currentTotal(client, participantId);
    await client.query('COMMIT');
    return { section, pointsReversed: Number(original.rows[0].amount), newTotal };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function completeTask(
  pool: Pool,
  legacyUserId: string,
  taskId: string
): Promise<CompletionResult> {
  const sections: TaskSection[] = ['DSA', 'JAVA', 'OS', 'DBMS'];
  const results: CompletionResult[] = [];
  for (const section of sections) {
    results.push(await completeTaskSection(pool, legacyUserId, taskId, section));
  }
  return {
    section: 'TASK',
    status: results.some(result => result.status === 'COMPLETED_LATE') ? 'COMPLETED_LATE' : 'COMPLETED_ON_TIME',
    pointsAwarded: results.reduce((sum, result) => sum + result.pointsAwarded, 0),
    newTotal: results.at(-1)?.newTotal || 0,
  };
}

export async function undoTask(
  pool: Pool,
  legacyUserId: string,
  taskId: string,
  requestedSection?: string
) {
  if (requestedSection) {
    return undoTaskSection(pool, legacyUserId, taskId, requestedSection);
  }
  throw new TaskCompletionError(400, 'A task section is required for reversal.');
}
