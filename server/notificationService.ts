import { Pool, PoolClient } from 'pg';

type NotificationWriter = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

export async function createNotification(
  client: NotificationWriter,
  recipientLegacyId: string,
  type: string,
  title: string,
  message: string,
  data: Record<string, unknown> = {},
) {
  const result = await client.query(
    `INSERT INTO notifications (recipient_participant_id, notification_type, title, message, data)
     SELECT id, $2, $3, $4, $5::jsonb FROM participants
     WHERE legacy_id = $1 AND status = 'ACTIVE'
     RETURNING id`,
    [recipientLegacyId, type, title, message, JSON.stringify(data)],
  );
  if (!result.rowCount) throw new Error('Notification recipient is not an active participant.');
  return result.rows[0].id as string;
}

export async function listNotifications(pool: Pool, legacyId: string) {
  const result = await pool.query(
    `SELECT n.id, p.legacy_id AS "userId", n.notification_type AS type, n.title, n.message,
            (n.read_at IS NOT NULL) AS read, n.created_at AS "createdAt", n.data
     FROM notifications n JOIN participants p ON p.id = n.recipient_participant_id
     WHERE p.legacy_id = $1 ORDER BY n.created_at DESC`,
    [legacyId]
  );
  return result.rows;
}

export async function markNotificationRead(pool: Pool, legacyId: string, notificationId: string) {
  const result = await pool.query(
    `UPDATE notifications n SET read_at = COALESCE(read_at, now())
     FROM participants p WHERE n.recipient_participant_id = p.id AND p.legacy_id = $1 AND n.id = $2
     RETURNING n.id`,
    [legacyId, notificationId]
  );
  return result.rowCount > 0;
}

export async function markAllNotificationsRead(pool: Pool, legacyId: string) {
  await pool.query(
    `UPDATE notifications n SET read_at = COALESCE(read_at, now())
     FROM participants p WHERE n.recipient_participant_id = p.id AND p.legacy_id = $1 AND n.read_at IS NULL`,
    [legacyId]
  );
}

export async function listAuditLogs(pool: Pool, legacyId: string) {
  const result = await pool.query(
    `SELECT a.id, p.legacy_id AS "actorId", p.display_name AS "actorName",
            COALESCE(pr.avatar_url, p.avatar_url) AS "actorAvatar",
            a.action, a.entity_type AS "targetType", a.entity_id AS "targetId", a.reason,
            a.old_value AS "previousState", a.new_value AS "newState", a.created_at AS timestamp
     FROM audit_logs a
     LEFT JOIN participants p ON p.id = a.actor_participant_id
     LEFT JOIN profiles pr ON pr.participant_id = p.id
     WHERE a.actor_participant_id IS NULL
        OR a.actor_participant_id IN (
          SELECT cp.participant_id
          FROM challenge_participants cp
          JOIN challenge_participants me ON me.challenge_id = cp.challenge_id
          JOIN participants current_participant ON current_participant.id = me.participant_id
          WHERE current_participant.legacy_id = $1
        )
     ORDER BY a.created_at DESC, a.id DESC`,
    [legacyId]
  );
  return result.rows;
}

export async function listLedger(pool: Pool, _legacyId: string, eventType?: string) {
  const competitionUsers = ['user-rahul', 'user-dileep'];
  const result = await pool.query(
    `SELECT pl.id, p.legacy_id AS "userId", pl.created_at AS timestamp, pl.amount AS points, pl.event_type AS "eventType", pl.reason, pl.metadata,
            cd.calendar_date::text AS date, ct.legacy_id AS "sourceTaskId", ct.title AS "sourceTaskTitle"
     FROM points_ledger pl
     JOIN participants p ON p.id = pl.participant_id
     LEFT JOIN challenge_days cd ON cd.id = pl.challenge_day_id
     LEFT JOIN curriculum_tasks ct ON ct.id = pl.curriculum_task_id
     WHERE p.legacy_id = ANY($1) AND ($2::text IS NULL OR pl.event_type = $2)
     ORDER BY pl.created_at DESC`,
    [competitionUsers, eventType || null]
  );
  return result.rows;
}
