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
      [dateToSettle, JSON.stringify({ summary, recordedAt: nowIso, stats })]
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
