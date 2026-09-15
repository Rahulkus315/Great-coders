import { getRuntimePool } from './store';
import { CompetitionOverview, DailyCheckinRecord, HabitStats, MotivationQuote, UserStats } from '../src/types';
import { calculateDayInfo } from './timeUtils';

export async function calculateCheckinStats(userId: string) {
  const rows = (await getRuntimePool().query<DailyCheckinRecord>(`SELECT d.id, p.legacy_id AS "userId", d.checkin_date::text AS date, d.checked_in_at AS "checkedInAt", d.time_text AS "timeStr", d.streak_day AS "streakDay", d.coins_awarded AS "coinsAwarded", d.bonus_awarded AS "bonusAwarded", d.bonus_points AS "bonusPoints" FROM daily_checkins d JOIN participants p ON p.id=d.participant_id WHERE p.legacy_id=$1 ORDER BY d.checkin_date ASC`, [userId])).rows;
  const currentDate = calculateDayInfo().currentDate;
  const todayCheckin = rows.find(row => row.date === currentDate) || null;
  const yesterday = new Date(`${currentDate}T00:00:00Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayCheckin = rows.find(row => row.date === yesterday.toISOString().slice(0, 10));
  return { hasCheckedInToday: Boolean(todayCheckin), todayCheckin, currentStreak: todayCheckin?.streakDay || yesterdayCheckin?.streakDay || 0, bestStreak: rows.reduce((max, row) => Math.max(max, row.streakDay || 0), 0), totalCoins: rows.reduce((sum, row) => sum + (row.coinsAwarded || 1), 0), todayCheckinTime: todayCheckin?.timeStr };
}

export async function calculateHabitStats(userId: string): Promise<HabitStats> {
  const rows = (await getRuntimePool().query<{ date: string; status: string }>(`SELECT cd.calendar_date::text AS date, e.status FROM self_control_entries e JOIN participants p ON p.id=e.participant_id JOIN challenge_days cd ON cd.id=e.challenge_day_id JOIN daily_settlements ds ON ds.settlement_date=cd.calendar_date WHERE p.legacy_id=$1 ORDER BY cd.calendar_date ASC`, [userId])).rows;
  let currentStreak = 0; let bestStreak = 0; let cleanDays = 0; let relapseCount = 0; let lastRelapseDate: string | undefined;
  for (const row of rows) {
    if (row.status === 'HOLIDAY') continue;
    if (row.status === 'NO_REPORT') { cleanDays += 1; currentStreak += 1; bestStreak = Math.max(bestStreak, currentStreak); }
    else if (row.status === 'REPORTED_RELAPSE') { relapseCount += 1; lastRelapseDate = row.date; currentStreak = 0; }
  }
  return { userId, currentStreak, bestStreak, totalCleanDays: cleanDays, relapseCount, lastRelapseDate };
}

export async function calculateUserStats(userId: string): Promise<UserStats> {
  const pool = getRuntimePool(); const dayInfo = calculateDayInfo();
  const user = (await pool.query<{ id: string; name: 'Rahul' | 'Dileep' }>(`SELECT legacy_id AS id, display_name AS name FROM participants WHERE legacy_id=$1 AND status='ACTIVE'`, [userId])).rows[0];
  if (!user) throw new Error(`User not found: ${userId}`);
  const [ledger, completions, dsa, journals, leaves, checkins, habits] = await Promise.all([
    pool.query<{ points: number; eventType: string }>(`SELECT amount AS points, event_type AS "eventType" FROM points_ledger pl JOIN participants p ON p.id=pl.participant_id WHERE p.legacy_id=$1`, [userId]),
    pool.query<{ status: string }>(`SELECT tc.status FROM task_completions tc JOIN participants p ON p.id=tc.participant_id WHERE p.legacy_id=$1`, [userId]),
    pool.query<{ count: string }>(`SELECT COUNT(*)::int AS count FROM dsa_submissions ds JOIN participants p ON p.id=ds.participant_id WHERE p.legacy_id=$1 AND ds.status='SOLVED'`, [userId]),
    pool.query<{ studyHours: number }>(`SELECT COALESCE(SUM(study_hours),0) AS "studyHours" FROM todays_live tl JOIN participants p ON p.id=tl.participant_id WHERE p.legacy_id=$1`, [userId]),
    pool.query<{ date: string }>(`SELECT cd.calendar_date::text AS date FROM holidays h JOIN participants p ON p.id=h.participant_id JOIN challenge_days cd ON cd.id=h.challenge_day_id WHERE p.legacy_id=$1 AND h.status='APPROVED'`, [userId]),
    calculateCheckinStats(userId), calculateHabitStats(userId),
  ]);
  const completed = completions.rows.filter(row => row.status === 'COMPLETED_ON_TIME' || row.status === 'COMPLETED_LATE').length;
  const totalPoints = ledger.rows.reduce((sum, row) => sum + Number(row.points), 0);
  return { userId, name: user.name, totalPoints, rank: 1, completedTasks: completed, missedTasks: completions.rows.filter(row => row.status === 'MISSED').length, lateTasks: completions.rows.filter(row => row.status === 'COMPLETED_LATE').length, dsaSolved: Number(dsa.rows[0]?.count || 0), dsaPoints: ledger.rows.filter(row => row.eventType === 'DSA_COMPLETED').reduce((sum, row) => sum + Number(row.points), 0), currentStreak: habits.currentStreak, bestStreak: habits.bestStreak, checkinStreak: checkins.currentStreak, bestCheckinStreak: checkins.bestStreak, totalCoins: checkins.totalCoins, hasCheckedInToday: checkins.hasCheckedInToday, todayCheckinTime: checkins.todayCheckinTime, totalStudyHours: Math.round(Number(journals.rows[0]?.studyHours || 0) * 10) / 10, completionPercentage: Math.min(100, Math.round((completed / Math.max(1, dayInfo.dayNumber * 4)) * 100)), leavesUsed: leaves.rows.length, remainingLeaves: Math.max(0, 5 - leaves.rows.length), morningCheckinToday: 'PENDING', morningCheckinStreak: 0, bestMorningCheckinStreak: 0, isOnLeaveToday: leaves.rows.some(leave => leave.date === dayInfo.currentDate) };
}

export async function getCompetitionOverview(): Promise<CompetitionOverview> {
  const dayInfo = calculateDayInfo();
  const [rahul, dileep, rahulHabit, dileepHabit] = await Promise.all([calculateUserStats('user-rahul'), calculateUserStats('user-dileep'), calculateHabitStats('user-rahul'), calculateHabitStats('user-dileep')]);
  if (rahul.totalPoints > dileep.totalPoints) { rahul.rank = 1; dileep.rank = 2; } else if (dileep.totalPoints > rahul.totalPoints) { dileep.rank = 1; rahul.rank = 2; } else { rahul.rank = 1; dileep.rank = 1; }
  const pointDifference = Math.abs(rahul.totalPoints - dileep.totalPoints); const leaderId = rahul.totalPoints === dileep.totalPoints ? null : rahul.totalPoints > dileep.totalPoints ? 'user-rahul' : 'user-dileep'; const leaderName = leaderId === 'user-rahul' ? 'Rahul' : leaderId === 'user-dileep' ? 'Dileep' : null; const habitDifference = Math.abs(rahulHabit.currentStreak - dileepHabit.currentStreak); const habitLeaderName = rahulHabit.currentStreak === dileepHabit.currentStreak ? null : rahulHabit.currentStreak > dileepHabit.currentStreak ? 'Rahul' : 'Dileep';
  return { dayInfo, rahul, dileep, leaderId, leaderName, pointDifference, pointDifferenceText: leaderName ? `${leaderName} is ahead by ${pointDifference} point${pointDifference === 1 ? '' : 's'}` : "It's a tie.", habitComparison: { rahulStreak: rahulHabit.currentStreak, dileepStreak: dileepHabit.currentStreak, habitLeaderName, habitDifferenceDays: habitDifference, habitComparisonText: habitLeaderName ? `${habitLeaderName} is ahead by ${habitDifference} day${habitDifference === 1 ? '' : 's'}` : 'Streaks are tied.' }, dailyQuote: { id: 'q-def', dayNumber: dayInfo.dayNumber, quote: 'Consistency beats brilliance every single time.', author: 'Senior Architect', category: 'Discipline' } as MotivationQuote };
}
