import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getRuntimePool, store } from './store';
import { calculateDayInfo, getISTDateString, getISTNow } from './timeUtils';
import {
  calculateUserStats,
  calculateHabitStats,
  getCompetitionOverview,
  calculateCheckinStats,
} from './scoringEngine';
import {
  checkPermissionCooldown,
  createPermissionRequest,
  handlePermissionResponse,
} from './permissionEngine';
import { settleMorningCheckinsForDate } from './settlementEngine';
import { finalizeFocusedExecution } from './focusedExecutionLock';
import { completeTask, completeTaskSection, TaskCompletionError, undoTaskSection } from './taskCompletionService';
import { getWakeUpCheckin, getWakeUpStats, recordWakeUpCheckin, WakeUpCheckinError } from './wakeUpCheckinService';
import { applyLeave, DailyActivityError, getDailyCheckinStats, listLeaves, recordDailyCheckin } from './dailyActivityService';
import { ensureParticipantSchedule, getParticipantEffectiveDates } from './participantScheduleService';
import { DsaServiceError, getDsaAttempt, recordDsaAttempt } from './dsaService';
import { getHabitData, HabitJournalError, recordRelapse, getJournalData, saveJournal } from './habitJournalService';
import { listAuditLogs, listLedger, listNotifications, markAllNotificationsRead, markNotificationRead } from './notificationService';
import { ScheduleSection, SubjectCategory } from '../src/types';
import type { AppState } from './store';

const DAILY_SCHEDULE_SECTIONS: ScheduleSection[] = ['DSA', 'JAVA', 'OS', 'DBMS'];
const SECTION_POINTS: Record<ScheduleSection, number> = { DSA: 3, JAVA: 2, OS: 1, DBMS: 1 };
const SECTION_CATEGORIES: Record<ScheduleSection, SubjectCategory> = {
  DSA: 'DSA',
  JAVA: 'CORE_JAVA',
  OS: 'OS',
  DBMS: 'DBMS',
};

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

async function createAuthSession(client: { query: (text: string, values?: unknown[]) => Promise<unknown> }, res: express.Response, userId: string) {
  const secure = process.env.NODE_ENV === 'production';
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await client.query(
    `INSERT INTO auth_sessions (session_token_hash, participant_id, expires_at)
     SELECT $1, id, now() + interval '30 days' FROM participants WHERE legacy_id = $2 AND status = 'ACTIVE'`,
    [tokenHash, userId]
  );
  res.cookie('session_token', token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_MS,
  });
}

async function clearAuthCookie(req: express.Request, res: express.Response) {
  const secure = process.env.NODE_ENV === 'production';
  const token = req.cookies?.session_token;
  if (typeof token === 'string') {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await getRuntimePool().query('UPDATE auth_sessions SET revoked_at = now() WHERE session_token_hash = $1', [tokenHash]);
  }
  res.clearCookie('session_token', { httpOnly: true, secure, sameSite: 'lax' });
}

function getSessionUserId(req: express.Request) {
  const sessionId = (req as express.Request & { authenticatedLegacyId?: string }).authenticatedLegacyId;
  return typeof sessionId === 'string' ? sessionId : null;
}

function getDefaultProfile(user: { id: string; name: string; avatar: string; targetRole?: string }) {
  return {
    displayName: user.name,
    headline: user.targetRole || 'DSA • Java OOP • OS • DBMS',
    bio: 'Building every day. Becoming a better coder.',
    skills: 'DSA • Java • Operating Systems • DBMS • Collections',
    coverTheme: 'default' as const,
    avatarUrl: user.avatar,
  };
}

export const apiRouter = express.Router();

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isAllowedRequestOrigin(req: express.Request) {
  const origin = req.get('origin') || (req.get('referer') ? new URL(req.get('referer')!).origin : '');
  if (!origin) return process.env.NODE_ENV !== 'production';
  const configured = (process.env.APP_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean);
  const allowed = new Set(configured.length ? configured : ['http://localhost:3000', 'http://0.0.0.0:3000', 'http://localhost:5173']);
  return allowed.has(origin);
}

apiRouter.use((req, res, next) => {
  if (MUTATING_METHODS.has(req.method) && !isAllowedRequestOrigin(req)) {
    return res.status(403).json({ error: 'Cross-site request rejected.' });
  }

  if (req.path === '/auth/login' && req.method === 'POST') {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const attempt = loginAttempts.get(key);
    if (!attempt || attempt.resetAt <= now) {
      loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    } else if (attempt.count >= 10) {
      return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
    } else {
      attempt.count += 1;
    }
  }

  const sessionUserId = getSessionUserId(req);
  const clientUserIdHeader = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'] : null;
  const bodyUserId = typeof (req.body as any)?.userId === 'string' ? (req.body as any).userId : null;

  if (clientUserIdHeader && sessionUserId && clientUserIdHeader !== sessionUserId) {
    return res.status(403).json({
      error: 'Identity mismatch: client header does not match the authenticated server session.',
    });
  }

  if (clientUserIdHeader && !sessionUserId) {
    return res.status(401).json({
      error: 'Client identity headers are forbidden unless a valid authenticated session exists.',
    });
  }

  if (bodyUserId && sessionUserId && bodyUserId !== sessionUserId) {
    return res.status(403).json({
      error: 'Identity mismatch: submitted userId does not match the authenticated session.',
    });
  }

  next();
});

apiRouter.use(async (req, _res, next) => {
  const token = req.cookies?.session_token;
  if (typeof token !== 'string') return next();
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await getRuntimePool().query(
      `SELECT p.legacy_id
       FROM auth_sessions s JOIN participants p ON p.id = s.participant_id
       WHERE s.session_token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND p.status = 'ACTIVE'`,
      [tokenHash]
    );
    const request = req as express.Request & { authenticatedLegacyId?: string };
    request.authenticatedLegacyId = result.rows[0]?.legacy_id;
    if (result.rowCount) {
      await getRuntimePool().query('UPDATE auth_sessions SET last_seen_at = now() WHERE session_token_hash = $1', [tokenHash]);
    }
  } catch (error) {
    console.error('Session lookup failed:', error instanceof Error ? error.message : String(error));
  }
  next();
});

// Middleware: trust only the server-authenticated session cookie.
function getAuthUser(req: express.Request) {
  const state = store.getState();
  const sessionUserId = getSessionUserId(req);
  if (!sessionUserId) {
    return null;
  }

  return state.users.find(u => u.id === sessionUserId) || null;
}

function requireAuthUser(req: express.Request, res: express.Response) {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  return user;
}

export function buildUserExport(state: AppState, userId: string) {
  const user = state.users.find(candidate => candidate.id === userId);
  if (!user) return null;

  const { passwordHash: _passwordHash, ...safeUser } = user;
  return {
    user: safeUser,
    profile: state.profiles?.[userId] || null,
    curriculum: {
      tasks: state.tasks,
      dsaProblems: state.dsaProblems,
      interviewQuestions: state.interviewQuestions,
      quotes: state.quotes,
    },
    taskStatuses: state.taskStatuses.filter(item => item.userId === userId),
    scheduleSectionStatuses: state.scheduleSectionStatuses.filter(item => item.userId === userId),
    pointLedger: state.pointLedger.filter(item => item.userId === userId),
    dsaAttempts: state.dsaAttempts.filter(item => item.userId === userId),
    permissions: state.permissions.filter(item => item.requesterId === userId || item.targetUserId === userId),
    journals: state.journals.filter(item => item.userId === userId),
    habits: state.habits.filter(item => item.userId === userId),
    morningCheckins: state.morningCheckins.filter(item => item.userId === userId),
    dailyCheckins: state.dailyCheckins.filter(item => item.userId === userId),
    leaves: state.leaves.filter(item => item.userId === userId),
    notifications: state.notifications.filter(item => item.userId === userId),
    auditLogs: state.auditLogs.filter(item => item.actorId === userId),
    curriculumVersion: state.curriculumVersion,
  };
}

apiRouter.post('/auth/logout', async (req, res) => {
  await clearAuthCookie(req, res);
  res.json({ success: true, message: 'Logged out successfully.' });
});

apiRouter.post('/auth/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  try {
    const result = await getRuntimePool().query(
      `SELECT legacy_id AS id, display_name AS name, email, avatar_url AS avatar,
              target_role AS "targetRole", bound_identity AS "boundIdentity", password_hash AS "passwordHash"
       FROM participants WHERE status = 'ACTIVE' AND lower(email) = $1 LIMIT 1`,
      [email]
    );
    const participant = result.rows[0];
    const passwordHash = typeof participant?.passwordHash === 'string' ? participant.passwordHash : '';
    const passwordMatches = passwordHash ? await bcrypt.compare(password, passwordHash) : false;
    if (!participant || !passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const client = await getRuntimePool().connect();
    try {
      await client.query('BEGIN');
      await createAuthSession(client, res, participant.id);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    loginAttempts.delete(req.ip || req.socket.remoteAddress || 'unknown');

    const { passwordHash: _passwordHash, ...user } = participant;
    return res.json({ authenticated: true, user });
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid email or password.') {
      return res.status(401).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Authentication service unavailable.' });
  }
});

apiRouter.get('/auth/me', (req, res) => {
  const user = requireAuthUser(req, res);
  if (!user) return;

  const { passwordHash, ...userClean } = user;
  res.json({ user: userClean });
});

apiRouter.get('/profile', async (req, res) => {
  const userId = getSessionUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const result = await getRuntimePool().query(
      `SELECT p.display_name AS "displayName", p.headline, p.bio, p.skills, p.cover_theme AS "coverTheme", p.avatar_url AS "avatarUrl"
       FROM profiles p JOIN participants u ON u.id = p.participant_id WHERE u.legacy_id = $1`, [userId]
    );
    return res.json({ profile: result.rows[0] || null, userId });
  } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : String(error) }); }
});

apiRouter.post('/profile', async (req, res) => {
  const user = requireAuthUser(req, res);
  if (!user) return;

  const incoming = req.body || {};
  const safeProfile = {
    displayName: String(incoming.displayName || user.name).trim().slice(0, 80) || user.name,
    headline: String(incoming.headline || user.targetRole || 'DSA • Java OOP • OS • DBMS').trim().slice(0, 120),
    bio: String(incoming.bio || 'Building every day. Becoming a better coder.').trim().slice(0, 160),
    skills: String(incoming.skills || 'DSA • Java • Operating Systems • DBMS • Collections').trim().slice(0, 220),
    coverTheme: ['default', 'developer', 'java', 'ai', 'backend', 'fullstack'].includes(incoming.coverTheme) ? incoming.coverTheme : 'default',
    avatarUrl: typeof incoming.avatarUrl === 'string' && incoming.avatarUrl.trim() ? incoming.avatarUrl.trim() : user.avatar,
  };

  try {
    await getRuntimePool().query(
      `INSERT INTO profiles (participant_id, display_name, headline, bio, skills, avatar_url, cover_theme)
       SELECT id, $2, $3, $4, $5, $6, $7 FROM participants WHERE legacy_id = $1
       ON CONFLICT (participant_id) DO UPDATE SET display_name=EXCLUDED.display_name, headline=EXCLUDED.headline, bio=EXCLUDED.bio, skills=EXCLUDED.skills, avatar_url=EXCLUDED.avatar_url, cover_theme=EXCLUDED.cover_theme, updated_at=now()`,
      [user.id, safeProfile.displayName, safeProfile.headline, safeProfile.bio, safeProfile.skills, safeProfile.avatarUrl, safeProfile.coverTheme]
    );
    return res.json({ profile: safeProfile, userId: user.id });
  } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : String(error) }); }
});

apiRouter.post('/auth/switch-user', (req, res) => {
  const currentUser = requireAuthUser(req, res);
  if (!currentUser) return;

  return res.status(403).json({
    error: 'Identity switching is disabled. The active challenge session is fixed to the authenticated participant.',
  });
});

// ----------------------------------------------------------------------
// 2. DASHBOARD & OVERVIEW
// ----------------------------------------------------------------------
apiRouter.get('/dashboard', async (req, res) => {
  try {
    const currentUser = requireAuthUser(req, res);
    if (!currentUser) return;

    await store.refreshFromDatabase();
    const state = store.getState();
    const dayInfo = calculateDayInfo();
    await settleMorningCheckinsForDate(dayInfo.currentDate);
    const overview = await getCompetitionOverview();
    const partnerUser = state.users.find(u => u.id !== currentUser.id) || state.users[1];
    const currentWakeStats = await getWakeUpStats(getRuntimePool(), currentUser.id);
    const partnerWakeStats = await getWakeUpStats(getRuntimePool(), partnerUser.id);

    state.leaves = state.leaves || [];

    const currentDate = overview.dayInfo.currentDate;
    const userLeaves = state.leaves.filter(l => l.userId === currentUser.id);
    const partnerLeaves = state.leaves.filter(l => l.userId === partnerUser.id);
    const isOnLeaveToday = userLeaves.some(l => l.date === currentDate);
    const partnerOnLeaveToday = partnerLeaves.some(l => l.date === currentDate);

    const currentChallenge = (await getRuntimePool().query(
      `SELECT id FROM challenges WHERE start_date <= $1 AND end_date >= $1 ORDER BY start_date DESC LIMIT 1`,
      [currentDate],
    )).rows[0];
    const effectiveDates = currentChallenge
      ? await getParticipantEffectiveDates(getRuntimePool(), currentUser.id, currentChallenge.id)
      : new Map<number, string>();
    const effectiveDayNumber = Array.from(effectiveDates.entries()).find(([, date]) => date === currentDate)?.[0] || null;
    const isApprovedHoliday = isOnLeaveToday;
    const todayTask = isApprovedHoliday
      ? null
      : state.tasks.find(task => task.dayNumber === effectiveDayNumber) || null;
    const userEffectiveDayNumber = effectiveDayNumber;

    const todayDsa = todayTask
      ? state.dsaProblems.find(problem => problem.dayNumber === todayTask.dayNumber) || null
      : null;

    const todayMorningCheckin = await getWakeUpCheckin(getRuntimePool(), currentUser.id, currentDate);

    const taskStatus = todayTask
      ? state.taskStatuses.find(ts => ts.taskId === todayTask.id && ts.userId === currentUser.id)
      : null;

    const todaySectionStatuses = Object.fromEntries(
      DAILY_SCHEDULE_SECTIONS.map(section => [
        section,
        state.scheduleSectionStatuses.find(
          status => status.taskId === todayTask?.id && status.section === section && status.userId === currentUser.id
        ) || {
          taskId: todayTask?.id || '',
          section,
          userId: currentUser.id,
          status: 'PENDING',
          pointsAwarded: 0,
        },
      ])
    ) as Record<ScheduleSection, (typeof state.scheduleSectionStatuses)[number]>;
    const sectionValues = Object.values(todaySectionStatuses);
    const todayScheduleStatus = sectionValues.some(status => status.status === 'MISSED')
      ? 'MISSED'
      : sectionValues.every(status => status.status === 'COMPLETED_ON_TIME')
      ? 'COMPLETED_ON_TIME'
      : sectionValues.every(status => status.status === 'COMPLETED_ON_TIME' || status.status === 'COMPLETED_LATE')
      ? 'COMPLETED_LATE'
      : 'PENDING';

    const dsaAttempt = todayDsa
      ? state.dsaAttempts.find(a => a.problemId === todayDsa.id && a.userId === currentUser.id)
      : null;

    const notifications = state.notifications.filter(n => n.userId === currentUser.id);
    const pendingApprovalsForUser = state.permissions.filter(
      p => p.targetUserId === currentUser.id && p.status === 'PENDING'
    );

    // Check if reversal cooldown is active for today's task
    let isReversalBlocked = false;
    let reversalCooldownText: string | undefined = undefined;

    if (todayTask) {
      const activeCooldown = state.permissions.find(
        p =>
          p.requesterId === currentUser.id &&
          p.actionType === 'TASK_REVERSAL' &&
          p.entityId === todayTask.id &&
          p.status === 'DECLINED' &&
          p.declinedCooldownUntil &&
          new Date(p.declinedCooldownUntil).getTime() > Date.now()
      );

      if (activeCooldown && activeCooldown.declinedCooldownUntil) {
        isReversalBlocked = true;
        const diff = new Date(activeCooldown.declinedCooldownUntil).getTime() - Date.now();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        reversalCooldownText = `You can request again in ${hours}h ${minutes}m`;
      }
    }

    const { passwordHash: _p1, ...cleanCurrentUser } = currentUser;
    const { passwordHash: _p2, ...cleanPartnerUser } = partnerUser;
    const currentProfile = state.profiles?.[currentUser.id] || getDefaultProfile(currentUser);
    const partnerProfile = state.profiles?.[partnerUser.id] || getDefaultProfile(partnerUser);

    const [myCheckinStats, partnerCheckinStats] = await Promise.all([
      calculateCheckinStats(currentUser.id),
      calculateCheckinStats(partnerUser.id),
    ]);
    const myStreak = myCheckinStats.currentStreak;
    const daysUntilBonus = myStreak > 0 && myStreak % 7 === 0 ? 0 : 7 - (myStreak % 7);

    const dailyCheckinInfo = {
      myCheckin: myCheckinStats.todayCheckin,
      partnerCheckin: partnerCheckinStats.todayCheckin,
      myStreak: myCheckinStats.currentStreak,
      partnerStreak: partnerCheckinStats.currentStreak,
      hasCheckedInToday: myCheckinStats.hasCheckedInToday,
      partnerHasCheckedInToday: partnerCheckinStats.hasCheckedInToday,
      daysUntilBonus,
      totalCoins: myCheckinStats.totalCoins,
      partnerName: partnerUser.name,
    };

    const currentStats = currentUser.id === 'user-rahul' ? overview.rahul : overview.dileep;
    const partnerStats = currentUser.id === 'user-rahul' ? overview.dileep : overview.rahul;
    currentStats.morningCheckinStreak = currentWakeStats.currentStreak;
    currentStats.bestMorningCheckinStreak = currentWakeStats.bestStreak;
    currentStats.morningCheckinToday = todayMorningCheckin
      ? todayMorningCheckin.status as 'CHECKED_IN' | 'MISSED'
      : (overview.dayInfo.morningWindowStatus === 'CLOSED' ? 'MISSED' : 'PENDING');
    partnerStats.morningCheckinStreak = partnerWakeStats.currentStreak;
    partnerStats.bestMorningCheckinStreak = partnerWakeStats.bestStreak;

    res.json({
      ...overview,
      currentUser: cleanCurrentUser,
      partnerUser: cleanPartnerUser,
      profile: currentProfile,
      partnerProfile,
      rahulStats: overview.rahul,
      dileepStats: overview.dileep,
      currentUserStats: currentStats,
      partnerStats,
      todayTask,
      todayDsaProblem: todayDsa,
      todayTaskStatus: todayScheduleStatus,
      todayDsaSolved: dsaAttempt?.status === 'SOLVED',
      todaySectionStatuses,
      todayMorningCheckin,
      dailyCheckinInfo,
      userLeaves,
      partnerLeaves,
      leavesUsed: userLeaves.length,
      remainingLeaves: Math.max(0, 5 - userLeaves.length),
      isOnLeaveToday: isApprovedHoliday,
      partnerOnLeaveToday: isApprovedHoliday,
      userEffectiveDayNumber,
      notifications,
      pendingApprovalsForUser,
      isReversalBlocked,
      reversalCooldownText,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/tasks/:id/sections/:section/complete', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const result = await completeTaskSection(getRuntimePool(), userId, req.params.id, req.params.section);
    return res.json({ success: true, ...result });
  } catch (error) {
    const statusCode = error instanceof TaskCompletionError ? error.statusCode : 500;
    return res.status(statusCode).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

apiRouter.post('/tasks/:id/sections/:section/request-completion', async (req, res) => {
  const currentUser = requireAuthUser(req, res);
  if (!currentUser) return;
  const section = String(req.params.section || '').toUpperCase();
  if (!['DSA', 'JAVA', 'OS', 'DBMS'].includes(section)) return res.status(400).json({ error: 'Invalid curriculum section.' });
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 5) return res.status(400).json({ error: 'Please provide a clear reason for requesting late completion.' });

  try {
    const task = (await getRuntimePool().query(
      `SELECT ct.legacy_id, split_part(ct.legacy_id, '-', 1) || '-' || split_part(ct.legacy_id, '-', 2) || '-' || split_part(ct.legacy_id, '-', 3) AS "taskId", cd.curriculum_day_number AS "dayNumber", ct.title, cd.calendar_date::text AS date
       FROM curriculum_tasks ct JOIN challenge_days cd ON cd.id = ct.challenge_day_id
       WHERE ct.legacy_id = $1 LIMIT 1`,
      [`${req.params.id}-${section}`],
    )).rows[0];
    if (!task) return res.status(404).json({ error: 'Task not found in PostgreSQL.' });
    const currentDate = calculateDayInfo().currentDate;
    const taskChallenge = (await getRuntimePool().query(
      `SELECT challenge_id AS "challengeId" FROM curriculum_tasks WHERE legacy_id = $1 LIMIT 1`,
      [`${task.legacy_id}`],
    )).rows[0];
    const participantSchedule = taskChallenge
      ? await getParticipantEffectiveDates(getRuntimePool(), currentUser.id, taskChallenge.challengeId)
      : new Map<number, string>();
    const effectiveTaskDate = participantSchedule.get(Number(task.dayNumber)) || task.date;
    if (effectiveTaskDate >= currentDate) return res.status(400).json({ error: 'Only past scheduled tasks require late-completion approval.' });

    const entityId = `${task.taskId}::${section}`;
    const request = await createPermissionRequest(
      currentUser.id,
      'RETROACTIVE_COMPLETION',
      entityId,
      `${section} - ${task.title} (${effectiveTaskDate})`,
      reason,
    );
    return res.json({ success: true, message: 'Late-completion request sent to your partner.', request });
  } catch (error) {
    return res.status((error as any)?.statusCode || 400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

apiRouter.post('/tasks/:id/sections/:section/undo', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const result = await undoTaskSection(getRuntimePool(), userId, req.params.id, req.params.section);
    return res.json({ success: true, status: 'PENDING', ...result });
  } catch (error) {
    const statusCode = error instanceof TaskCompletionError ? error.statusCode : 500;
    return res.status(statusCode).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// ----------------------------------------------------------------------
// 2A. MORNING WAKE-UP CHECK-IN (04:00 AM - 05:00 AM IST)
// ----------------------------------------------------------------------
apiRouter.post('/morning/checkin', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const result = await recordWakeUpCheckin(getRuntimePool(), userId);
    return res.json({
      success: true,
      alreadyCheckedIn: result.alreadyCheckedIn,
      message: result.alreadyCheckedIn ? `Already checked in today at ${result.checkin.checkedInAt}.` : '🌅 Morning wake-up check-in verified! +2 discipline points awarded.',
      pointsAwarded: result.alreadyCheckedIn ? 0 : 2,
      streak: result.stats.currentStreak,
      checkin: result.checkin,
    });
  } catch (error) {
    const statusCode = error instanceof WakeUpCheckinError ? error.statusCode : 500;
    return res.status(statusCode).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

apiRouter.get('/morning/status', async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: 'Authentication required.' });
    const dayInfo = calculateDayInfo();
    const currentDate = dayInfo.currentDate;
    await settleMorningCheckinsForDate(currentDate);
    const checkin = await getWakeUpCheckin(getRuntimePool(), userId, currentDate);
    const stats = await getWakeUpStats(getRuntimePool(), userId);
    return res.json({
      date: currentDate,
      windowStatus: dayInfo.morningWindowStatus,
      windowOpensAt: '04:00 AM IST',
      windowClosesAt: '05:00 AM IST',
      istTime: dayInfo.istTime,
      checkin,
      wakeUpStreak: stats.currentStreak,
      bestWakeUpStreak: stats.bestStreak,
    });
  } catch (err: any) {
    const statusCode = err instanceof WakeUpCheckinError ? err.statusCode : 500;
    res.status(statusCode).json({ error: err.message });
  }
});

apiRouter.get('/morning/history', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const stats = await getWakeUpStats(getRuntimePool(), userId);
    return res.json({ history: stats.history, wakeUpStreak: stats.currentStreak, bestWakeUpStreak: stats.bestStreak });
  } catch (error) {
    const statusCode = error instanceof WakeUpCheckinError ? error.statusCode : 500;
    return res.status(statusCode).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// ----------------------------------------------------------------------
// 2A-2. GENERAL DAILY CHECK-IN BUTTON (+1 COIN, STREAK + 7-DAY BONUS)
// ----------------------------------------------------------------------
apiRouter.post('/checkin', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const result = await recordDailyCheckin(getRuntimePool(), userId);
    return res.json({
      success: !result.alreadyCheckedIn,
      alreadyCheckedIn: result.alreadyCheckedIn,
      message: result.alreadyCheckedIn ? 'You have already checked in today.' : 'Check-in confirmed! +1 Coin and streak updated.',
      streak: result.stats.currentStreak,
      coinsAwarded: result.alreadyCheckedIn ? 0 : 1,
      checkin: result.checkin,
      dailyCheckinInfo: { ...result.stats, myCheckin: result.checkin },
    });
  } catch (error) {
    const statusCode = error instanceof DailyActivityError ? error.statusCode : 500;
    return res.status(statusCode).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

apiRouter.get('/checkin/status', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const state = store.getState();
    const partner = state.users.find((user) => user.id !== userId) || state.users[1];
    const [mine, theirs] = await Promise.all([
      getDailyCheckinStats(getRuntimePool(), userId),
      getDailyCheckinStats(getRuntimePool(), partner.id),
    ]);
    return res.json({
      myCheckin: mine.todayCheckin,
      partnerCheckin: theirs.todayCheckin,
      myStreak: mine.currentStreak,
      partnerStreak: theirs.currentStreak,
      hasCheckedInToday: mine.hasCheckedInToday,
      partnerHasCheckedInToday: theirs.hasCheckedInToday,
      daysUntilBonus: mine.currentStreak > 0 && mine.currentStreak % 7 === 0 ? 0 : 7 - (mine.currentStreak % 7),
      totalCoins: mine.totalCoins,
      partnerName: partner.name,
    });
  } catch (error) {
    const statusCode = error instanceof DailyActivityError ? error.statusCode : 500;
    return res.status(statusCode).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

apiRouter.get('/leaves', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const state = store.getState();
    const partner = state.users.find((user) => user.id !== userId) || state.users[1];
    return res.json(await listLeaves(getRuntimePool(), userId, partner.id));
  } catch (error) {
    const statusCode = error instanceof DailyActivityError ? error.statusCode : 500;
    return res.status(statusCode).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

apiRouter.post('/leaves/apply', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const leave = await applyLeave(getRuntimePool(), userId, req.body.date || calculateDayInfo().currentDate, req.body.reason || 'Personal Rest / Holiday');
    return res.json({ success: true, message: 'Approved holiday applied.', leave, remainingLeaves: leave.remainingLeaves, leavesUsed: leave.leavesUsed });
  } catch (error) {
    const statusCode = error instanceof DailyActivityError ? error.statusCode : 500;
    return res.status(statusCode).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Compatibility aliases delegate to PostgreSQL-backed services.
apiRouter.post('/legacy/checkin', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const result = await recordDailyCheckin(getRuntimePool(), userId);
    return res.json({ success: !result.alreadyCheckedIn, alreadyCheckedIn: result.alreadyCheckedIn, checkin: result.checkin, dailyCheckinInfo: result.stats });
  } catch (error) { return res.status(error instanceof DailyActivityError ? error.statusCode : 500).json({ error: error instanceof Error ? error.message : String(error) }); }
});
apiRouter.get('/legacy/checkin/status', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const state = store.getState(); const partner = state.users.find(user => user.id !== userId) || state.users[1];
    const [mine, theirs] = await Promise.all([getDailyCheckinStats(getRuntimePool(), userId), getDailyCheckinStats(getRuntimePool(), partner.id)]);
    return res.json({ myCheckin: mine.todayCheckin, partnerCheckin: theirs.todayCheckin, myStreak: mine.currentStreak, partnerStreak: theirs.currentStreak, hasCheckedInToday: mine.hasCheckedInToday, partnerHasCheckedInToday: theirs.hasCheckedInToday, daysUntilBonus: mine.currentStreak > 0 && mine.currentStreak % 7 === 0 ? 0 : 7 - (mine.currentStreak % 7), totalCoins: mine.totalCoins, partnerName: partner.name });
  } catch (error) { return res.status(error instanceof DailyActivityError ? error.statusCode : 500).json({ error: error instanceof Error ? error.message : String(error) }); }
});
apiRouter.get('/legacy/leaves', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try { const state = store.getState(); const partner = state.users.find(user => user.id !== userId) || state.users[1]; return res.json(await listLeaves(getRuntimePool(), userId, partner.id)); }
  catch (error) { return res.status(error instanceof DailyActivityError ? error.statusCode : 500).json({ error: error instanceof Error ? error.message : String(error) }); }
});
apiRouter.post('/legacy/leaves/apply', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try { const leave = await applyLeave(getRuntimePool(), userId, req.body.date || calculateDayInfo().currentDate, req.body.reason || 'Personal Rest / Holiday'); return res.json({ success: true, leave, remainingLeaves: leave.remainingLeaves, leavesUsed: leave.leavesUsed }); }
  catch (error) { return res.status(error instanceof DailyActivityError ? error.statusCode : 500).json({ error: error instanceof Error ? error.message : String(error) }); }
});

// Older implementations below are retained only as unreachable source history.
apiRouter.post('/legacy/checkin', async (req, res) => {
  try {
    const user = requireAuthUser(req, res);
    if (!user) return;

    const state = store.getState();
    const dayInfo = calculateDayInfo();
    const currentDate = dayInfo.currentDate;

    state.dailyCheckins = state.dailyCheckins || [];
    state.pointLedger = state.pointLedger || [];
    state.notifications = state.notifications || [];
    state.auditLogs = state.auditLogs || [];

    // 1. Check if user already checked in today
    const existing = state.dailyCheckins.find(c => c.userId === user.id && c.date === currentDate);
    if (existing) {
      const myCheckinStats = await calculateCheckinStats(user.id);
      const partnerUser = state.users.find(u => u.id !== user.id) || state.users[1];
      const partnerCheckinStats = await calculateCheckinStats(partnerUser.id);
      const daysUntilBonus = myCheckinStats.currentStreak > 0 && myCheckinStats.currentStreak % 7 === 0 ? 0 : 7 - (myCheckinStats.currentStreak % 7);

      return res.json({
        success: false,
        alreadyCheckedIn: true,
        message: `You have already checked in today at ${existing.timeStr || existing.checkedInAt}! Streak is active.`,
        streak: existing.streakDay,
        coinsAwarded: 0,
        checkin: existing,
        dailyCheckinInfo: {
          myCheckin: existing,
          partnerCheckin: partnerCheckinStats.todayCheckin,
          myStreak: myCheckinStats.currentStreak,
          partnerStreak: partnerCheckinStats.currentStreak,
          hasCheckedInToday: true,
          partnerHasCheckedInToday: partnerCheckinStats.hasCheckedInToday,
          daysUntilBonus,
          totalCoins: myCheckinStats.totalCoins,
          partnerName: partnerUser.name,
        },
      });
    }

    // 2. Calculate new streak
    const yesterday = new Date(currentDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const yesterdayCheckin = state.dailyCheckins.find(c => c.userId === user.id && c.date === yesterdayStr);

    const newStreak = yesterdayCheckin ? (yesterdayCheckin.streakDay || 1) + 1 : 1;

    const is7DayBonus = false;
    const bonusPoints = 0;
    const totalCoinsForThisCheckin = 1;

    const nowIso = getISTNow().toISOString();
    const checkinRecord = {
      id: `checkin-${user.id}-${currentDate}-${Date.now()}`,
      userId: user.id,
      date: currentDate,
      checkedInAt: nowIso,
      timeStr: dayInfo.istTime,
      streakDay: newStreak,
      coinsAwarded: totalCoinsForThisCheckin,
      bonusAwarded: is7DayBonus,
      bonusPoints,
    };

    state.dailyCheckins.push(checkinRecord);

    // 4. Ledger entries
    const userEntries = state.pointLedger.filter(e => e.userId === user.id);
    let curPts = userEntries.reduce((s, e) => s + e.points, 0);

    // Base check-in: +1 Coin / Point
    state.pointLedger.push({
      id: `ledger-checkin-${user.id}-${Date.now()}`,
      userId: user.id,
      date: currentDate,
      timestamp: nowIso,
      eventType: 'DAILY_CHECKIN',
      points: 1,
      runningTotal: curPts + 1,
      reason: `Daily Check-In verified (+1 Coin, Streak: Day ${newStreak})`,
      category: 'DISCIPLINE',
    });
    curPts += 1;

    // 5. Audit log
    state.auditLogs.unshift({
      id: `audit-checkin-${Date.now()}`,
      actorId: user.id,
      actorName: user.name,
      action: 'DAILY_CHECKIN',
      targetType: 'STREAK_RECORD',
      targetId: currentDate,
      reason: is7DayBonus
        ? `Checked in for ${currentDate}. Earned +1 point. Streak: ${newStreak} days.`
        : `Checked in for ${currentDate}. Earned +1 Coin and incremented streak to ${newStreak} days.`,
      timestamp: nowIso,
    });

    // 6. Notifications for user and partner
    state.notifications.unshift({
      id: `notif-checkin-u-${Date.now()}`,
      userId: user.id,
      type: 'STREAK_MILESTONE',
      title: is7DayBonus
        ? `🎉 7-Day Streak Bonus! (+6 Points / Coins)`
        : `⚡ Checked In! (+1 Coin, Streak: Day ${newStreak})`,
      message: is7DayBonus
        ? `Incredible dedication! You maintained 7 continuous days of check-ins. +1 Coin + 5 bonus points awarded!`
        : `Daily check-in recorded at ${dayInfo.istTime} IST. Current streak: ${newStreak} consecutive days.`,
      read: false,
      createdAt: nowIso,
    });

    const partnerUser = state.users.find(u => u.id !== user.id) || state.users[1];
    if (partnerUser) {
      state.notifications.unshift({
        id: `notif-checkin-p-${Date.now()}`,
        userId: partnerUser.id,
        type: 'COMPETITION_ALERT',
        title: `⚡ ${user.name} Checked In (Streak: Day ${newStreak})`,
        message: `${user.name} checked in at ${dayInfo.istTime} IST with +1 Coin. They are now on a ${newStreak}-day streak!`,
        read: false,
        createdAt: nowIso,
      });
    }

    store.save();

    const [myCheckinStats, partnerCheckinStats] = await Promise.all([calculateCheckinStats(user.id), calculateCheckinStats(partnerUser.id)]);
    const daysUntilBonus = newStreak > 0 && newStreak % 7 === 0 ? 0 : 7 - (newStreak % 7);

    res.json({
      success: true,
      message: is7DayBonus
        ? `Check-in confirmed! +1 point awarded.`
        : `⚡ Check-In confirmed! +1 Coin and Streak +1 added.`,
      streak: newStreak,
      coinsAwarded: 1,
      bonusAwarded: is7DayBonus,
      bonusPoints,
      totalCoinsAwarded: totalCoinsForThisCheckin,
      checkin: checkinRecord,
      dailyCheckinInfo: {
        myCheckin: checkinRecord,
        partnerCheckin: partnerCheckinStats.todayCheckin,
        myStreak: newStreak,
        partnerStreak: partnerCheckinStats.currentStreak,
        hasCheckedInToday: true,
        partnerHasCheckedInToday: partnerCheckinStats.hasCheckedInToday,
        daysUntilBonus,
        totalCoins: myCheckinStats.totalCoins,
        partnerName: partnerUser.name,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/legacy/checkin/status', async (req, res) => {
  try {
    const user = requireAuthUser(req, res);
    if (!user) return;

    const state = store.getState();
    const partnerUser = state.users.find(u => u.id !== user.id) || state.users[1];

    const [myCheckinStats, partnerCheckinStats] = await Promise.all([calculateCheckinStats(user.id), calculateCheckinStats(partnerUser.id)]);
    const daysUntilBonus = myCheckinStats.currentStreak > 0 && myCheckinStats.currentStreak % 7 === 0 ? 0 : 7 - (myCheckinStats.currentStreak % 7);

    res.json({
      myCheckin: myCheckinStats.todayCheckin,
      partnerCheckin: partnerCheckinStats.todayCheckin,
      myStreak: myCheckinStats.currentStreak,
      partnerStreak: partnerCheckinStats.currentStreak,
      hasCheckedInToday: myCheckinStats.hasCheckedInToday,
      partnerHasCheckedInToday: partnerCheckinStats.hasCheckedInToday,
      daysUntilBonus,
      totalCoins: myCheckinStats.totalCoins,
      partnerName: partnerUser.name,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------
// 2B. LEAVES & HOLIDAY SHIFTING SYSTEM (5 DAYS TOTAL QUOTA)
// ----------------------------------------------------------------------
apiRouter.get('/legacy/leaves', (req, res) => {
  try {
    const user = requireAuthUser(req, res);
    if (!user) return;

    const state = store.getState();
    state.leaves = state.leaves || [];

    const partner = state.users.find(u => u.id !== user.id) || state.users[1];
    const userLeaves = state.leaves.filter(l => l.userId === user.id);
    const partnerLeaves = state.leaves.filter(l => l.userId === partner.id);

    res.json({
      userLeaves,
      partnerLeaves,
      leavesUsed: userLeaves.length,
      remainingLeaves: Math.max(0, 5 - userLeaves.length),
      partnerRemainingLeaves: Math.max(0, 5 - partnerLeaves.length),
      maxAllowed: 5,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/legacy/leaves/apply', (req, res) => {
  try {
    const user = requireAuthUser(req, res);
    if (!user) return;

    const state = store.getState();
    const dayInfo = calculateDayInfo();
    const { date, reason } = req.body;

    state.leaves = state.leaves || [];
    const targetDate = date || dayInfo.currentDate;

    const userLeaves = state.leaves.filter(l => l.userId === user.id);
    if (userLeaves.length >= 5) {
      return res.status(400).json({
        error: 'Leave quota exhausted! You have already taken the maximum 5 allowable holidays in this 100-day crucible.',
      });
    }

    if (userLeaves.some(l => l.date === targetDate)) {
      return res.status(400).json({
        error: `A holiday is already recorded for ${targetDate}.`,
      });
    }

    const nowIso = getISTNow().toISOString();
    const newLeave = {
      id: `leave-${user.id}-${Date.now()}`,
      userId: user.id,
      date: targetDate,
      appliedAt: nowIso,
      reason: reason || 'Personal Rest / Holiday',
    };

    state.leaves.push(newLeave);

    // Add ledger entry (0 points penalty, schedule shift)
    const userEntries = state.pointLedger.filter(e => e.userId === user.id);
    const curPts = userEntries.reduce((s, e) => s + e.points, 0);
    state.pointLedger.push({
      id: `ledger-leave-${Date.now()}`,
      userId: user.id,
      date: targetDate,
      timestamp: nowIso,
      eventType: 'LEAVE_HOLIDAY_APPLIED',
      points: 0,
      runningTotal: curPts,
      reason: `Approved Holiday (Day ${userLeaves.length + 1}/5). Task schedule shifted 1 day forward without point penalty.`,
      category: 'ADMIN',
    });

    const partner = state.users.find(u => u.id !== user.id);
    state.notifications.unshift({
      id: `notif-leave-${Date.now()}`,
      userId: user.id,
      type: 'APPROVAL_RESPONSE',
      title: `🏖️ Holiday Approved (${5 - (userLeaves.length + 1)} Leaves Left)`,
      message: `Your leave for ${targetDate} is active. Today's task has been shifted 1 day forward with zero point loss.`,
      read: false,
      createdAt: nowIso,
    });

    if (partner) {
      state.notifications.unshift({
        id: `notif-leave-p-${Date.now()}`,
        userId: partner.id,
        type: 'COMPETITION_ALERT',
        title: `🏖️ Partner On Approved Holiday`,
        message: `${user.name} is on approved holiday for ${targetDate} (${5 - (userLeaves.length + 1)} leaves left). Their task schedule shifts forward by 1 day.`,
        read: false,
        createdAt: nowIso,
      });
    }

    state.auditLogs.unshift({
      id: `audit-leave-${Date.now()}`,
      actorId: user.id,
      actorName: user.name,
      action: 'APPLY_HOLIDAY',
      targetType: 'LEAVE_QUOTA',
      targetId: targetDate,
      reason: `Holiday applied for ${targetDate}. Remaining leaves: ${5 - (userLeaves.length + 1)}. Schedule shifted forward.`,
      timestamp: nowIso,
    });

    store.save();

    res.json({
      success: true,
      message: `Approved holiday applied for ${targetDate}. Daily task schedule shifted forward by 1 day with zero penalty.`,
      leave: newLeave,
      remainingLeaves: 5 - (userLeaves.length + 1),
      leavesUsed: userLeaves.length + 1,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------
// 3. ROADMAP & CURRICULUM
// ----------------------------------------------------------------------
apiRouter.get('/roadmap', async (req, res) => {
  const currentUser = requireAuthUser(req, res);
  if (!currentUser) return;

  await store.refreshFromDatabase();
  const state = store.getState();
  const dayInfo = calculateDayInfo();
  const scheduleContext = await getRuntimePool().query(
    `SELECT ct.challenge_id AS "challengeId"
     FROM curriculum_tasks ct
     WHERE ct.legacy_id = $1
     LIMIT 1`,
    [`${state.tasks[0]?.id || ''}-DSA`],
  );
  const challengeId = scheduleContext.rows[0]?.challengeId as string | undefined;
  const effectiveDates = new Map<number, string>();
  if (challengeId) {
    const participant = await getRuntimePool().query(
      `SELECT id FROM participants WHERE legacy_id = $1 AND status = 'ACTIVE'`,
      [currentUser.id],
    );
    if (participant.rowCount) {
      const client = await getRuntimePool().connect();
      try {
        await client.query('BEGIN');
        await ensureParticipantSchedule(client, participant.rows[0].id, challengeId);
        const schedule = await client.query(
          `SELECT curriculum_day_number AS "dayNumber", effective_date::text AS date
           FROM participant_schedule_days WHERE participant_id = $1 AND challenge_id = $2`,
          [participant.rows[0].id, challengeId],
        );
        for (const row of schedule.rows) effectiveDates.set(Number(row.dayNumber), row.date);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  }
  const participantCurrentDayNumber = Array.from(effectiveDates.entries()).find(([, date]) => date === dayInfo.currentDate)?.[0] || dayInfo.dayNumber;

  // Annotate tasks with user status
  const tasksWithStatus = state.tasks.map(task => {
    const userStatus = state.taskStatuses.find(
      ts => ts.taskId === task.id && ts.userId === currentUser.id
    );
    const dsa = state.dsaProblems.find(d => d.dayNumber === task.dayNumber);
    const dsaAttempt = dsa
      ? state.dsaAttempts.find(a => a.problemId === dsa.id && a.userId === currentUser.id)
      : null;
    const sectionStatuses = Object.fromEntries(
      DAILY_SCHEDULE_SECTIONS.map(section => [
        section,
        state.scheduleSectionStatuses.find(
          status => status.taskId === task.id && status.section === section && status.userId === currentUser.id
        ) || { taskId: task.id, section, userId: currentUser.id, status: 'PENDING', pointsAwarded: 0 },
      ])
    );

    const effectiveDate = effectiveDates.get(task.dayNumber) || task.date;
    return {
      ...task,
      date: effectiveDate,
      dsaProblem: dsa,
      sectionStatuses,
      userStatus: userStatus?.status || 'PENDING',
      dsaSolved: dsaAttempt?.status === 'SOLVED',
      isCurrentDay: effectiveDate === dayInfo.currentDate,
      isLocked: effectiveDate > dayInfo.currentDate,
    };
  });

  const subjectPoints = Object.fromEntries(
    DAILY_SCHEDULE_SECTIONS.map(section => [
      section,
      state.pointLedger
        .filter(
          entry =>
            entry.userId === currentUser.id &&
            (entry.metadata?.section === section || (section === 'DSA' && entry.eventType === 'DSA_COMPLETED'))
        )
        .reduce((sum, entry) => sum + entry.points, 0),
    ])
  );

  res.json({
    totalDays: state.tasks.length,
    currentDayNumber: participantCurrentDayNumber,
    tasks: tasksWithStatus,
    subjectPoints,
  });
});

apiRouter.get('/roadmap/days/:day', async (req, res) => {
  const currentUser = requireAuthUser(req, res);
  if (!currentUser) return;

  const dayNum = parseInt(req.params.day, 10);
  await store.refreshFromDatabase();
  const state = store.getState();
  const dayInfo = calculateDayInfo();

  const task = state.tasks.find(t => t.dayNumber === dayNum);
  if (!task) {
    return res.status(404).json({ error: 'Day not found' });
  }

  const dsa = state.dsaProblems.find(d => d.dayNumber === dayNum);
  const userStatus = state.taskStatuses.find(
    ts => ts.taskId === task.id && ts.userId === currentUser.id
  );
  const partnerUser = state.users.find(u => u.id !== currentUser.id)!;
  const partnerStatus = state.taskStatuses.find(
    ts => ts.taskId === task.id && ts.userId === partnerUser.id
  );

  const dsaAttempt = dsa
    ? state.dsaAttempts.find(a => a.problemId === dsa.id && a.userId === currentUser.id)
    : null;

  // Check cooldown for reversal
  const cooldown = checkPermissionCooldown(currentUser.id, 'TASK_REVERSAL', task.id);

  res.json({
    task,
    dsa,
    dsaProblem: dsa,
    userStatus: userStatus?.status || 'PENDING',
    completedAt: userStatus?.completedAt,
    partnerStatus: partnerStatus?.status || 'PENDING',
    dsaAttempt,
    isCurrentDay: dayNum === dayInfo.dayNumber,
    isPastDay: dayNum < dayInfo.dayNumber,
    isFutureDay: dayNum > dayInfo.dayNumber,
    reversalCooldown: cooldown,
  });
});

// ----------------------------------------------------------------------
// 3B. COMPREHENSIVE HISTORICAL DAY ARCHIVE & CALENDAR OVERVIEW
// ----------------------------------------------------------------------
apiRouter.get('/history/calendar-overview', async (req, res) => {
  try {
    const currentUser = requireAuthUser(req, res);
    if (!currentUser) return;

    await store.refreshFromDatabase();
    const state = store.getState();
    const partnerUser = state.users.find(u => u.id !== currentUser.id) || state.users[1];
    const dayInfo = calculateDayInfo();

    state.tasks = state.tasks || [];
    state.taskStatuses = state.taskStatuses || [];
    state.journals = state.journals || [];
    state.pointLedger = state.pointLedger || [];
    state.dsaAttempts = state.dsaAttempts || [];
    const calendarChallenge = (await getRuntimePool().query(
      `SELECT challenge_id AS "challengeId" FROM curriculum_tasks WHERE legacy_id = $1 LIMIT 1`,
      [`${state.tasks[0]?.id || ''}-DSA`],
    )).rows[0];
    const effectiveDates = calendarChallenge
      ? await getParticipantEffectiveDates(getRuntimePool(), currentUser.id, calendarChallenge.challengeId)
      : new Map<number, string>();
    const participantCurrentDayNumber = Array.from(effectiveDates.entries())
      .find(([, date]) => date === dayInfo.currentDate)?.[0] || dayInfo.dayNumber;

    const days = state.tasks.map(task => {
      const date = effectiveDates.get(task.dayNumber) || task.date;
      const isPast = date < dayInfo.currentDate;
      const isCurrent = date === dayInfo.currentDate;
      const isFuture = date > dayInfo.currentDate;
      const isUnlocked = !isFuture;

      const myStatus = state.taskStatuses.find(
        ts => ts.taskId === task.id && ts.userId === currentUser.id
      );
      const partnerStatus = state.taskStatuses.find(
        ts => ts.taskId === task.id && ts.userId === partnerUser.id
      );

      const myJournal = state.journals.find(
        j => j.userId === currentUser.id && j.date === date
      );
      const partnerJournal = state.journals.find(
        j => j.userId === partnerUser.id && j.date === date
      );

      const myPoints = state.pointLedger
        .filter(e => e.userId === currentUser.id && e.date === date)
        .reduce((sum, e) => sum + e.points, 0);

      const partnerPoints = state.pointLedger
        .filter(e => e.userId === partnerUser.id && e.date === date)
        .reduce((sum, e) => sum + e.points, 0);

      return {
        dayNumber: task.dayNumber,
        date,
        title: task.title,
        category: task.category,
        priority: task.priority,
        isUnlocked,
        isPast,
        isCurrent,
        isFuture,
        myStatus: myStatus?.status || (isPast ? 'MISSED' : 'PENDING'),
        partnerStatus: partnerStatus?.status || (isPast ? 'MISSED' : 'PENDING'),
        hasMyJournal: !!myJournal,
        hasPartnerJournal: !!partnerJournal,
        myPoints,
        partnerPoints,
      };
    });

    res.json({
      currentDayNumber: participantCurrentDayNumber,
      currentDate: dayInfo.currentDate,
      totalDays: 100,
      challengeStartDate: dayInfo.challengeStartDate,
      days,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/day/:day', async (req, res) => {
  try {
    const currentUser = requireAuthUser(req, res);
    if (!currentUser) return;

    const dayNum = parseInt(req.params.day, 10);
    await store.refreshFromDatabase();
    const state = store.getState();
    const partnerUser = state.users.find(u => u.id !== currentUser.id) || state.users[1];
    const currentProfile = state.profiles?.[currentUser.id] || getDefaultProfile(currentUser);
    const partnerProfile = state.profiles?.[partnerUser.id] || getDefaultProfile(partnerUser);
    const dayInfo = calculateDayInfo();

    const task = state.tasks.find(t => t.dayNumber === dayNum);
    if (!task) {
      return res.status(404).json({ error: 'Day not found' });
    }

    const dayChallenge = (await getRuntimePool().query(
      `SELECT challenge_id AS "challengeId" FROM curriculum_tasks WHERE legacy_id = $1 LIMIT 1`,
      [`${task.id}-DSA`],
    )).rows[0];
    const effectiveDates = dayChallenge
      ? await getParticipantEffectiveDates(getRuntimePool(), currentUser.id, dayChallenge.challengeId)
      : new Map<number, string>();
    const effectiveDate = effectiveDates.get(dayNum) || task.date;
    const participantCurrentDayNumber = Array.from(effectiveDates.entries())
      .find(([, date]) => date === dayInfo.currentDate)?.[0] || dayInfo.dayNumber;
    const dsaProblem = state.dsaProblems.find(d => d.dayNumber === dayNum);
    const isPast = effectiveDate < dayInfo.currentDate;
    const isCurrent = effectiveDate === dayInfo.currentDate;
    const isFuture = effectiveDate > dayInfo.currentDate;

    // Task statuses
    const userTaskStatus = state.taskStatuses.find(
      ts => ts.taskId === task.id && ts.userId === currentUser.id
    );
    const partnerTaskStatus = state.taskStatuses.find(
      ts => ts.taskId === task.id && ts.userId === partnerUser.id
    );

    // DSA attempts
    const userDsaAttempt = dsaProblem
      ? state.dsaAttempts.find(a => a.problemId === dsaProblem.id && a.userId === currentUser.id)
      : undefined;
    const partnerDsaAttempt = dsaProblem
      ? state.dsaAttempts.find(a => a.problemId === dsaProblem.id && a.userId === partnerUser.id)
      : undefined;

    // Journals for this date
    state.journals = state.journals || [];
    const userJournal = state.journals.find(
      j => j.userId === currentUser.id && j.date === effectiveDate
    ) || null;
    const partnerJournal = state.journals.find(
      j => j.userId === partnerUser.id && j.date === effectiveDate
    ) || null;

    // Daily checkins
    state.dailyCheckins = state.dailyCheckins || [];
    const userCheckin = state.dailyCheckins.find(
      c => c.userId === currentUser.id && c.date === effectiveDate
    ) || null;
    const partnerCheckin = state.dailyCheckins.find(
      c => c.userId === partnerUser.id && c.date === effectiveDate
    ) || null;

    // Ledger entries on this day
    const userDayLedger = state.pointLedger.filter(
      e => e.userId === currentUser.id && e.date === effectiveDate
    );
    const partnerDayLedger = state.pointLedger.filter(
      e => e.userId === partnerUser.id && e.date === effectiveDate
    );

    const userDayPoints = userDayLedger.reduce((sum, e) => sum + e.points, 0);
    const partnerDayPoints = partnerDayLedger.reduce((sum, e) => sum + e.points, 0);

    const sectionRows = await getRuntimePool().query(
      `SELECT s.code AS section, tc.status AS "completionStatus",
              tc.points_awarded AS "pointsAwarded", tc.completed_at AS "completedAt",
              cr.external_id AS "requestId", cr.status AS "requestStatus",
              cr.requester_participant_id = requester.id AS "isRequester"
       FROM curriculum_tasks ct
       JOIN subjects s ON s.id = ct.subject_id
       JOIN participants requester ON requester.legacy_id = $1
       LEFT JOIN task_completions tc ON tc.curriculum_task_id = ct.id AND tc.participant_id = requester.id
       LEFT JOIN LATERAL (
         SELECT cr.external_id, cr.status, cr.requester_participant_id
         FROM change_requests cr
         WHERE cr.target_id = ct.id
           AND cr.target_type = 'RETROACTIVE_COMPLETION'
           AND cr.requester_participant_id = requester.id
         ORDER BY cr.created_at DESC
         LIMIT 1
       ) cr ON true
       WHERE ct.legacy_id LIKE $2
       ORDER BY s.code`,
      [currentUser.id, `${task.id}-%`],
    );
    const completionSections = Object.fromEntries(sectionRows.rows.map((row: any) => {
      const completed = row.completionStatus === 'COMPLETED_ON_TIME' || row.completionStatus === 'COMPLETED_LATE';
      const requestStatus = row.requestStatus === 'APPLIED' ? 'COMPLETED' : row.requestStatus || 'NONE';
      return [row.section, {
        section: row.section,
        status: completed ? 'COMPLETED' : requestStatus,
        requestId: row.requestId || null,
        pointsAwarded: Number(row.pointsAwarded || 0),
        completedAt: row.completedAt || null,
        canRequest: isPast && !completed && requestStatus === 'NONE',
        canComplete: isCurrent || (isPast && !completed && requestStatus === 'APPROVED' && row.isRequester),
      }];
    }));
    const existingRequest = completionSections.DSA?.status !== 'NONE'
      ? completionSections.DSA
      : null;
    const canRequestApproval = Boolean(completionSections.DSA?.canRequest);

    res.json({
      dayNumber: dayNum,
      date: effectiveDate,
      isPast,
      isCurrent,
      isFuture,
      isLocked: isFuture,
      currentDayNumber: participantCurrentDayNumber,
      task,
      dsaProblem,
      currentUser: {
        id: currentUser.id,
        name: currentUser.name,
        avatar: currentProfile.avatarUrl || currentUser.avatar,
        taskStatus: userTaskStatus?.status || (isPast ? 'MISSED' : 'PENDING'),
        completedAt: userTaskStatus?.completedAt,
        pointsAwarded: userTaskStatus?.pointsAwarded || 0,
        dsaAttempt: userDsaAttempt || null,
        journal: userJournal,
        checkin: userCheckin,
        dayPoints: userDayPoints,
        dayLedger: userDayLedger,
      },
      partnerUser: {
        id: partnerUser.id,
        name: partnerUser.name,
        avatar: partnerProfile.avatarUrl || partnerUser.avatar,
        taskStatus: partnerTaskStatus?.status || (isPast ? 'MISSED' : 'PENDING'),
        completedAt: partnerTaskStatus?.completedAt,
        pointsAwarded: partnerTaskStatus?.pointsAwarded || 0,
        dsaAttempt: partnerDsaAttempt || null,
        journal: partnerJournal,
        checkin: partnerCheckin,
        dayPoints: partnerDayPoints,
        dayLedger: partnerDayLedger,
      },
      completionSections,
      existingRequest,
      canRequestApproval,
      // Backward compatibility fields
      rahulStatus: (currentUser.id === 'user-rahul' ? userTaskStatus : partnerTaskStatus)?.status || (isPast ? 'MISSED' : 'PENDING'),
      dileepStatus: (currentUser.id === 'user-dileep' ? userTaskStatus : partnerTaskStatus)?.status || (isPast ? 'MISSED' : 'PENDING'),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Request partner approval for a past day's task that was left incomplete
apiRouter.post('/day/:day/request-approval', async (req, res) => {
  try {
    const dayNum = parseInt(req.params.day, 10);
    const { reason } = req.body;
    const section = String(req.body?.section || 'DSA').toUpperCase();
    const currentUser = requireAuthUser(req, res);
    if (!currentUser) return;
    const state = store.getState();
    const dayInfo = calculateDayInfo();

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'Please explain why you are requesting approval for this past task (min 5 characters).' });
    }

    if (!['DSA', 'JAVA', 'OS', 'DBMS'].includes(section)) {
      return res.status(400).json({ error: 'Invalid curriculum section.' });
    }

    const task = state.tasks.find(t => t.dayNumber === dayNum);
    if (!task) return res.status(404).json({ error: 'Day task not found' });

    if (dayNum >= dayInfo.dayNumber) {
      return res.status(400).json({ error: 'This task is active or upcoming today. Only past days require retroactive approval.' });
    }

    const userStatus = state.taskStatuses.find(
      ts => ts.taskId === task.id && ts.userId === currentUser.id
    );
    if (userStatus && (userStatus.status === 'COMPLETED_ON_TIME' || userStatus.status === 'COMPLETED_LATE')) {
      return res.status(400).json({ error: 'This task was already marked complete.' });
    }

    const sectionTask = (await getRuntimePool().query(
      `SELECT ct.legacy_id, ct.title, cd.calendar_date::text AS date
       FROM curriculum_tasks ct JOIN challenge_days cd ON cd.id = ct.challenge_day_id
       WHERE ct.legacy_id = $1 LIMIT 1`,
      [`${task.id}-${section}`],
    )).rows[0];
    if (!sectionTask) return res.status(404).json({ error: 'Task section not found in PostgreSQL.' });

    const request = await createPermissionRequest(
      currentUser.id,
      'RETROACTIVE_COMPLETION',
      `${task.id}::${section}`,
      `${section} - ${sectionTask.title} (${sectionTask.date})`,
      reason.trim()
    );

    res.json({
      success: true,
      message: `Approval request sent to your partner for Day ${dayNum}. Once approved, late completion (+2 pts) will be credited.`,
      request,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/future-schedule-request', async (req, res) => {
  try {
    const { entityId, entityType = 'TASK', proposedDay, reason } = req.body || {};
    const currentUser = requireAuthUser(req, res);
    if (!currentUser) {
      return;
    }

    if (!entityId || !proposedDay || !reason || String(reason).trim().length < 5) {
      return res.status(400).json({ error: 'A valid proposed day and clear reason are required.' });
    }

    const state = store.getState();
    const dayInfo = calculateDayInfo();
    const futureEntity = entityType === 'DSA'
      ? state.dsaProblems.find(item => item.id === entityId)
      : state.tasks.find(item => item.id === entityId);

    if (!futureEntity) {
      return res.status(404).json({ error: 'Future task or DSA item not found.' });
    }

    const proposedDayNumber = Number(proposedDay);
    if (!Number.isFinite(proposedDayNumber) || proposedDayNumber < 1 || proposedDayNumber > 100) {
      return res.status(400).json({ error: 'Requested day must be between 1 and 100.' });
    }

    if (futureEntity.dayNumber <= dayInfo.dayNumber) {
      return res.status(400).json({ error: 'Only future-unstarted items may be rescheduled through the mutual approval workflow.' });
    }

    const existingPending = state.permissions.find(
      p =>
        p.requesterId === currentUser.id &&
        p.entityId === entityId &&
        p.actionType === 'SCHEDULE_CHANGE' &&
        p.status === 'PENDING'
    );
    if (existingPending) {
      return res.status(409).json({ error: 'A change request for this future item is already awaiting approval.' });
    }

    const cooldown = checkPermissionCooldown(currentUser.id, 'SCHEDULE_CHANGE', entityId);
    if (cooldown.isBlocked) {
      return res.status(429).json({ error: `This request is blocked by the 12-hour cooldown. ${cooldown.remainingText}` });
    }

    const request = await createPermissionRequest(
      currentUser.id,
      'SCHEDULE_CHANGE',
      entityId,
      futureEntity.title || `Day ${futureEntity.dayNumber}`,
      String(reason).trim(),
      {
        entityType: entityType === 'DSA' ? 'DSA' : 'TASK',
        oldValue: `Day ${futureEntity.dayNumber}`,
        proposedValue: `Day ${proposedDayNumber}`,
      }
    );

    res.json({
      success: true,
      message: 'Future schedule change request submitted. It remains pending mutual approval until the partner reviews it.',
      request,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------
// 4. DAILY TASKS & COMPLETIONS
// ----------------------------------------------------------------------
apiRouter.get('/tasks/today', async (req, res) => {
  const currentUser = requireAuthUser(req, res);
  if (!currentUser) return;

  await store.refreshFromDatabase();
  const state = store.getState();
  const dayInfo = calculateDayInfo();

  const task = state.tasks.find(t => t.date === dayInfo.currentDate);
  if (!task) return res.status(404).json({ error: 'Today task not found' });

  const status = state.taskStatuses.find(
    ts => ts.taskId === task.id && ts.userId === currentUser.id
  );
  const cooldown = checkPermissionCooldown(currentUser.id, 'TASK_REVERSAL', task.id);

  res.json({
    task,
    status: status?.status || 'PENDING',
    completedAt: status?.completedAt,
    pointsAwarded: status?.pointsAwarded || 0,
    windowStatus: dayInfo.windowStatus,
    cooldown,
  });
});

// Mark Task Complete (Section 19, 20)
apiRouter.post('/tasks/:id/complete', async (req, res) => {
  const { confirmed } = req.body;
  if (!confirmed) {
    return res.status(400).json({
      error: 'Confirmation required: Must explicitly confirm task completion.',
    });
  }

  const taskId = req.params.id;
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const result = await completeTask(getRuntimePool(), userId, taskId);
    return res.json({ success: true, message: 'Completion permanently recorded.', ...result });
  } catch (error) {
    const statusCode = error instanceof TaskCompletionError ? error.statusCode : 500;
    return res.status(statusCode).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Reversal Request (Section 21)
const handleReversalRequest = async (req: any, res: any) => {
  const currentUser = requireAuthUser(req, res);
  if (!currentUser) return;

  const { reason } = req.body;
  if (!reason || reason.trim().length < 5) {
    return res.status(400).json({ error: 'Please provide a clear reason for requesting reversal.' });
  }

  const taskId = req.params.id;
  const state = store.getState();

  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const status = state.taskStatuses.find((entry) => entry.taskId === taskId && entry.userId === currentUser.id);
  if (!status || (status.status !== 'COMPLETED_ON_TIME' && status.status !== 'COMPLETED_LATE')) {
    return res.status(400).json({ error: 'Only completed tasks can be submitted for reversal.' });
  }

  try {
    const request = await createPermissionRequest(
      currentUser.id,
      'TASK_REVERSAL',
      taskId,
      task.title,
      reason
    );
    res.json({
      success: true,
      message: 'Reversal request submitted to your partner for mutual approval.',
      request,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

apiRouter.post('/tasks/:id/reversal-request', async (req, res) => await handleReversalRequest(req, res));
apiRouter.post('/tasks/:id/reversal', async (req, res) => await handleReversalRequest(req, res));

// ----------------------------------------------------------------------
// 5. DSA PROBLEM SOLVING
// ----------------------------------------------------------------------
apiRouter.get('/dsa/today', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const state = store.getState();
    const currentDate = calculateDayInfo().currentDate;
    const challenge = (await getRuntimePool().query(
      `SELECT challenge_id AS "challengeId" FROM dsa_problems WHERE legacy_id = $1 LIMIT 1`,
      [state.dsaProblems[0]?.id],
    )).rows[0];
    const effectiveDates = challenge
      ? await getParticipantEffectiveDates(getRuntimePool(), userId, challenge.challengeId)
      : new Map<number, string>();
    const currentDay = Array.from(effectiveDates.entries()).find(([, date]) => date === currentDate)?.[0];
    const problem = state.dsaProblems.find((item) => item.dayNumber === currentDay);
    if (!problem) return res.status(404).json({ error: 'No DSA problem found for today' });
    const attempt = await getDsaAttempt(getRuntimePool(), userId, problem.id);
    return res.json({ problem, attempt, isSolved: attempt?.status === 'SOLVED' });
  } catch (error) {
    const statusCode = error instanceof DsaServiceError ? error.statusCode : 500;
    return res.status(statusCode).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

apiRouter.post('/dsa/:id/attempt', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const problemId = req.params.id || req.body.problemId;
    const result = await recordDsaAttempt(getRuntimePool(), userId, problemId, req.body.status || 'SOLVED', req.body.timeTakenMinutes, req.body.notes, req.body.codeSnippet);
    return res.json({ success: true, attempt: result.attempt, pointsAwarded: result.pointsAwarded, message: result.pointsAwarded ? `DSA problem solved! (+${result.pointsAwarded} pts)` : 'Attempt recorded.' });
  } catch (error) {
    const statusCode = error instanceof DsaServiceError ? error.statusCode : 500;
    return res.status(statusCode).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

apiRouter.post('/dsa/attempt', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const result = await recordDsaAttempt(getRuntimePool(), userId, req.body.problemId, req.body.status || 'SOLVED', req.body.timeTakenMinutes, req.body.notes, req.body.codeSnippet);
    return res.json({ success: true, attempt: result.attempt, pointsAwarded: result.pointsAwarded, message: result.pointsAwarded ? `DSA problem solved! (+${result.pointsAwarded} pts)` : 'Attempt recorded.' });
  } catch (error) {
    const statusCode = error instanceof DsaServiceError ? error.statusCode : 500;
    return res.status(statusCode).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

apiRouter.get('/legacy/dsa/today', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const day = calculateDayInfo().dayNumber;
    const problem = (await getRuntimePool().query(
      `SELECT dp.legacy_id AS id, dp.title, dp.category, dp.difficulty, dp.points, dp.leetcode_url AS "leetcodeUrl", dp.description, dp.approach, dp.time_complexity AS "timeComplexity", dp.space_complexity AS "spaceComplexity"
       FROM dsa_problems dp JOIN challenge_days cd ON cd.id=dp.challenge_day_id WHERE cd.curriculum_day_number=$1`, [day]
    )).rows[0];
    if (!problem) return res.status(404).json({ error: 'No DSA problem found for today' });
    const attempt = await getDsaAttempt(getRuntimePool(), userId, problem.id);
    return res.json({ problem, attempt, isSolved: attempt?.status === 'SOLVED' });
  } catch (error) { return res.status(error instanceof DsaServiceError ? error.statusCode : 500).json({ error: error instanceof Error ? error.message : String(error) }); }
});
apiRouter.get('/legacy/dsa/today', (req, res) => {
  const currentUser = requireAuthUser(req, res);
  if (!currentUser) return;

  const state = store.getState();
  const dayInfo = calculateDayInfo();

  const problem = state.dsaProblems.find(p => p.date === dayInfo.currentDate);
  if (!problem) return res.status(404).json({ error: 'No DSA problem found for today' });

  const attempt = state.dsaAttempts.find(
    a => a.problemId === problem.id && a.userId === currentUser.id
  );

  res.json({
    problem,
    attempt: attempt || null,
    isSolved: attempt?.status === 'SOLVED',
  });
});

const handleDsaAttempt = (req: any, res: any) => {
  const currentUser = requireAuthUser(req, res);
  if (!currentUser) return;

  const problemId = req.params.id || req.body.problemId;
  const { status, timeTakenMinutes, notes, codeSnippet } = req.body;
  const state = store.getState();
  const dayInfo = calculateDayInfo();

  const problem = state.dsaProblems.find(p => p.id === problemId);
  if (!problem) return res.status(404).json({ error: 'DSA problem not found' });

  let attempt = state.dsaAttempts.find(
    a => a.problemId === problemId && a.userId === currentUser.id
  );

  const wasAlreadySolved = attempt?.status === 'SOLVED';
  const nowIso = getISTNow().toISOString();

  if (status === 'SOLVED' && !wasAlreadySolved) {
    // Award points based on problem difficulty
    const userEntries = state.pointLedger.filter((entry) => entry.userId === currentUser.id);
    const currentRunning = userEntries.reduce((acc, entry) => acc + entry.points, 0);

    state.pointLedger.push({
      id: `ledger-dsa-${Date.now()}`,
      userId: currentUser.id,
      date: dayInfo.currentDate,
      timestamp: nowIso,
      eventType: 'DSA_COMPLETED',
      points: problem.points,
      runningTotal: currentRunning + problem.points,
      sourceTaskId: problem.id,
      sourceTaskTitle: problem.title,
      category: 'DSA',
      reason: `Solved DSA Problem: ${problem.title} (${problem.difficulty} - +${problem.points} pts)`,
    });
  }

  if (attempt) {
    attempt.status = status;
    attempt.timeTakenMinutes = timeTakenMinutes || attempt.timeTakenMinutes;
    attempt.notes = notes !== undefined ? notes : attempt.notes;
    attempt.codeSnippet = codeSnippet !== undefined ? codeSnippet : attempt.codeSnippet;
    attempt.solvedAt = nowIso;
  } else {
    attempt = {
      id: `attempt-${Date.now()}`,
      problemId,
      userId: currentUser.id,
      date: dayInfo.currentDate,
      status: status || 'SOLVED',
      timeTakenMinutes: timeTakenMinutes || 30,
      notes: notes || '',
      codeSnippet: codeSnippet || '',
      solvedAt: nowIso,
    };
    state.dsaAttempts.push(attempt);
  }

  store.save();

  res.json({
    success: true,
    attempt,
    pointsAwarded: status === 'SOLVED' && !wasAlreadySolved ? problem.points : 0,
    message: status === 'SOLVED' ? `DSA problem solved! (+${problem.points} pts)` : 'Attempt recorded.',
  });
};

apiRouter.post('/legacy/dsa/:id/attempt', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try { const result = await recordDsaAttempt(getRuntimePool(), userId, req.params.id, req.body.status || 'SOLVED', req.body.timeTakenMinutes, req.body.notes, req.body.codeSnippet); return res.json({ success: true, attempt: result.attempt, pointsAwarded: result.pointsAwarded }); }
  catch (error) { return res.status(error instanceof DsaServiceError ? error.statusCode : 500).json({ error: error instanceof Error ? error.message : String(error) }); }
});
apiRouter.post('/legacy/dsa/attempt', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try { const result = await recordDsaAttempt(getRuntimePool(), userId, req.body.problemId, req.body.status || 'SOLVED', req.body.timeTakenMinutes, req.body.notes, req.body.codeSnippet); return res.json({ success: true, attempt: result.attempt, pointsAwarded: result.pointsAwarded }); }
  catch (error) { return res.status(error instanceof DsaServiceError ? error.statusCode : 500).json({ error: error instanceof Error ? error.message : String(error) }); }
});

// ----------------------------------------------------------------------
// 6. SCORE LEDGER (Section 26)
// ----------------------------------------------------------------------
const handleGetLedger = (req: any, res: any) => {
  const state = store.getState();
  const { eventType } = req.query;

  const competitionUserIds = new Set(['user-rahul', 'user-dileep']);
  let entries = state.pointLedger.filter((entry: any) => competitionUserIds.has(entry.userId));

  if (eventType) {
    entries = entries.filter((e: any) => e.eventType === eventType);
  }

  entries.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  res.json({
    totalEntries: entries.length,
    entries,
  });
};

apiRouter.get('/points/history', async (req, res) => {
  const userId = getSessionUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try { const entries = await listLedger(getRuntimePool(), userId, typeof req.query.eventType === 'string' ? req.query.eventType : undefined); return res.json({ totalEntries: entries.length, entries }); }
  catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : String(error) }); }
});
apiRouter.get('/ledger', async (req, res) => {
  const userId = getSessionUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try { const entries = await listLedger(getRuntimePool(), userId, typeof req.query.eventType === 'string' ? req.query.eventType : undefined); return res.json({ totalEntries: entries.length, entries }); }
  catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : String(error) }); }
});

// ----------------------------------------------------------------------
// 7. HABIT & SELF-CONTROL TRACKER (Sections 28 & 29)
// ----------------------------------------------------------------------
const handleGetHabits = async (req: any, res: any) => {
  const currentUser = requireAuthUser(req, res);
  if (!currentUser) return;

  const state = store.getState();

  const userStats = await calculateHabitStats(currentUser.id);
  const partnerUser = state.users.find(u => u.id !== currentUser.id)!;
  const partnerStats = await calculateHabitStats(partnerUser.id);

  // Private history for current user only
  const myHistory = state.habits
    .filter(h => h.userId === currentUser.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  // Today's entry
  const dayInfo = calculateDayInfo();
  const todayEntry = state.habits.find(
    h => h.userId === currentUser.id && h.date === dayInfo.currentDate
  );

  let habitLeaderName = 'Tied';
  const diffDays = Math.abs(userStats.currentStreak - partnerStats.currentStreak);
  let comparisonText = 'Streaks are currently tied.';

  if (userStats.currentStreak > partnerStats.currentStreak) {
    habitLeaderName = currentUser.name;
    comparisonText = `${currentUser.name} is ahead by ${diffDays} day${diffDays === 1 ? '' : 's'}`;
  } else if (partnerStats.currentStreak > userStats.currentStreak) {
    habitLeaderName = partnerUser.name;
    comparisonText = `${partnerUser.name} is ahead by ${diffDays} day${diffDays === 1 ? '' : 's'}`;
  }

  res.json({
    myStats: userStats,
    partnerStreak: partnerStats.currentStreak,
    partnerCleanDays: partnerStats.totalCleanDays,
    partnerName: partnerUser.name,
    habitLeaderName,
    diffDays,
    comparisonText,
    todayRecorded: !!todayEntry,
    todayStatus: todayEntry?.status || null,
    history: myHistory,
  });
};

apiRouter.get('/habits', async (req, res, next) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const state = store.getState(); const partner = state.users.find((user) => user.id !== userId) || state.users[1];
    const result = await getHabitData(getRuntimePool(), userId, partner.id);
    const habitLeaderName = result.myStats.currentStreak === result.partnerStats.currentStreak ? null : result.myStats.currentStreak > result.partnerStats.currentStreak ? userId === 'user-rahul' ? 'Rahul' : 'Dileep' : partner.name;
    return res.json({ myStats: result.myStats, partnerStreak: result.partnerStats.currentStreak, partnerBestStreak: result.partnerStats.bestStreak, partnerCleanDays: result.partnerStats.totalCleanDays, partnerName: partner.name, habitLeaderName, diffDays: Math.abs(result.myStats.currentStreak - result.partnerStats.currentStreak), comparisonText: habitLeaderName ? `${habitLeaderName} leads the self-control streak.` : 'Self-control streaks are tied.', todayRecorded: Boolean(result.today), todayStatus: result.today?.status || null, history: result.history });
  } catch (error) { return next(error); }
});
apiRouter.get('/habit', (_req, res) => res.redirect(307, '/api/habits'));

const handleHabitCheckin = async (req: any, res: any) => {
  const currentUser = requireAuthUser(req, res);
  if (!currentUser) return;

  const { status, confirmed, notes } = req.body;
  if (!confirmed) {
    return res.status(400).json({ error: 'Confirmation required before recording today\'s self-control status.' });
  }
  if (status !== 'REPORTED_RELAPSE') {
    return res.status(400).json({ error: 'Only a confirmed REPORTED_RELAPSE is accepted for the current day.' });
  }

  const state = store.getState();
  const dayInfo = calculateDayInfo();
  const nowIso = getISTNow().toISOString();

  let todayEntry = state.habits.find(
    h => h.userId === currentUser.id && h.date === dayInfo.currentDate
  );

  if (todayEntry) {
    if (todayEntry.status === 'REPORTED_RELAPSE') {
      return res.status(409).json({ error: 'Today\'s self-control status has already been recorded.' });
    }
    todayEntry.status = 'REPORTED_RELAPSE';
    todayEntry.notes = notes || todayEntry.notes;
    todayEntry.recordedAt = nowIso;
  } else {
    todayEntry = {
      id: `habit-${Date.now()}`,
      userId: currentUser.id,
      date: dayInfo.currentDate,
      status: 'REPORTED_RELAPSE',
      notes: notes || '',
      recordedAt: nowIso,
    };
    state.habits.push(todayEntry);
  }

  const updatedStats = await calculateHabitStats(currentUser.id);
  store.save();

  res.json({
    success: true,
    message: 'Today\'s status has been recorded. Your streak will reset when today\'s challenge day is finalized at midnight.',
    stats: updatedStats,
  });
};

apiRouter.post('/habits/check-in', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  if (req.body.participantId !== undefined && req.body.participantId !== userId) {
    return res.status(403).json({ error: 'Participant identity is controlled by the authenticated session.' });
  }
  if (req.body.streak !== undefined || req.body.currentStreak !== undefined || req.body.bestStreak !== undefined) {
    return res.status(400).json({ error: 'Streak values are calculated by the server.' });
  }
  if (!req.body.confirmed || req.body.status !== 'REPORTED_RELAPSE') return res.status(400).json({ error: 'Confirmation required before recording today\'s self-control status.' });
  try { const result = await recordRelapse(getRuntimePool(), userId, req.body.notes || ''); return res.json({ success: true, message: 'Today\'s status has been recorded.', stats: result.myStats }); }
  catch (error) { const statusCode = error instanceof HabitJournalError ? error.statusCode : 500; return res.status(statusCode).json({ error: error instanceof Error ? error.message : String(error) }); }
});
apiRouter.post('/habit/checkin', (_req, res) => res.redirect(307, '/api/habits/check-in'));
apiRouter.post('/habits/checkin', (_req, res) => res.redirect(307, '/api/habits/check-in'));

// ----------------------------------------------------------------------
// 8. DAILY JOURNAL & ROUTINE (Section 27)
// ----------------------------------------------------------------------
const getJournalLockState = (journalDate: string) => {
  const now = getISTNow();
  const editingDeadline = new Date(`${journalDate}T23:59:59.999+05:30`);
  const isLocked = now.getTime() >= editingDeadline.getTime();

  return {
    currentServerTime: now.toISOString(),
    journalDate,
    journalStatus: isLocked ? 'LOCKED' : 'OPEN',
    editingDeadline: editingDeadline.toISOString(),
    isLocked,
  };
};

const handleGetJournal = (req: any, res: any) => {
  const currentUser = requireAuthUser(req, res);
  if (!currentUser) return;

  const state = store.getState();
  const dayInfo = calculateDayInfo();
  const targetDate = (req.query.date as string) || dayInfo.currentDate;
  const lockState = getJournalLockState(targetDate);

  const journal = state.journals.find(
    j => j.userId === currentUser.id && j.date === targetDate
  ) || {
    id: '',
    userId: currentUser.id,
    date: targetDate,
    todayRoutine: '',
    summary: '',
    whatILearned: '',
    whatIBuilt: '',
    whatIStruggledWith: '',
    mistakes: '',
    mistakesLessons: '',
    tomorrowImprovements: '',
    tomorrowFocus: '',
    additionalNotes: '',
    studyHours: 3.0,
    focusedExecutionMinutes: undefined,
    focusedExecutionFinalizedAt: undefined,
    energyRating: 4,
    productivityRating: 4,
    isShared: true,
    status: 'OPEN',
    updatedAt: '',
  };

  const partnerUser = state.users.find(u => u.id !== currentUser.id);
  const partnerJournal = partnerUser
    ? state.journals.find(j => j.userId === partnerUser.id && j.date === targetDate)
    : null;

  res.json({
    journal,
    partnerJournal,
    ...lockState,
  });
};

apiRouter.get('/journal/today', async (req, res) => {
  const userId = getSessionUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try { const state = store.getState(); const partner = state.users.find((user) => user.id !== userId) || state.users[1]; const date = (req.query.date as string) || calculateDayInfo().currentDate; const result = await getJournalData(getRuntimePool(), userId, partner.id, date); const isLocked = result.journal.status !== 'OPEN'; return res.json({ ...result, journalStatus: result.journal.status, journalDate: result.journal.date, currentServerTime: getISTNow().toISOString(), isLocked }); }
  catch (error) { const statusCode = error instanceof HabitJournalError ? error.statusCode : 500; return res.status(statusCode).json({ error: error instanceof Error ? error.message : String(error) }); }
});
apiRouter.get('/journal', async (req, res) => {
  const userId = getSessionUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try { const state = store.getState(); const partner = state.users.find((user) => user.id !== userId) || state.users[1]; const date = (req.query.date as string) || calculateDayInfo().currentDate; const result = await getJournalData(getRuntimePool(), userId, partner.id, date); const isLocked = result.journal.status !== 'OPEN'; return res.json({ ...result, journalStatus: result.journal.status, journalDate: result.journal.date, currentServerTime: getISTNow().toISOString(), isLocked }); }
  catch (error) { const statusCode = error instanceof HabitJournalError ? error.statusCode : 500; return res.status(statusCode).json({ error: error instanceof Error ? error.message : String(error) }); }
});

apiRouter.post('/todays-live/:id/focused-execution/finalize', async (req, res) => {
  const userId = getSessionUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  const minutes = Number(req.body?.focusedExecutionMinutes);
  if (!Number.isFinite(minutes) || minutes < 0) return res.status(400).json({ error: 'Focused execution minutes must be a non-negative number.' });
  try {
    const result = await getRuntimePool().query(
      `UPDATE todays_live tl SET focused_execution_minutes = $3, focused_execution_finalized = true, focused_execution_finalized_at = COALESCE(focused_execution_finalized_at, $4), status = 'SUBMITTED', updated_at = $4
       FROM participants p WHERE tl.participant_id = p.id AND p.legacy_id = $1 AND tl.id = $2 AND tl.focused_execution_finalized = false
       RETURNING tl.focused_execution_minutes AS "focusedExecutionMinutes", tl.focused_execution_finalized_at AS "finalizedAt"`,
      [userId, req.params.id, minutes, getISTNow().toISOString()]
    );
    if (!result.rowCount) return res.status(409).json({ error: 'Focused execution has already been finalized or the record was not found.' });
    return res.json({ success: true, message: 'Focused execution permanently recorded.', ...result.rows[0] });
  } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : String(error) }); }
});

apiRouter.post('/legacy/todays-live/:id/focused-execution/finalize', (req, res) => {
  const currentUser = requireAuthUser(req, res);
  if (!currentUser) return;

  const journal = store.getState().journals.find(
    j => j.userId === currentUser.id && j.id === req.params.id,
  );

  if (!journal) {
    return res.status(404).json({ error: 'Today\'s Live record not found.' });
  }

  const { focusedExecutionMinutes } = req.body || {};
  const finalizeResult = finalizeFocusedExecution(
    journal,
    focusedExecutionMinutes,
    getISTNow().toISOString(),
  );

  if (!finalizeResult.ok) {
    return res.status(finalizeResult.code || 400).json({
      error: finalizeResult.message || 'Focused execution cannot be finalized.',
    });
  }

  journal.status = 'SUBMITTED';
  journal.submittedAt = journal.submittedAt || getISTNow().toISOString();
  store.save();

  return res.status(200).json({
    success: true,
    message: 'Focused execution permanently recorded.',
    focusedExecutionMinutes: finalizeResult.finalizedMinutes,
    finalizedAt: finalizeResult.finalizedAt,
  });
});

apiRouter.post('/journal', async (req, res) => {
  const userId = getSessionUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try { const date = req.body.date || calculateDayInfo().currentDate; const journal = await saveJournal(getRuntimePool(), userId, date, req.body); return res.json({ success: true, message: 'Today\'s Live saved securely and locked.', journal, journalDate: journal.date, journalStatus: journal.status, isLocked: true }); }
  catch (error) { const statusCode = error instanceof HabitJournalError ? error.statusCode : 500; return res.status(statusCode).json({ error: error instanceof Error ? error.message : String(error) }); }
});

apiRouter.post('/journal/reset-request', async (req, res) => {
  const userId = getSessionUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  const date = typeof req.body?.date === 'string' ? req.body.date : calculateDayInfo().currentDate;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 5) return res.status(400).json({ error: 'Please provide a clear reason for requesting an entry reset.' });
  try {
    const row = await getRuntimePool().query(
      `SELECT tl.id, tl.status FROM todays_live tl JOIN participants p ON p.id = tl.participant_id JOIN challenge_days cd ON cd.id = tl.challenge_day_id WHERE p.legacy_id = $1 AND cd.calendar_date = $2`,
      [userId, date]
    );
    if (row.rowCount !== 1) return res.status(404).json({ error: 'Daily entry not found.' });
    if (row.rows[0].status === 'OPEN') return res.status(400).json({ error: 'This daily entry is already unlocked.' });
    const state = store.getState();
    const partner = state.users.find(user => user.id !== userId);
    if (!partner) return res.status(404).json({ error: 'Partner not found.' });
    const request = await createPermissionRequest(userId, 'RESET_ENTRY', row.rows[0].id, `Daily entry: ${date}`, reason, { entityType: 'STUDY_SCHEDULE', oldValue: 'LOCKED', proposedValue: 'OPEN' });
    return res.json({ success: true, message: 'Reset request sent to your partner for approval.', request });
  } catch (error) { const statusCode = error instanceof HabitJournalError ? error.statusCode : (error as { statusCode?: number })?.statusCode || 400; return res.status(statusCode).json({ error: error instanceof Error ? error.message : String(error) }); }
});

apiRouter.post('/legacy/journal', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const date = req.body.date || calculateDayInfo().currentDate;
    const journal = await saveJournal(getRuntimePool(), userId, date, req.body);
    return res.json({ success: true, message: "Today's Live saved securely.", journal, journalDate: journal.date, journalStatus: journal.status, isLocked: false });
  } catch (error) { return res.status(error instanceof HabitJournalError ? error.statusCode : 500).json({ error: error instanceof Error ? error.message : String(error) }); }
});
apiRouter.post('/legacy/journal', (req, res) => {
  const currentUser = requireAuthUser(req, res);
  if (!currentUser) return;

  const state = store.getState();
  const dayInfo = calculateDayInfo();
  const nowIso = getISTNow().toISOString();
  const { summary, todayRoutine, whatILearned, whatIBuilt, whatIStruggledWith, mistakes, mistakesLessons, tomorrowImprovements, tomorrowFocus, additionalNotes, studyHours, focusedExecutionMinutes, energyRating, productivityRating, isShared, status, submittedAt } = req.body;
  const targetDate = req.body.date || dayInfo.currentDate;

  let journal = state.journals.find(
    j => j.userId === currentUser.id && j.date === targetDate
  );

  const lockState = getJournalLockState(targetDate);
  if (journal && (journal.status === 'LOCKED' || lockState.isLocked)) {
    return res.status(403).json({
      error: 'Today\'s Live for this date is locked and can no longer be edited.',
      ...lockState,
      journalStatus: journal.status || lockState.journalStatus,
    });
  }

  if (journal && (journal.focusedExecutionFinalized || journal.focusedExecutionFinalizedAt)) {
    if (focusedExecutionMinutes !== undefined) {
      return res.status(409).json({
        error: 'Focused Execution Hours have already been permanently recorded for this day. They cannot be changed.',
        ...lockState,
        journalStatus: journal.status || 'SUBMITTED',
      });
    }
  }

  if (journal) {
    journal.summary = summary ?? todayRoutine ?? journal.summary ?? journal.todayRoutine ?? '';
    journal.todayRoutine = todayRoutine ?? journal.todayRoutine ?? journal.summary ?? '';
    journal.whatILearned = whatILearned ?? journal.whatILearned ?? '';
    journal.whatIBuilt = whatIBuilt ?? journal.whatIBuilt ?? '';
    journal.whatIStruggledWith = whatIStruggledWith ?? journal.whatIStruggledWith ?? '';
    journal.mistakes = mistakes ?? journal.mistakes ?? '';
    journal.mistakesLessons = mistakesLessons ?? journal.mistakesLessons ?? '';
    journal.tomorrowImprovements = tomorrowImprovements ?? journal.tomorrowImprovements ?? '';
    journal.tomorrowFocus = tomorrowFocus ?? journal.tomorrowFocus ?? '';
    journal.additionalNotes = additionalNotes ?? journal.additionalNotes ?? '';
    journal.studyHours = Number(studyHours) || journal.studyHours || 3.0;
    journal.energyRating = Number(energyRating) || journal.energyRating || 4;
    journal.productivityRating = Number(productivityRating) || journal.productivityRating || 4;
    journal.isShared = Boolean(isShared);

    if ((status === 'SUBMITTED' || journal.status === 'SUBMITTED') && !journal.submittedAt) {
      journal.status = 'SUBMITTED';
      journal.submittedAt = submittedAt || nowIso;

      const finalizeResult = finalizeFocusedExecution(
        journal,
        focusedExecutionMinutes ?? journal.focusedExecutionMinutes,
        nowIso,
      );

      if (!finalizeResult.ok) {
        return res.status(finalizeResult.code || 400).json({
          error: finalizeResult.message || 'Unable to finalize focused execution hours.',
          ...lockState,
        });
      }
    }

    if ((status === 'LOCKED' || lockState.isLocked) && journal.status !== 'LOCKED') {
      journal.status = 'LOCKED';
      journal.lockedAt = nowIso;
    }

    journal.updatedAt = nowIso;
  } else {
    const createdStatus = lockState.isLocked ? 'LOCKED' : (status === 'SUBMITTED' ? 'SUBMITTED' : 'OPEN');
    const newJournal: any = {
      id: `journal-${Date.now()}`,
      userId: currentUser.id,
      date: targetDate,
      summary: summary || todayRoutine || '',
      todayRoutine: todayRoutine || summary || '',
      whatILearned: whatILearned || '',
      whatIBuilt: whatIBuilt || '',
      whatIStruggledWith: whatIStruggledWith || '',
      mistakes: mistakes || '',
      mistakesLessons: mistakesLessons || '',
      tomorrowImprovements: tomorrowImprovements || '',
      tomorrowFocus: tomorrowFocus || '',
      additionalNotes: additionalNotes || '',
      studyHours: Number(studyHours) || 3.0,
      focusedExecutionMinutes: undefined,
      focusedExecutionFinalized: false,
      focusedExecutionFinalizedAt: undefined,
      energyRating: Number(energyRating) || 4,
      productivityRating: Number(productivityRating) || 4,
      isShared: Boolean(isShared),
      status: createdStatus,
      submittedAt: status === 'SUBMITTED' ? (submittedAt || nowIso) : undefined,
      lockedAt: createdStatus === 'LOCKED' ? nowIso : undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    if (status === 'SUBMITTED') {
      const finalizeResult = finalizeFocusedExecution(newJournal, focusedExecutionMinutes, nowIso);
      if (!finalizeResult.ok) {
        return res.status(finalizeResult.code || 400).json({
          error: finalizeResult.message || 'Unable to finalize focused execution hours.',
          ...lockState,
        });
      }
    }

    state.journals.push(newJournal);
    journal = newJournal;
  }

  if (!journal) {
    return res.status(500).json({ error: 'Today\'s Live record could not be created.' });
  }

  state.auditLogs.unshift({
    id: `audit-journal-${Date.now()}`,
    actorId: currentUser.id,
    actorName: currentUser.name,
    action: journal.status === 'SUBMITTED' ? 'TODAYS_LIVE_SUBMITTED' : 'TODAYS_LIVE_UPDATED',
    targetType: 'TODAYS_LIVE',
    targetId: journal.id,
    reason: `Today's Live updated for ${targetDate} (${journal.status || 'OPEN'})`,
    timestamp: nowIso,
  });

  store.save();

  res.json({
    success: true,
    message: journal.status === 'SUBMITTED' ? 'Today\'s Live submitted securely.' : 'Today\'s Live saved securely.',
    journal,
    ...lockState,
  });
});

apiRouter.post('/journal/rate-partner', async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  const targetDate = String(req.body?.date || calculateDayInfo().currentDate);
  const ratingNum = Number(req.body?.rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ error: 'Rating must be an integer from 1 to 5.' });
  }

  const pool = getRuntimePool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const users = await client.query(
      `SELECT id, legacy_id, display_name FROM participants WHERE status='ACTIVE' AND legacy_id = ANY($1::text[]) FOR SHARE`,
      [[userId, userId === 'user-rahul' ? 'user-dileep' : 'user-rahul']]
    );
    const partner = users.rows.find((row: any) => row.legacy_id !== userId);
    if (!partner) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Partner not found.' }); }
    const journal = await client.query(
      `SELECT tl.id, p.legacy_id AS "userId", cd.calendar_date::text AS date, tl.summary, tl.summary AS "todayRoutine", tl.what_i_learned AS "whatILearned", tl.what_i_built AS "whatIBuilt", tl.what_i_struggled_with AS "whatIStruggledWith", tl.mistakes, tl.mistakes_lessons AS "mistakesLessons", tl.tomorrow_focus AS "tomorrowFocus", tl.tomorrow_focus AS "tomorrowImprovements", tl.additional_notes AS "additionalNotes", tl.study_hours AS "studyHours", tl.status, tl.updated_at AS "updatedAt"
       FROM todays_live tl JOIN participants p ON p.id=tl.participant_id JOIN challenge_days cd ON cd.id=tl.challenge_day_id
       WHERE tl.participant_id=$1 AND cd.calendar_date=$2 FOR UPDATE`, [partner.id, targetDate]
    );
    if (!journal.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Partner Today\'s Live entry was not found for the selected date.' }); }
    const inserted = await client.query(
      `INSERT INTO todays_live_ratings (todays_live_id, rater_participant_id, stars)
       VALUES ($1, (SELECT id FROM participants WHERE legacy_id=$2), $3)
       ON CONFLICT (todays_live_id, rater_participant_id) DO NOTHING
       RETURNING id`, [journal.rows[0].id, userId, ratingNum]
    );
    if (!inserted.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'You have already submitted a rating for this entry.' }); }
    const nowIso = getISTNow().toISOString();
    await client.query(
      `INSERT INTO audit_logs (actor_participant_id, action, entity_type, entity_id, reason, created_at)
       SELECT id, 'RATE_PARTNER_JOURNAL', 'TODAYS_LIVE', $1, 'Partner Today\'s Live rating submitted', $2 FROM participants WHERE legacy_id=$3`,
      [journal.rows[0].id, nowIso, userId]
    );
    await client.query(
      `INSERT INTO notifications (recipient_participant_id, notification_type, title, message, data, created_at)
       VALUES ($1, 'APPROVAL_RESPONSE', 'Journal Rating Received', $2, $3::jsonb, $4)`,
      [partner.id, `${userId} rated your Today's Live ${ratingNum}/5 stars.`, JSON.stringify({ rating: ratingNum, todaysLiveId: journal.rows[0].id }), nowIso]
    );
    await client.query('COMMIT');
    return res.json({ success: true, message: `Today's Live rating submitted: ${ratingNum}/5 stars.`, partnerJournal: journal.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    client.release();
  }
});

// ----------------------------------------------------------------------
// 9. PERMISSION & APPROVAL WORKFLOW (Section 21, 22, 23)
// ----------------------------------------------------------------------
apiRouter.get('/permissions', async (req, res) => {
  const currentUser = requireAuthUser(req, res);
  if (!currentUser) return;

  try {
    const result = await getRuntimePool().query(
      `SELECT cr.external_id AS id, requester.legacy_id AS "requesterId", requester.display_name AS "requesterName", target.legacy_id AS "targetUserId", target.display_name AS "targetUserName", cr.target_type AS "actionType", cr.external_target_id AS "entityId", cr.target_id AS "targetRecordId", targetTask.legacy_id AS "targetTaskLegacyId", targetSubject.code AS "targetSection", cr.reason, cr.status, cr.created_at AS "createdAt", cr.responded_at AS "respondedAt", cr.applied_at AS "appliedAt", cr.old_value AS "oldValue", cr.proposed_value AS "proposedValue"
       FROM change_requests cr JOIN participants requester ON requester.id=cr.requester_participant_id JOIN participants target ON target.id=cr.target_participant_id
       LEFT JOIN curriculum_tasks targetTask ON targetTask.id=cr.target_id
       LEFT JOIN subjects targetSubject ON targetSubject.id=targetTask.subject_id
       WHERE requester.legacy_id=$1 OR target.legacy_id=$1 ORDER BY cr.created_at DESC`, [currentUser.id]
    );
    const requests = result.rows.map((row: any) => ({
      ...row,
      entityId: row.actionType === 'RETROACTIVE_COMPLETION' && !String(row.entityId || '').includes('::') && row.targetTaskLegacyId && row.targetSection
        ? `${String(row.targetTaskLegacyId).replace(/-(DSA|JAVA|OS|DBMS)$/, '')}::${row.targetSection}`
        : row.entityId,
      entityTitle: row.entityId || row.actionType,
    }));
    const pendingForMe = requests.filter((request: any) => request.targetUserId === currentUser.id && request.status === 'PENDING');
    const myRequests = requests.filter((request: any) => request.requesterId === currentUser.id);
    return res.json({ pendingForMe, myRequests, allRequests: requests, all: requests });
  } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : String(error) }); }
});

apiRouter.post('/permissions/:id/approve', async (req, res) => {
  const currentUser = requireAuthUser(req, res);
  if (!currentUser) return;

  const requestId = req.params.id;
  const { responseReason } = req.body;

  try {
    const updated = await handlePermissionResponse(currentUser.id, requestId, 'APPROVE', responseReason);
    res.json({ success: true, message: 'Approval granted and action executed.', request: updated });
  } catch (err: any) {
    const statusCode = err?.statusCode || 400;
    res.status(statusCode).json({
      error: err?.message || 'Failed to process approval.',
      code: statusCode,
    });
  }
});

apiRouter.post('/permissions/:id/decline', async (req, res) => {
  const currentUser = requireAuthUser(req, res);
  if (!currentUser) return;

  const requestId = req.params.id;
  const { responseReason } = req.body;

  try {
    const updated = await handlePermissionResponse(currentUser.id, requestId, 'DECLINE', responseReason);
    res.json({
      success: true,
      message: 'Request declined. 12-hour mutual cooldown initiated.',
      request: updated,
    });
  } catch (err: any) {
    const statusCode = err?.statusCode || 400;
    res.status(statusCode).json({
      error: err?.message || 'Failed to process decline.',
      code: statusCode,
    });
  }
});

// ----------------------------------------------------------------------
// 10. NOTIFICATIONS & AUDIT LOGS
// ----------------------------------------------------------------------
apiRouter.get('/notifications', async (req, res) => {
  const userId = getSessionUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try { return res.json({ notifications: await listNotifications(getRuntimePool(), userId) }); }
  catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : String(error) }); }
});

apiRouter.post('/notifications/:id/read', async (req, res) => {
  const userId = getSessionUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try { if (!(await markNotificationRead(getRuntimePool(), userId, req.params.id))) return res.status(404).json({ error: 'Notification not found.' }); return res.json({ success: true }); }
  catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : String(error) }); }
});

apiRouter.post('/notifications/read-all', async (req, res) => {
  const userId = getSessionUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try { await markAllNotificationsRead(getRuntimePool(), userId); return res.json({ success: true }); }
  catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : String(error) }); }
});

apiRouter.get('/audit-logs', async (req, res) => {
  const userId = getSessionUserId(req); if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try { return res.json({ logs: await listAuditLogs(getRuntimePool(), userId) }); }
  catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : String(error) }); }
});

// ----------------------------------------------------------------------
// 11. ANALYTICS (Section 36)
// ----------------------------------------------------------------------
apiRouter.get('/analytics', async (req, res) => {
  const currentUser = requireAuthUser(req, res);
  if (!currentUser) return;

  await store.refreshFromDatabase();
  const state = store.getState();
  const dayInfo = calculateDayInfo();

  const toDateString = (dayNumber: number) => {
    const start = new Date(`${dayInfo.challengeStartDate}T00:00:00+05:30`);
    const target = new Date(start.getTime() + (dayNumber - 1) * 24 * 60 * 60 * 1000);
    return getISTDateString(target);
  };

  const getUserDailyPoints = (userId: string, date: string) =>
    state.pointLedger.filter(entry => entry.userId === userId && entry.date === date)
      .reduce((sum, entry) => sum + entry.points, 0);

  const getCompletedTasksForDay = (userId: string, dayNumber: number) => {
    const task = state.tasks.find(item => item.dayNumber === dayNumber);
    if (!task) return 0;
    const status = state.taskStatuses.find(ts => ts.userId === userId && ts.taskId === task.id);
    if (!status) return 0;
    return status.status === 'COMPLETED_ON_TIME' || status.status === 'COMPLETED_LATE' ? 1 : 0;
  };

  const getDsaSolvedForDay = (userId: string, date: string) =>
    state.dsaAttempts.filter(attempt => attempt.userId === userId && attempt.date === date && attempt.status === 'SOLVED').length;

  const getFocusedHoursForDay = (userId: string, date: string) => {
    const journal = state.journals.find(entry => entry.userId === userId && entry.date === date);
    return Number(journal?.studyHours || 0);
  };

  const getCurrentHabitStreakForDay = (userId: string, dayNumber: number) => {
    let streak = 0;
    for (let d = 1; d <= dayNumber; d += 1) {
      const date = toDateString(d);
      const entry = state.habits.find(h => h.userId === userId && h.date === date);
      if (!entry || entry.status === 'HOLIDAY') {
        if (d < dayNumber) {
          streak = 0;
        }
        continue;
      }
      if (entry.status === 'NO_REPORT') {
        streak += 1;
      } else if (entry.status === 'REPORTED_RELAPSE') {
        if (d < dayNumber) {
          streak = 0;
        }
      }
    }
    return streak;
  };

  const timeline: Array<{
    dayNumber: number;
    dayLabel: string;
    date: string;
    rahulCumulative: number;
    dileepCumulative: number;
    rahulDaily: number;
    dileepDaily: number;
    rahulTasks: number;
    dileepTasks: number;
    rahulDsa: number;
    dileepDsa: number;
    rahulFocused: number;
    dileepFocused: number;
    rahulStreak: number;
    dileepStreak: number;
  }> = [];

  if (!dayInfo.challengeStarted) {
    return res.json({
      challenge: {
        startDate: dayInfo.challengeStartDate,
        endDate: dayInfo.challengeEndDate,
        currentDate: dayInfo.currentDate,
        currentDayNumber: 0,
        totalDays: dayInfo.totalDays,
        daysRemaining: dayInfo.daysRemaining,
      },
      summary: {
        rahulScore: 0,
        dileepScore: 0,
        leaderId: null,
        leaderName: null,
        pointDifference: 0,
        pointDifferenceText: 'Challenge starts on 15 Sep 2026.',
        winDays: { rahul: 0, dileep: 0, tie: 0 },
        bestDailyPerformance: { rahul: 0, dileep: 0, topDay: 0 },
        averageDailyPoints: { rahul: 0, dileep: 0 },
        dsaComparison: { rahul: 0, dileep: 0 },
        focusedExecution: { rahul: 0, dileep: 0 },
        learningStreak: { rahulCurrent: 0, rahulBest: 0, dileepCurrent: 0, dileepBest: 0 },
      },
      timeline: [],
    });
  }

  let rahulCumulative = 0;
  let dileepCumulative = 0;

  for (let dayNumber = 1; dayNumber <= dayInfo.dayNumber; dayNumber += 1) {
    const date = toDateString(dayNumber);
    const rahulDaily = getUserDailyPoints('user-rahul', date);
    const dileepDaily = getUserDailyPoints('user-dileep', date);
    rahulCumulative += rahulDaily;
    dileepCumulative += dileepDaily;

    const point = {
      dayNumber,
      dayLabel: `Day ${dayNumber}`,
      date,
      rahulCumulative,
      dileepCumulative,
      rahulDaily,
      dileepDaily,
      rahulTasks: getCompletedTasksForDay('user-rahul', dayNumber),
      dileepTasks: getCompletedTasksForDay('user-dileep', dayNumber),
      rahulDsa: getDsaSolvedForDay('user-rahul', date),
      dileepDsa: getDsaSolvedForDay('user-dileep', date),
      rahulFocused: getFocusedHoursForDay('user-rahul', date),
      dileepFocused: getFocusedHoursForDay('user-dileep', date),
      rahulStreak: getCurrentHabitStreakForDay('user-rahul', dayNumber),
      dileepStreak: getCurrentHabitStreakForDay('user-dileep', dayNumber),
    };

    timeline.push(point);
  }

  const rahulScore = timeline.at(-1)?.rahulCumulative || 0;
  const dileepScore = timeline.at(-1)?.dileepCumulative || 0;
  const leaderId = rahulScore === dileepScore ? null : rahulScore > dileepScore ? 'user-rahul' : 'user-dileep';
  const leaderName = leaderId === 'user-rahul' ? 'Rahul' : leaderId === 'user-dileep' ? 'Dileep' : null;
  const pointDifference = Math.abs(rahulScore - dileepScore);
  const pointDifferenceText = leaderName
    ? `${leaderName} leads by ${pointDifference} point${pointDifference === 1 ? '' : 's'}`
    : "It's a tie.";

  let rahulWins = 0;
  let dileepWins = 0;
  let ties = 0;

  timeline.forEach(day => {
    if (day.rahulDaily > day.dileepDaily) rahulWins += 1;
    else if (day.dileepDaily > day.rahulDaily) dileepWins += 1;
    else ties += 1;
  });

  const bestDailyPerformance = {
    rahul: Math.max(0, ...timeline.map(day => day.rahulDaily)),
    dileep: Math.max(0, ...timeline.map(day => day.dileepDaily)),
    topDay: Math.max(0, ...timeline.map(day => Math.max(day.rahulDaily, day.dileepDaily))),
  };

  const averageDailyPoints = {
    rahul: timeline.length ? Number((timeline.reduce((sum, day) => sum + day.rahulDaily, 0) / timeline.length).toFixed(1)) : 0,
    dileep: timeline.length ? Number((timeline.reduce((sum, day) => sum + day.dileepDaily, 0) / timeline.length).toFixed(1)) : 0,
  };

  const dsaComparison = {
    rahul: timeline.reduce((sum, day) => sum + day.rahulDsa, 0),
    dileep: timeline.reduce((sum, day) => sum + day.dileepDsa, 0),
  };

  const focusedExecution = {
    rahul: Number((timeline.reduce((sum, day) => sum + day.rahulFocused, 0)).toFixed(1)),
    dileep: Number((timeline.reduce((sum, day) => sum + day.dileepFocused, 0)).toFixed(1)),
  };

  const learningStreak = {
    rahulCurrent: timeline.at(-1)?.rahulStreak || 0,
    rahulBest: Math.max(0, ...timeline.map(day => day.rahulStreak)),
    dileepCurrent: timeline.at(-1)?.dileepStreak || 0,
    dileepBest: Math.max(0, ...timeline.map(day => day.dileepStreak)),
  };

  res.json({
    challenge: {
      startDate: dayInfo.challengeStartDate,
      endDate: dayInfo.challengeEndDate,
      currentDate: dayInfo.currentDate,
      currentDayNumber: dayInfo.dayNumber,
      totalDays: dayInfo.totalDays,
      daysRemaining: dayInfo.daysRemaining,
    },
    summary: {
      rahulScore,
      dileepScore,
      leaderId,
      leaderName,
      pointDifference,
      pointDifferenceText,
      winDays: { rahul: rahulWins, dileep: dileepWins, tie: ties },
      bestDailyPerformance,
      averageDailyPoints,
      dsaComparison,
      focusedExecution,
      learningStreak,
    },
    timeline,
  });
});

// ----------------------------------------------------------------------
// 12. INTERVIEW QUESTIONS BANK (Section 35)
// ----------------------------------------------------------------------
const handleGetInterviewQuestions = (req: any, res: any) => {
  const currentUser = requireAuthUser(req, res);
  if (!currentUser) return;

  const state = store.getState();
  const { category, difficulty } = req.query;

  let questions = [...state.interviewQuestions];
  if (category) {
    questions = questions.filter(q => q.category === category);
  }
  if (difficulty) {
    questions = questions.filter(q => q.difficulty === difficulty);
  }

  res.json({ questions, total: questions.length });
};

apiRouter.get('/interview-questions', handleGetInterviewQuestions);
apiRouter.get('/interview-bank', handleGetInterviewQuestions);

// ----------------------------------------------------------------------
// 13. Administrative controls
// ----------------------------------------------------------------------
// Settlement and reset are internal/server operations and intentionally have
// no public HTTP route.

const handleSystemExport = (req: express.Request, res: express.Response) => {
  const currentUser = requireAuthUser(req, res);
  if (!currentUser) return;

  const exportData = buildUserExport(store.getState(), currentUser.id);
  if (!exportData) return res.status(404).json({ error: 'Participant not found.' });
  res.json(exportData);
};

apiRouter.get('/system/export', handleSystemExport);
apiRouter.get('/export', handleSystemExport);