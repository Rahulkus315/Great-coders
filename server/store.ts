import { Pool } from 'pg';
import {
  User,
  DailyTask,
  DSAProblem,
  InterviewQuestion,
  TaskUserStatus,
  PointLedgerEntry,
  DSAAttempt,
  PermissionRequest,
  DailyJournal,
  HabitEntry,
  AppNotification,
  AuditLogEntry,
  MotivationQuote,
  MorningCheckin,
  LeaveDay,
  DailyCheckinRecord,
  ScheduleSectionStatus,
} from '../src/types';
import { generateCurriculum, MOTIVATION_QUOTES } from './curriculumData';
import { ensureParticipantSchedules } from './participantScheduleService';
import { buildConnectionString, buildPostgresSslConfig } from './postgresConfig';

let runtimePool: Pool | null = null;

export function getRuntimePool(env = process.env): Pool {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for runtime business state. The application cannot start without PostgreSQL configuration.');
  }

  if (!runtimePool) {
    const connectionString = buildConnectionString(databaseUrl);
    const sslConfig = buildPostgresSslConfig(env, new URL(connectionString).hostname);

    runtimePool = new Pool({
      connectionString,
      ...(sslConfig ? { ssl: sslConfig } : {}),
    });
  }

  return runtimePool;
}

export interface ParticipantProfile {
  displayName: string;
  headline: string;
  bio: string;
  skills: string;
  coverTheme: 'default' | 'developer' | 'java' | 'ai' | 'backend' | 'fullstack';
  avatarUrl?: string;
}

export interface AppState {
  curriculumVersion?: string;
  users: Array<User & { passwordHash: string }>;
  profiles: Record<string, ParticipantProfile>;
  tasks: DailyTask[];
  dsaProblems: DSAProblem[];
  interviewQuestions: InterviewQuestion[];
  quotes: MotivationQuote[];
  taskStatuses: TaskUserStatus[];
  scheduleSectionStatuses: ScheduleSectionStatus[];
  pointLedger: PointLedgerEntry[];
  dsaAttempts: DSAAttempt[];
  permissions: PermissionRequest[];
  journals: DailyJournal[];
  habits: HabitEntry[];
  morningCheckins: MorningCheckin[];
  dailyCheckins: DailyCheckinRecord[];
  leaves: LeaveDay[];
  notifications: AppNotification[];
  auditLogs: AuditLogEntry[];
  frozenDays: string[]; // Dates that have completed midnight settlement
  simulatedDate: string | null;
}

class Store {
  private state: AppState;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.state = this.createInitialSeedState();
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    if (!this.initializationPromise) {
      this.initializationPromise = (async () => {
        const pool = getRuntimePool();

        try {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS runtime_state (
              name TEXT PRIMARY KEY,
              state_json JSONB NOT NULL,
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
          `);
          await pool.query(`
            CREATE TABLE IF NOT EXISTS participant_schedule_days (
              participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
              challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
              curriculum_day_number INTEGER NOT NULL,
              effective_date DATE NOT NULL,
              source_challenge_day_id UUID NOT NULL REFERENCES challenge_days(id),
              challenge_day_id UUID REFERENCES challenge_days(id),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              PRIMARY KEY (participant_id, challenge_id, curriculum_day_number)
            )
          `);
          await pool.query(`ALTER TABLE participant_schedule_days ADD COLUMN IF NOT EXISTS effective_date DATE`);
          await pool.query(`ALTER TABLE participant_schedule_days ADD COLUMN IF NOT EXISTS source_challenge_day_id UUID`);
          await pool.query(`ALTER TABLE participant_schedule_days ADD COLUMN IF NOT EXISTS challenge_day_id UUID`);
          await pool.query(`
            UPDATE participant_schedule_days psd
            SET effective_date = COALESCE(psd.effective_date, cd.calendar_date),
              source_challenge_day_id = COALESCE(psd.source_challenge_day_id, psd.challenge_day_id),
              challenge_day_id = COALESCE(psd.challenge_day_id, psd.source_challenge_day_id)
            FROM challenge_days cd
            WHERE cd.id = COALESCE(psd.source_challenge_day_id, psd.challenge_day_id)
          `);
          await pool.query(`ALTER TABLE participant_schedule_days ALTER COLUMN effective_date SET NOT NULL`);
          await pool.query(`ALTER TABLE participant_schedule_days ALTER COLUMN source_challenge_day_id SET NOT NULL`);
          await pool.query(`
            CREATE TABLE IF NOT EXISTS challenge_participants (
              challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
              participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
              joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              PRIMARY KEY (challenge_id, participant_id)
            )
          `);
          await pool.query(`
            INSERT INTO challenge_participants (challenge_id, participant_id)
            SELECT c.id, p.id FROM challenges c JOIN participants p ON p.legacy_id IN ('user-rahul', 'user-dileep') AND p.status = 'ACTIVE'
            WHERE c.name = 'Great Coders' ON CONFLICT DO NOTHING
          `);

          const result = await pool.query(
            'SELECT state_json FROM runtime_state WHERE name = $1 LIMIT 1',
            ['app']
          );

          if (result.rows.length > 0 && result.rows[0]?.state_json && typeof result.rows[0].state_json === 'object') {
            const persisted = result.rows[0].state_json as AppState;
            this.state = this.migrateCurriculum({ ...this.createInitialSeedState(), ...persisted });
          }

          await this.hydrateNormalizedState(pool);
          const challenges = await pool.query(`SELECT id FROM challenges`);
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            for (const challenge of challenges.rows) await ensureParticipantSchedules(client, challenge.id);
            await client.query('COMMIT');
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }

          this.initialized = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`PostgreSQL runtime state could not be initialized: ${message}`);
        }
      })();
    }

    await this.initializationPromise;
  }

  private ensureInitialized() {
    if (!this.initialized) {
      throw new Error('Store is not initialized. DATABASE_URL must be configured and PostgreSQL must be reachable before business state is used.');
    }
  }

  private migrateCurriculum(state: AppState): AppState {
    if (state.curriculumVersion === 'great-coders-100-day-v3') {
      state.scheduleSectionStatuses = state.scheduleSectionStatuses || [];
      return state;
    }

    const curriculum = generateCurriculum();
    state.curriculumVersion = 'great-coders-100-day-v3';
    state.tasks = curriculum.tasks;
    state.dsaProblems = curriculum.dsaProblems;
    state.interviewQuestions = curriculum.interviewQuestions;
    state.quotes = MOTIVATION_QUOTES;

    // Old completion records refer to a different syllabus and must not mark
    // the replacement curriculum as complete.
    state.taskStatuses = [];
    state.scheduleSectionStatuses = [];
    state.dsaAttempts = [];
    state.permissions = [];
    state.pointLedger = [];
    state.auditLogs = state.auditLogs || [];
    state.auditLogs.unshift({
      id: `audit-curriculum-${Date.now()}`,
      actorId: 'SYSTEM',
      actorName: 'SYSTEM',
      action: 'REPLACE_CURRICULUM',
      targetType: 'CHALLENGE',
      targetId: '100_DAY_CHALLENGE',
      reason: 'Replaced the legacy syllabus with the Great Coders DSA + Java + OS + DBMS 100-day curriculum.',
      timestamp: new Date().toISOString(),
    });
    return state;
  }

  private async hydrateNormalizedState(pool: Pool) {
    const state = this.state;
    const participants = await pool.query(
      `SELECT legacy_id AS id, display_name AS name, email, avatar_url AS avatar, target_role AS "targetRole", bound_identity AS "boundIdentity", password_hash AS "passwordHash", created_at AS "createdAt"
       FROM participants WHERE status = 'ACTIVE' ORDER BY legacy_id`
    );
    if (participants.rowCount) {
      state.users = participants.rows.map((row: any) => ({ ...row, name: row.name as 'Rahul' | 'Dileep' }));
    }

    const scheduledTasks = await pool.query(
      `SELECT ct.legacy_id, cd.calendar_date::text AS date
       FROM curriculum_tasks ct JOIN challenge_days cd ON cd.id = ct.challenge_day_id
       ORDER BY cd.calendar_date ASC`,
    );
    const taskDates = new Map<string, string>(scheduledTasks.rows.map((row: any) => [row.legacy_id, row.date]));
    state.tasks = state.tasks.map(task => ({ ...task, date: taskDates.get(`${task.id}-DSA`) || task.date }));

    const scheduledDsa = await pool.query(
      `SELECT dp.legacy_id, cd.calendar_date::text AS date
       FROM dsa_problems dp JOIN challenge_days cd ON cd.id = dp.challenge_day_id`,
    );
    const dsaDates = new Map<string, string>(scheduledDsa.rows.map((row: any) => [row.legacy_id, row.date]));
    state.dsaProblems = state.dsaProblems.map(problem => ({ ...problem, date: dsaDates.get(problem.id) || problem.date }));

    const profiles = await pool.query(
      `SELECT p.legacy_id AS id, pr.display_name AS "displayName", pr.headline, pr.bio, pr.skills, pr.cover_theme AS "coverTheme", pr.avatar_url AS "avatarUrl"
       FROM profiles pr JOIN participants p ON p.id = pr.participant_id`
    );
    state.profiles = Object.fromEntries(profiles.rows.map((row: any) => {
      const { id, ...profile } = row;
      return [id, profile];
    }));

    const completions = await pool.query(
      `SELECT p.legacy_id AS "userId", ct.legacy_id AS "taskLegacyId", s.code AS section, tc.status, tc.points_awarded AS "pointsAwarded", tc.completed_at AS "completedAt"
       FROM task_completions tc JOIN participants p ON p.id = tc.participant_id JOIN curriculum_tasks ct ON ct.id = tc.curriculum_task_id JOIN subjects s ON s.id = tc.subject_id`
    );
    state.scheduleSectionStatuses = completions.rows.map((row: any) => {
      const section = row.section as ScheduleSectionStatus['section'];
      const task = state.tasks.find(candidate => `${candidate.id}-${section}` === row.taskLegacyId);
      return { taskId: task?.id || row.taskLegacyId, userId: row.userId, section, status: row.status, pointsAwarded: Number(row.pointsAwarded), completedAt: row.completedAt || undefined };
    });
    state.taskStatuses = [];

    const ledger = await pool.query(
      `SELECT p.legacy_id AS "userId", pl.id, cd.calendar_date::text AS date, pl.created_at AS timestamp, pl.event_type AS "eventType", pl.amount AS points, pl.reason, pl.metadata, ct.legacy_id AS "sourceTaskId", ct.title AS "sourceTaskTitle"
       FROM points_ledger pl JOIN participants p ON p.id = pl.participant_id LEFT JOIN challenge_days cd ON cd.id = pl.challenge_day_id LEFT JOIN curriculum_tasks ct ON ct.id = pl.curriculum_task_id ORDER BY pl.created_at ASC`
    );
    state.pointLedger = ledger.rows.map((row: any) => ({ ...row, points: Number(row.points), runningTotal: 0, category: row.eventType === 'DSA_COMPLETED' ? 'DSA' : undefined }));
    let runningTotals = new Map<string, number>();
    state.pointLedger = state.pointLedger.map(entry => {
      const total = (runningTotals.get(entry.userId) || 0) + entry.points;
      runningTotals.set(entry.userId, total);
      return { ...entry, runningTotal: total };
    });

    const dsaAttempts = await pool.query(
      `SELECT p.legacy_id AS "userId", dp.legacy_id AS "problemId", ds.id, ds.submission_date::text AS date, ds.status, ds.time_taken_minutes AS "timeTakenMinutes", ds.notes, ds.code_snippet AS "codeSnippet", ds.solved_at AS "solvedAt"
       FROM dsa_submissions ds JOIN participants p ON p.id = ds.participant_id JOIN dsa_problems dp ON dp.id = ds.dsa_problem_id ORDER BY ds.solved_at ASC`
    );
    state.dsaAttempts = dsaAttempts.rows;

    const journals = await pool.query(
      `SELECT p.legacy_id AS "userId", tl.id, cd.calendar_date::text AS date, tl.summary, tl.summary AS "todayRoutine", tl.what_i_learned AS "whatILearned", tl.what_i_built AS "whatIBuilt", tl.what_i_struggled_with AS "whatIStruggledWith", tl.mistakes, tl.mistakes_lessons AS "mistakesLessons", tl.tomorrow_focus AS "tomorrowFocus", tl.tomorrow_focus AS "tomorrowImprovements", tl.additional_notes AS "additionalNotes", tl.study_hours AS "studyHours", tl.focused_execution_minutes AS "focusedExecutionMinutes", tl.focused_execution_finalized AS "focusedExecutionFinalized", tl.focused_execution_finalized_at AS "focusedExecutionFinalizedAt", tl.status, tl.created_at AS "createdAt", tl.updated_at AS "updatedAt"
       FROM todays_live tl JOIN participants p ON p.id = tl.participant_id JOIN challenge_days cd ON cd.id = tl.challenge_day_id`
    );
    state.journals = journals.rows.map((row: any) => ({ ...row, studyHours: Number(row.studyHours), energyRating: 4, productivityRating: 4, isShared: true }));

    const habits = await pool.query(
      `SELECT p.legacy_id AS "userId", e.id, cd.calendar_date::text AS date, e.status, e.notes, e.recorded_at AS "recordedAt"
       FROM self_control_entries e JOIN participants p ON p.id=e.participant_id JOIN challenge_days cd ON cd.id=e.challenge_day_id`
    );
    state.habits = habits.rows;

    const wakeUps = await pool.query(
      `SELECT p.legacy_id AS "userId", w.id, w.checkin_date::text AS date, w.checked_in_at AS "checkedInAt", w.status, w.points_awarded AS points
       FROM wake_up_checkins w JOIN participants p ON p.id=w.participant_id`
    );
    state.morningCheckins = wakeUps.rows.map((row: any) => ({ ...row, status: row.status === 'COMPLETED' ? 'CHECKED_IN' : 'MISSED' }));

    const dailyCheckins = await pool.query(
      `SELECT p.legacy_id AS "userId", d.id, d.checkin_date::text AS date, d.checked_in_at AS "checkedInAt", d.time_text AS "timeStr", d.streak_day AS "streakDay", d.coins_awarded AS "coinsAwarded", d.bonus_awarded AS "bonusAwarded", d.bonus_points AS "bonusPoints"
       FROM daily_checkins d JOIN participants p ON p.id=d.participant_id`
    );
    state.dailyCheckins = dailyCheckins.rows;

    const leaves = await pool.query(
      `SELECT p.legacy_id AS "userId", h.id, cd.calendar_date::text AS date, h.created_at AS "appliedAt", h.reason
       FROM holidays h JOIN participants p ON p.id=h.participant_id JOIN challenge_days cd ON cd.id=h.challenge_day_id WHERE h.status='APPROVED'`
    );
    state.leaves = leaves.rows;

    const notifications = await pool.query(
      `SELECT p.legacy_id AS "userId", n.id, n.notification_type AS type, n.title, n.message, n.read_at IS NOT NULL AS read, n.created_at AS "createdAt"
       FROM notifications n JOIN participants p ON p.id=n.recipient_participant_id ORDER BY n.created_at DESC`
    );
    state.notifications = notifications.rows;

    const audits = await pool.query(
      `SELECT COALESCE(p.legacy_id, 'SYSTEM') AS "actorId", a.id, a.action, a.entity_type AS "targetType", COALESCE(a.entity_id::text, '') AS "targetId", a.reason, a.created_at AS timestamp
       FROM audit_logs a LEFT JOIN participants p ON p.id=a.actor_participant_id ORDER BY a.created_at ASC`
    );
    state.auditLogs = audits.rows.map((row: any) => ({ ...row, actorName: row.actorId === 'user-dileep' ? 'Dileep' : row.actorId === 'user-rahul' ? 'Rahul' : 'SYSTEM' }));

    const requests = await pool.query(
      `SELECT cr.external_id AS id, requester.legacy_id AS "requesterId", requester.display_name AS "requesterName", target.legacy_id AS "targetUserId", target.display_name AS "targetUserName", cr.target_type AS "actionType", cr.external_target_id AS "entityId", cr.target_id AS "targetRecordId", targetTask.legacy_id AS "targetTaskLegacyId", targetSubject.code AS "targetSection", cr.reason, cr.status, cr.created_at AS "createdAt", cr.responded_at AS "respondedAt", cr.applied_at AS "appliedAt", cr.old_value AS "oldValue", cr.proposed_value AS "proposedValue"
       FROM change_requests cr JOIN participants requester ON requester.id=cr.requester_participant_id JOIN participants target ON target.id=cr.target_participant_id
       LEFT JOIN curriculum_tasks targetTask ON targetTask.id=cr.target_id
       LEFT JOIN subjects targetSubject ON targetSubject.id=targetTask.subject_id
       WHERE cr.external_id IS NOT NULL ORDER BY cr.created_at ASC`
    );
    state.permissions = requests.rows.map((row: any) => ({
      ...row,
      entityId: row.actionType === 'RETROACTIVE_COMPLETION' && !String(row.entityId || '').includes('::') && row.targetTaskLegacyId && row.targetSection
        ? `${String(row.targetTaskLegacyId).replace(/-(DSA|JAVA|OS|DBMS)$/, '')}::${row.targetSection}`
        : row.entityId,
      entityTitle: row.entityId || row.actionType,
    }));
  }

  public save() {
    this.ensureInitialized();
    // Legacy runtime_state snapshots are compatibility-only and not authoritative.
    // Business writes must be persisted directly in PostgreSQL; this method is kept
    // as a no-op so the app cannot silently reintroduce runtime-state persistence.
    return;
  }

  public getState(): AppState {
    this.ensureInitialized();
    this.state.dailyCheckins = this.state.dailyCheckins || [];
    this.state.leaves = this.state.leaves || [];
    this.state.morningCheckins = this.state.morningCheckins || [];
    this.state.scheduleSectionStatuses = this.state.scheduleSectionStatuses || [];
    return this.state;
  }

  public async refreshFromDatabase() {
    this.ensureInitialized();
    await this.hydrateNormalizedState(getRuntimePool());
  }

  public resetToSeedState() {
    this.state = this.createInitialSeedState();
    this.save();
    return this.state;
  }

  private createInitialSeedState(): AppState {
    const { tasks, dsaProblems, interviewQuestions } = generateCurriculum();

    const users: Array<User & { passwordHash: string }> = [
      {
        id: 'user-rahul',
        name: 'Rahul',
        email: 'rahulkushwha181@gmail.com',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        targetRole: 'DSA + Java + OS + DBMS — Interview Ready Engineer',
        boundIdentity: 'identity-lock-rahul-001',
        createdAt: '2026-09-01T00:00:00Z',
        passwordHash: '',
      },
      {
        id: 'user-dileep',
        name: 'Dileep',
        email: 'dileepkewat011@gmail.com',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        targetRole: 'DSA + Java + OS + DBMS — Interview Ready Engineer',
        boundIdentity: 'identity-lock-dileep-002',
        createdAt: '2026-09-01T00:00:00Z',
        passwordHash: '',
      },
    ];

    const pointLedger: PointLedgerEntry[] = [];
    const taskStatuses: TaskUserStatus[] = [];
    const dsaAttempts: DSAAttempt[] = [];
    const habits: HabitEntry[] = [];
    const journals: DailyJournal[] = [];
    const morningCheckins: MorningCheckin[] = [];
    const dailyCheckins: DailyCheckinRecord[] = [];
    const leaves: LeaveDay[] = [];
    const frozenDays: string[] = [];

    const profiles: Record<string, ParticipantProfile> = {
      'user-rahul': {
        displayName: 'Rahul',
        headline: 'DSA • Java OOP • OS • DBMS',
        bio: 'Building every day. Becoming a better coder.',
        skills: 'DSA • Java • Operating Systems • DBMS • Collections',
        coverTheme: 'default',
        avatarUrl: users[0].avatar,
      },
      'user-dileep': {
        displayName: 'Dileep',
        headline: 'DSA • Java OOP • OS • DBMS',
        bio: 'Building every day. Becoming a better coder.',
        skills: 'DSA • Java • Operating Systems • DBMS • Collections',
        coverTheme: 'developer',
        avatarUrl: users[1].avatar,
      },
    };

    const notifications: AppNotification[] = [
      {
        id: 'notif-welcome-rahul',
        userId: 'user-rahul',
        type: 'COMPETITION_ALERT',
        title: '🎯 Great Coders Challenge Started',
        message: 'Welcome Rahul! Your Great Coders journey begins today. Keep your daily streak strong and stay focused on execution.',
        read: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'notif-welcome-dileep',
        userId: 'user-dileep',
        type: 'COMPETITION_ALERT',
        title: '🎯 Great Coders Challenge Started',
        message: 'Welcome Dileep! Your Great Coders journey begins today. Keep your daily streak strong and stay focused on execution.',
        read: false,
        createdAt: new Date().toISOString(),
      },
    ];

    const auditLogs: AuditLogEntry[] = [
      {
        id: 'audit-1',
        actorId: 'SYSTEM',
        actorName: 'SYSTEM',
        action: 'INITIALIZE_CHALLENGE',
        targetType: 'CHALLENGE',
        targetId: '100_DAY_CHALLENGE',
        reason: 'Initialized 100-day DSA + Java + OS + DBMS curriculum for Rahul and Dileep (Sep 17 - Dec 25, 2026)',
        timestamp: '2026-09-17T00:00:00+05:30',
      },
    ];

    return {
      curriculumVersion: 'great-coders-100-day-v3',
      users,
      profiles,
      tasks,
      dsaProblems,
      interviewQuestions,
      quotes: MOTIVATION_QUOTES,
      taskStatuses,
      scheduleSectionStatuses: [],
      pointLedger,
      dsaAttempts,
      permissions: [],
      journals,
      habits,
      morningCheckins,
      dailyCheckins,
      leaves,
      notifications,
      auditLogs,
      frozenDays,
      simulatedDate: null,
    };
  }
}

export const store = new Store();
