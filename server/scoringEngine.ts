import { store } from './store';
import { PointLedgerEntry, UserStats, HabitStats, CompetitionOverview, DailyTask } from '../src/types';
import { calculateDayInfo, getISTDateString, getISTNow } from './timeUtils';

export function calculateUserStats(userId: string): UserStats {
  const state = store.getState();
  const user = state.users.find(u => u.id === userId);
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // Authoritative total points calculated strictly from immutable point ledger
  const userEntries = state.pointLedger.filter(e => e.userId === userId);
  const totalPoints = userEntries.reduce((sum, entry) => sum + entry.points, 0);

  const sectionStatuses = (state.scheduleSectionStatuses || []).filter(ts => ts.userId === userId);
  const completedStatuses = sectionStatuses.filter(
    ts => ts.status === 'COMPLETED_ON_TIME' || ts.status === 'COMPLETED_LATE'
  );
  const completedTasks = completedStatuses.length;
  const missedTasks = sectionStatuses.filter(ts => ts.status === 'MISSED').length;
  const lateTasks = sectionStatuses.filter(ts => ts.status === 'COMPLETED_LATE').length;

  // DSA problems solved
  const dsaSolved = state.dsaAttempts.filter(
    a => a.userId === userId && a.status === 'SOLVED'
  ).length;

  const dsaPoints = userEntries
    .filter(e => e.eventType === 'DSA_COMPLETED')
    .reduce((acc, e) => acc + e.points, 0);

  // Study hours from journals
  const userJournals = state.journals.filter(j => j.userId === userId);
  const totalStudyHours = Math.round(
    userJournals.reduce((acc, j) => acc + (j.studyHours || 0), 0) * 10
  ) / 10;

  // Streak calculations
  const dayInfo = calculateDayInfo();
  let currentStreak = 0;
  let bestStreak = 0;
  let tempStreak = 0;

  // Check day by day from day 1 to dayInfo.dayNumber - 1
  for (let d = 1; d <= dayInfo.dayNumber; d++) {
    const task = state.tasks[d - 1];
    if (!task) break;

    const daySections = sectionStatuses.filter(status => status.taskId === task.id);
    const completed = daySections.length === 4 && daySections.every(
      status => status.status === 'COMPLETED_ON_TIME' || status.status === 'COMPLETED_LATE'
    );

    if (completed) {
      tempStreak++;
      if (tempStreak > bestStreak) bestStreak = tempStreak;
    } else {
      // If day has passed and not completed, streak resets
      if (d < dayInfo.dayNumber) {
        tempStreak = 0;
      }
    }
  }
  currentStreak = tempStreak;

  // Completion percentage
  const totalEligibleTasks = Math.max(1, dayInfo.dayNumber * 4);
  const completionPercentage = Math.min(100, Math.round((completedTasks / totalEligibleTasks) * 100));

  // Leaves calculation (Max 5 days quota per user across 100 days)
  const userLeaves = (state.leaves || []).filter(l => l.userId === userId);
  const leavesUsed = userLeaves.length;
  const remainingLeaves = Math.max(0, 5 - leavesUsed);
  const currentDate = dayInfo.currentDate;
  const isOnLeaveToday = userLeaves.some(l => l.date === currentDate);

  // Wake-up values are supplied by the PostgreSQL-backed dashboard route.
  const morningCheckinToday: 'CHECKED_IN' | 'MISSED' | 'PENDING' | 'ON_LEAVE' = 'PENDING';
  const morningCheckinStreak = 0;
  const bestMorningCheckinStreak = 0;

  // Daily check-in (+1 Coin, streak, 7-day bonus) calculation
  const checkinStats = calculateCheckinStats(userId);

  return {
    userId,
    name: user.name,
    totalPoints,
    rank: 1, // Will be resolved in competition overview
    completedTasks,
    missedTasks,
    lateTasks,
    dsaSolved,
    dsaPoints,
    currentStreak,
    bestStreak,
    checkinStreak: checkinStats.currentStreak,
    bestCheckinStreak: checkinStats.bestStreak,
    totalCoins: checkinStats.totalCoins,
    hasCheckedInToday: checkinStats.hasCheckedInToday,
    todayCheckinTime: checkinStats.todayCheckinTime,
    totalStudyHours: totalStudyHours || 0,
    completionPercentage,
    leavesUsed,
    remainingLeaves,
    morningCheckinToday,
    morningCheckinStreak,
    bestMorningCheckinStreak,
    isOnLeaveToday,
  };
}

export function calculateCheckinStats(userId: string) {
  const state = store.getState();
  const dayInfo = calculateDayInfo();
  const currentDate = dayInfo.currentDate;
  state.dailyCheckins = state.dailyCheckins || [];

  const userCheckins = state.dailyCheckins
    .filter(c => c.userId === userId)
    .sort((a, b) => a.date.localeCompare(b.date));

  const todayCheckin = userCheckins.find(c => c.date === currentDate) || null;
  const hasCheckedInToday = !!todayCheckin;

  const totalCoins = userCheckins.reduce((sum, c) => sum + (c.coinsAwarded || 1), 0);

  let currentStreak = 0;
  let bestStreak = 0;

  if (userCheckins.length > 0) {
    if (todayCheckin) {
      currentStreak = todayCheckin.streakDay || 1;
    } else {
      const yesterday = new Date(currentDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const yesterdayCheckin = userCheckins.find(c => c.date === yesterdayStr);
      if (yesterdayCheckin) {
        currentStreak = yesterdayCheckin.streakDay || 1;
      } else {
        currentStreak = 0;
      }
    }

    bestStreak = userCheckins.reduce((max, c) => Math.max(max, c.streakDay || 0), currentStreak);
  }

  return {
    hasCheckedInToday,
    todayCheckin,
    currentStreak,
    bestStreak,
    totalCoins,
    todayCheckinTime: todayCheckin ? todayCheckin.timeStr : undefined,
  };
}

export function calculateHabitStats(userId: string): HabitStats {
  const state = store.getState();
  const userHabits = state.habits
    .filter(h => h.userId === userId)
    .sort((a, b) => a.date.localeCompare(b.date));

  let currentStreak = 0;
  let bestStreak = 0;
  let cleanDays = 0;
  let relapseCount = 0;
  let lastRelapseDate: string | undefined = undefined;

  let tempStreak = 0;
  for (const entry of userHabits) {
    if (entry.status === 'HOLIDAY') {
      continue;
    }

    if (entry.status === 'NO_REPORT') {
      cleanDays++;
      tempStreak++;
      if (tempStreak > bestStreak) bestStreak = tempStreak;
      continue;
    }

    if (entry.status === 'REPORTED_RELAPSE') {
      relapseCount++;
      lastRelapseDate = entry.date;
      tempStreak = 0;
    }
  }
  currentStreak = tempStreak;

  return {
    userId,
    currentStreak,
    bestStreak,
    totalCleanDays: cleanDays,
    relapseCount,
    lastRelapseDate,
  };
}

export function getCompetitionOverview(): CompetitionOverview {
  const dayInfo = calculateDayInfo();
  const state = store.getState();

  const rahul = calculateUserStats('user-rahul');
  const dileep = calculateUserStats('user-dileep');

  // Determine ranks
  if (rahul.totalPoints > dileep.totalPoints) {
    rahul.rank = 1;
    dileep.rank = 2;
  } else if (dileep.totalPoints > rahul.totalPoints) {
    dileep.rank = 1;
    rahul.rank = 2;
  } else {
    rahul.rank = 1;
    dileep.rank = 1;
  }

  // Point Difference formatting according to Section 9:
  // "Rahul is ahead by 13 points." / "Dileep is ahead by 9 points." / "It's a tie."
  // Never show misleading negative numbers.
  let leaderId: string | null = null;
  let leaderName: string | null = null;
  let pointDifference = Math.abs(rahul.totalPoints - dileep.totalPoints);
  let pointDifferenceText = "It's a tie.";

  if (rahul.totalPoints > dileep.totalPoints) {
    leaderId = 'user-rahul';
    leaderName = 'Rahul';
    pointDifferenceText = `Rahul is ahead by ${pointDifference} point${pointDifference === 1 ? '' : 's'}`;
  } else if (dileep.totalPoints > rahul.totalPoints) {
    leaderId = 'user-dileep';
    leaderName = 'Dileep';
    pointDifferenceText = `Dileep is ahead by ${pointDifference} point${pointDifference === 1 ? '' : 's'}`;
  }

  // Habit Streak comparison (Section 29)
  const rahulHabit = calculateHabitStats('user-rahul');
  const dileepHabit = calculateHabitStats('user-dileep');

  let habitLeaderName: string | null = null;
  let habitDiff = Math.abs(rahulHabit.currentStreak - dileepHabit.currentStreak);
  let habitComparisonText = "Streaks are tied.";

  if (rahulHabit.currentStreak > dileepHabit.currentStreak) {
    habitLeaderName = 'Rahul';
    habitComparisonText = `Rahul is ahead by ${habitDiff} day${habitDiff === 1 ? '' : 's'}`;
  } else if (dileepHabit.currentStreak > rahulHabit.currentStreak) {
    habitLeaderName = 'Dileep';
    habitComparisonText = `Dileep is ahead by ${habitDiff} day${habitDiff === 1 ? '' : 's'}`;
  }

  // Daily quote: same quote for both users for today's day number
  const quote =
    state.quotes.find(q => q.dayNumber === dayInfo.dayNumber) ||
    state.quotes[0] || {
      id: 'q-def',
      dayNumber: 1,
      quote: 'Consistency beats brilliance every single time.',
      author: 'Senior Architect',
      category: 'Discipline',
    };

  return {
    dayInfo,
    rahul,
    dileep,
    leaderId,
    leaderName,
    pointDifference,
    pointDifferenceText,
    habitComparison: {
      rahulStreak: rahulHabit.currentStreak,
      dileepStreak: dileepHabit.currentStreak,
      habitLeaderName,
      habitDifferenceDays: habitDiff,
      habitComparisonText,
    },
    dailyQuote: quote,
  };
}
