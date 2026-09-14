import { Pool } from 'pg';

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
    `SELECT a.id, p.legacy_id AS "actorId", a.action, a.entity_type AS "targetType", a.entity_id AS "targetId", a.reason, a.old_value AS "previousState", a.new_value AS "newState", a.created_at AS timestamp
     FROM audit_logs a LEFT JOIN participants p ON p.id = a.actor_participant_id
     WHERE p.legacy_id = $1 OR a.actor_participant_id IS NULL ORDER BY a.created_at DESC`,
    [legacyId]
  );
  return result.rows;
}

export async function listLedger(pool: Pool, legacyId: string, eventType?: string) {
  const result = await pool.query(
    `SELECT pl.id, p.legacy_id AS "userId", pl.created_at AS timestamp, pl.amount AS points, pl.event_type AS "eventType", pl.reason, pl.metadata
     FROM points_ledger pl JOIN participants p ON p.id = pl.participant_id
     WHERE p.legacy_id = $1 AND ($2::text IS NULL OR pl.event_type = $2)
     ORDER BY pl.created_at DESC`,
    [legacyId, eventType || null]
  );
  return result.rows;
}
