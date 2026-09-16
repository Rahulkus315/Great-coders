import { getRuntimePool } from './store';
import { calculateDayInfo, getISTDateString, getISTNow } from './timeUtils';
import { settleWakeUpCheckinForDate } from './wakeUpCheckinService';

export async function settleMorningCheckinsForDate(dateToSettle: string): Promise<void> {
  await settleWakeUpCheckinForDate(getRuntimePool(), dateToSettle);
}

export async function runMidnightSettlement(targetDateStr?: string) {
  const dayInfo = calculateDayInfo();
  const dateToSettle = targetDateStr || dayInfo.currentDate;
  const pool = getRuntimePool();

  const client = await pool.connect();
  const nowIso = getISTNow().toISOString();
  try {
    await client.query('BEGIN');
    const challengeDay = await client.query(
      `SELECT cd.id, cd.challenge_id
       FROM challenge_days cd JOIN challenges c ON c.id = cd.challenge_id
       WHERE cd.calendar_date = $1 AND c.timezone = $2
       ORDER BY c.start_date ASC LIMIT 1 FOR UPDATE`,
      [dateToSettle, 'Asia/Kolkata']
    );
    const settled = await client.query(
      `INSERT INTO daily_settlements (settlement_date, summary, created_at, finalized_at)
       VALUES ($1, '{}'::jsonb, $2, $2)
       ON CONFLICT (settlement_date) DO NOTHING
       RETURNING settlement_date`,
      [dateToSettle, nowIso]
    );
    if (settled.rowCount === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        message: `Day ${dateToSettle} has already been finalized and settled.`,
      };
    }

    const selfControlSummary = { maintained: 0, relapses: 0, holidays: 0 };
    const participants = challengeDay.rowCount
      ? await client.query(`SELECT id, legacy_id FROM participants WHERE status = 'ACTIVE' ORDER BY legacy_id`)
      : { rows: [] as Array<{ id: string; legacy_id: string }> };
    for (const participant of participants.rows) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))", [participant.legacy_id, dateToSettle]);
      const existing = await client.query(
        `SELECT id, status FROM self_control_entries WHERE participant_id = $1 AND challenge_day_id = $2 FOR UPDATE`,
        [participant.id, challengeDay.rows[0].id]
      );
      const holiday = await client.query(
        `SELECT 1 FROM holidays WHERE participant_id = $1 AND challenge_day_id = $2 AND status = 'APPROVED'`,
        [participant.id, challengeDay.rows[0].id]
      );
      const currentStatus = existing.rows[0]?.status;
      const status = holiday.rowCount ? 'HOLIDAY' : currentStatus === 'REPORTED_RELAPSE' ? 'REPORTED_RELAPSE' : 'NO_REPORT';
      const entry = await client.query(
        `INSERT INTO self_control_entries (participant_id, challenge_day_id, status, recorded_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (participant_id, challenge_day_id) DO UPDATE SET status = EXCLUDED.status
         RETURNING id`,
        [participant.id, challengeDay.rows[0].id, status, nowIso]
      );
      if (status === 'NO_REPORT') selfControlSummary.maintained += 1;
      if (status === 'REPORTED_RELAPSE') selfControlSummary.relapses += 1;
      if (status === 'HOLIDAY') selfControlSummary.holidays += 1;
      const action = status === 'NO_REPORT' ? 'SELF_CONTROL_DAY_MAINTAINED' : status === 'HOLIDAY' ? 'SELF_CONTROL_DAY_FINALIZED' : 'SELF_CONTROL_STREAK_RESET';
      await client.query(
        `INSERT INTO audit_logs (actor_participant_id, action, entity_type, entity_id, reason, created_at)
         VALUES ($1, $2, 'SELF_CONTROL', $3, $4, $5)`,
        [participant.id, action, entry.rows[0].id, `Self-control day finalized as ${status}.`, nowIso]
      );

      if (status === 'NO_REPORT') {
        await client.query(
          `INSERT INTO points_ledger
             (participant_id, challenge_id, challenge_day_id, amount, event_type, reason, metadata, created_at)
           VALUES ($1, $2, $3, 1, 'SELF_CONTROL_COMPLETED', 'Self-control maintained for the challenge day (+1 pt)', $4::jsonb, $5)`,
          [participant.id, challengeDay.rows[0].challenge_id, challengeDay.rows[0].id, JSON.stringify({ date: dateToSettle }), nowIso]
        );
      }

      const scheduledSections = await client.query(
        `SELECT ct.id, ct.subject_id, s.code AS section
         FROM curriculum_tasks ct
         JOIN subjects s ON s.id = ct.subject_id
         WHERE ct.challenge_day_id = $1`,
        [challengeDay.rows[0].id]
      );
      const penalties: Record<string, number> = { DSA: -5, JAVA: -2, DBMS: -2, OS: -1 };
      for (const scheduled of scheduledSections.rows) {
        const completion = await client.query(
          `SELECT 1 FROM task_completions
           WHERE participant_id = $1 AND curriculum_task_id = $2
             AND status IN ('COMPLETED_ON_TIME', 'COMPLETED_LATE')`,
          [participant.id, scheduled.id]
        );
        if (!completion.rowCount && penalties[scheduled.section] !== undefined) {
          await client.query(
            `INSERT INTO points_ledger
               (participant_id, challenge_id, challenge_day_id, curriculum_task_id, amount, event_type, reason, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, 'TASK_MISSED_PENALTY', $6, $7::jsonb, $8)`,
            [participant.id, challengeDay.rows[0].challenge_id, challengeDay.rows[0].id, scheduled.id, penalties[scheduled.section], `${scheduled.section} task missed (${penalties[scheduled.section]} pts)`, JSON.stringify({ section: scheduled.section, date: dateToSettle }), nowIso]
          );
        }
      }
    }

    const totals = await client.query(
      `SELECT p.legacy_id, COALESCE(SUM(pl.amount), 0)::int AS total_points
       FROM participants p
       LEFT JOIN points_ledger pl ON pl.participant_id = p.id
       WHERE p.status = 'ACTIVE'
       GROUP BY p.legacy_id`
    );
    const stats = Object.fromEntries(totals.rows.map((row: any) => [row.legacy_id, { totalPoints: row.total_points }]));
    const summary = `PostgreSQL-backed settlement finalized for ${dateToSettle}.`;
    await client.query(
      `UPDATE daily_settlements SET summary = $2::jsonb WHERE settlement_date = $1`,
      [dateToSettle, JSON.stringify({ summary, recordedAt: nowIso, stats, selfControl: selfControlSummary })]
    );
    await client.query('COMMIT');

    return {
      success: true,
      message: `Midnight settlement for ${dateToSettle} completed successfully.`,
      summary,
      rahulStats: stats['user-rahul'] || { totalPoints: 0 },
      dileepStats: stats['user-dileep'] || { totalPoints: 0 },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
