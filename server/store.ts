import bcrypt from 'bcryptjs';
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
  AuthenticationIdentity,
  ScheduleSectionStatus,
} from '../src/types';
import { generateCurriculum, MOTIVATION_QUOTES } from './curriculumData';

let runtimePool: Pool | null = null;

export function getRuntimePool(env = process.env): Pool {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for runtime business state. The application cannot start without PostgreSQL configuration.');
  }

  if (!runtimePool) {
    runtimePool = new Pool({ connectionString: databaseUrl });
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
  authIdentities: AuthenticationIdentity[];
  frozenDays: string[]; // Dates that have completed midnight settlement
  simulatedDate: string | null;
}

// Default initial password hash for 'password123'
const DEFAULT_PASSWORD_HASH = bcrypt.hashSync('password123', 10);

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

          const result = await pool.query(
            'SELECT state_json FROM runtime_state WHERE name = $1 LIMIT 1',
            ['app']
          );

          if (result.rows.length > 0 && result.rows[0]?.state_json && typeof result.rows[0].state_json === 'object') {
            const persisted = result.rows[0].state_json as AppState;
            this.state = this.migrateCurriculum({ ...this.createInitialSeedState(), ...persisted });
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

  public save() {
    this.ensureInitialized();
    const pool = getRuntimePool();
    void pool.query(
      `INSERT INTO runtime_state (name, state_json, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (name)
       DO UPDATE SET state_json = EXCLUDED.state_json, updated_at = now()`,
      ['app', JSON.stringify(this.state)]
    ).catch((error) => {
      throw new Error(`Failed to persist runtime state to PostgreSQL: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  public getState(): AppState {
    this.ensureInitialized();
    this.state.dailyCheckins = this.state.dailyCheckins || [];
    this.state.leaves = this.state.leaves || [];
    this.state.morningCheckins = this.state.morningCheckins || [];
    this.state.scheduleSectionStatuses = this.state.scheduleSectionStatuses || [];
    return this.state;
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
        passwordHash: DEFAULT_PASSWORD_HASH,
      },
      {
        id: 'user-dileep',
        name: 'Dileep',
        email: 'dileep@devchallenge.com',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        targetRole: 'DSA + Java + OS + DBMS — Interview Ready Engineer',
        boundIdentity: 'identity-lock-dileep-002',
        createdAt: '2026-09-01T00:00:00Z',
        passwordHash: DEFAULT_PASSWORD_HASH,
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

    const authIdentities: AuthenticationIdentity[] = [];

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
        reason: 'Initialized 100-day DSA + Java + OS + DBMS curriculum for Rahul and Dileep (Sep 15 - Dec 31, 2026)',
        timestamp: '2026-09-15T00:00:00+05:30',
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
      authIdentities,
      frozenDays,
      simulatedDate: null,
    };
  }
}

export const store = new Store();
