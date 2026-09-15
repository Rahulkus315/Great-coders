export type UserRole = 'USER' | 'ADMIN';

export interface User {
  id: string;
  name: 'Rahul' | 'Dileep';
  email: string;
  avatar: string;
  targetRole: string;
  boundIdentity: string; // Permanently locked identifier
  createdAt: string;
}

export type BindingStatus = 'PENDING' | 'PERMANENT';

export interface AuthenticationIdentity {
  id: string;
  provider: 'GOOGLE';
  providerSubject: string;
  email: string;
  emailVerified: boolean;
  participantId: 'user-rahul' | 'user-dileep';
  bindingStatus: BindingStatus;
  createdAt: string;
  lastLoginAt: string;
}

export type SubjectCategory =
  | 'CORE_JAVA'
  | 'ADVANCED_JAVA'
  | 'BACKEND'
  | 'SPRING_BOOT'
  | 'DATABASE'
  | 'REACT'
  | 'DSA'
  | 'OS'
  | 'DBMS'
  | 'INTERVIEW_PREP'
  | 'PROJECT_PRACTICE'
  | 'REVISION';

export type TaskDifficulty = 'BASIC' | 'EASY' | 'MEDIUM' | 'HARD';
export type InterviewPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ResourceLink {
  title: string;
  url: string;
  type: 'DOCS' | 'VIDEO' | 'ARTICLE' | 'PRACTICE';
}

export type StudySubject = 'JAVA' | 'OS' | 'DBMS';

export interface StudyTopic {
  subject: StudySubject;
  title: string;
  description: string;
  estimatedMinutes: number;
}

export interface InterviewQuestion {
  id: string;
  question: string;
  answerSummary: string;
  category: SubjectCategory;
  difficulty: TaskDifficulty;
  frequency: 'FREQUENTLY_ASKED' | 'OCCASIONALLY_ASKED' | 'RARE';
  codeExample?: string;
}

export interface DailyTask {
  id: string;
  version?: number;
  dayNumber: number; // 1 to 100
  date: string; // YYYY-MM-DD
  category: SubjectCategory;
  title: string;
  description: string;
  learningObjective: string;
  estimatedMinutes: number;
  difficulty: TaskDifficulty;
  priority: InterviewPriority;
  badges: string[]; // e.g. "⭐ Must Know", "🔥 Frequently Asked", "☕ Core Java"
  resources: ResourceLink[];
  interviewQuestions: InterviewQuestion[];
  studyTopics?: StudyTopic[];
  subtopics?: string[];
}

export type TaskCompletionStatus = 'PENDING' | 'COMPLETED_ON_TIME' | 'COMPLETED_LATE' | 'MISSED' | 'REVERSED';

export type ScheduleSection = 'DSA' | 'JAVA' | 'OS' | 'DBMS';

export interface ScheduleSectionStatus {
  taskId: string;
  section: ScheduleSection;
  userId: string;
  status: TaskCompletionStatus;
  completedAt?: string;
  pointsAwarded: number;
}

export interface TaskUserStatus {
  taskId: string;
  userId: string;
  status: TaskCompletionStatus;
  completedAt?: string;
  pointsAwarded: number;
  reversalPending?: boolean;
}

export interface DSAProblem {
  id: string;
  version?: number;
  dayNumber: number;
  date: string;
  title: string;
  category: string; // e.g. "Arrays", "Two Pointers", "Trees", "DP"
  difficulty: TaskDifficulty;
  points: number; // Basic: 1, Easy: 2, Medium: 3, Hard: 4
  leetcodeUrl?: string;
  description: string;
  approach: string;
  timeComplexity: string;
  spaceComplexity: string;
  baseProblemCount?: number;
  upperTierProblems?: string[];
}

export interface DSAAttempt {
  id: string;
  problemId: string;
  userId: string;
  date: string;
  status: 'SOLVED' | 'ATTEMPTED';
  timeTakenMinutes: number;
  notes: string;
  codeSnippet?: string;
  solvedAt: string;
}

export type LedgerEventType =
  | 'TASK_COMPLETED_ON_TIME' // +4
  | 'TASK_MISSED_SETTLEMENT' // -5
  | 'TASK_COMPLETED_LATE' // +2
  | 'DSA_COMPLETED' // +1..+4
  | 'DAILY_CHECKIN' // +1 Coin & streak +1
  | 'CHECKIN_STREAK_7_BONUS' // +5 Extra points for 7-day continuous streak
  | 'MORNING_CHECKIN_SUCCESS' // +2 (Awake between 04:00 AM - 05:00 AM)
  | 'MORNING_CHECKIN_MISSED' // -1 (Missed 04:00 AM - 05:00 AM window)
  | 'LEAVE_HOLIDAY_APPLIED' // 0 (Schedule shifted 1 day forward)
  | 'TASK_REVERSED' // -4 (or -2)
  | 'MUTUAL_APPROVAL_ADJUSTMENT';

export interface DailyCheckinRecord {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  checkedInAt: string; // ISO timestamp
  timeStr: string; // e.g. "08:30 AM IST"
  streakDay: number; // consecutive days
  coinsAwarded: number; // 1 (or 6 if 7-day bonus)
  bonusAwarded?: boolean;
  bonusPoints?: number;
}

export interface PointLedgerEntry {
  id: string; // UUID
  userId: string;
  date: string;
  timestamp: string;
  eventType: LedgerEventType;
  points: number;
  runningTotal: number;
  sourceTaskId?: string;
  sourceTaskTitle?: string;
  category?: SubjectCategory | 'DSA' | 'ADMIN' | 'DISCIPLINE';
  reason: string;
  metadata?: Record<string, any>;
}

export type MorningWindowStatus = 'UPCOMING' | 'ACTIVE' | 'CLOSED';

export interface MorningCheckin {
  id: string;
  userId: string;
  date: string;
  checkedInAt?: string;
  status: 'CHECKED_IN' | 'MISSED' | 'PENDING';
  points: number;
}

export interface LeaveDay {
  id: string;
  userId: string;
  date: string;
  appliedAt: string;
  reason?: string;
}

export interface UserStats {
  userId: string;
  name: 'Rahul' | 'Dileep';
  totalPoints: number;
  rank: number;
  completedTasks: number;
  missedTasks: number;
  lateTasks: number;
  dsaSolved: number;
  dsaPoints: number;
  currentStreak: number;
  bestStreak: number;
  checkinStreak: number;
  bestCheckinStreak: number;
  totalCoins: number;
  hasCheckedInToday: boolean;
  todayCheckinTime?: string;
  totalStudyHours: number;
  completionPercentage: number;
  leavesUsed: number;
  remainingLeaves: number; // 5 - leavesUsed
  morningCheckinToday: 'CHECKED_IN' | 'MISSED' | 'PENDING' | 'ON_LEAVE';
  morningCheckinStreak: number;
  bestMorningCheckinStreak: number;
  isOnLeaveToday: boolean;
}

export type PermissionActionType =
  | 'TASK_REVERSAL'
  | 'SCORE_ADJUSTMENT'
  | 'SCHEDULE_CHANGE'
  | 'RULE_MODIFICATION'
  | 'RETROACTIVE_COMPLETION';
export type PermissionStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'EXPIRED';

export interface PermissionRequest {
  id: string;
  requesterId: string;
  requesterName: 'Rahul' | 'Dileep';
  targetUserId: string;
  targetUserName: 'Rahul' | 'Dileep';
  actionType: PermissionActionType;
  entityType?: 'TASK' | 'DSA' | 'STUDY_SCHEDULE';
  entityId: string;
  entityTitle: string;
  targetVersion?: number;
  oldValue?: string;
  proposedValue?: string;
  reason: string;
  status: PermissionStatus;
  createdAt: string;
  respondedAt?: string;
  declinedCooldownUntil?: string; // 12 hours from declinedAt
  appliedAt?: string;
  processedAt?: string;
}

export type JournalStatus = 'OPEN' | 'SUBMITTED' | 'LOCKED';

export interface DailyJournal {
  id: string;
  userId: string;
  date: string;
  todayRoutine: string;
  summary?: string;
  whatILearned: string;
  whatIBuilt: string;
  whatIStruggledWith: string;
  mistakes: string;
  mistakesLessons?: string;
  tomorrowImprovements: string;
  tomorrowFocus?: string;
  additionalNotes?: string;
  studyHours: number;
  focusedExecutionMinutes?: number;
  focusedExecutionFinalized?: boolean;
  focusedExecutionFinalizedAt?: string;
  energyRating: number; // 1 to 5
  productivityRating: number; // 1 to 5
  peerReviewRating?: number; // 1 to 5 stars given by peer/partner
  peerReviewedAt?: string;
  peerRaterId?: string;
  isShared: boolean;
  status?: JournalStatus;
  submittedAt?: string;
  lockedAt?: string;
  createdAt?: string;
  updatedAt: string;
}

export type HabitStatus = 'NO_REPORT' | 'REPORTED_RELAPSE' | 'HOLIDAY';

export interface HabitEntry {
  id: string;
  userId: string;
  date: string;
  status: HabitStatus;
  notes?: string;
  recordedAt: string;
}

export interface HabitStats {
  userId: string;
  currentStreak: number;
  bestStreak: number;
  totalCleanDays: number;
  relapseCount: number;
  lastRelapseDate?: string;
}

export type NotificationType =
  | 'MORNING_WINDOW'
  | 'TASK_REMINDER'
  | 'COMPETITION_ALERT'
  | 'APPROVAL_REQUEST'
  | 'APPROVAL_RESPONSE'
  | 'STREAK_MILESTONE'
  | 'WINDOW_CLOSING'
  | 'MIDNIGHT_SUMMARY';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  actionLink?: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: 'Rahul' | 'Dileep' | 'SYSTEM';
  action: string;
  targetType: string;
  targetId: string;
  previousState?: any;
  newState?: any;
  reason?: string;
  timestamp: string;
}

export interface MotivationQuote {
  id: string;
  quote: string;
  author: string;
  category: string;
  dayNumber: number;
}

export type LearningWindowStatus = 'NOT_STARTED' | 'ACTIVE' | 'CLOSING_SOON' | 'CLOSED';

export interface DayInfo {
  currentDate: string; // YYYY-MM-DD
  dayNumber: number; // 1 to 100
  totalDays: number; // 100
  daysRemaining: number;
  challengeStarted: boolean;
  challengeStartDate: string; // 2026-09-15
  challengeEndDate: string; // 2026-12-23
  windowStatus: LearningWindowStatus;
  windowOpensAt: string; // 04:00 AM
  windowClosesSoonAt: string; // 10:00 PM
  windowClosesAt: string; // 10:30 PM
  morningWindowStatus: MorningWindowStatus;
  morningWindowOpensAt: string; // 04:00 AM
  morningWindowClosesAt: string; // 05:00 AM
  istTime: string;
  greeting: string;
  isNightLockdown: boolean;
  isSimulatedTime?: boolean;
}

export interface CompetitionOverview {
  dayInfo: DayInfo;
  rahul: UserStats;
  dileep: UserStats;
  leaderId: string | null;
  leaderName: string | null;
  pointDifference: number;
  pointDifferenceText: string;
  habitComparison: {
    rahulStreak: number;
    dileepStreak: number;
    habitLeaderName: string | null;
    habitDifferenceDays: number;
    habitComparisonText: string;
  };
  dailyQuote: MotivationQuote;
}

export type AnalyticsMetricKey = 'CUMULATIVE' | 'DAILY' | 'TASKS' | 'DSA' | 'FOCUSED' | 'STREAK';

export interface AnalyticsTimelinePoint {
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
}

export interface AnalyticsSummary {
  rahulScore: number;
  dileepScore: number;
  leaderId: string | null;
  leaderName: string | null;
  pointDifference: number;
  pointDifferenceText: string;
  winDays: { rahul: number; dileep: number; tie: number };
  bestDailyPerformance: { rahul: number; dileep: number; topDay: number };
  averageDailyPoints: { rahul: number; dileep: number };
  dsaComparison: { rahul: number; dileep: number };
  focusedExecution: { rahul: number; dileep: number };
  learningStreak: {
    rahulCurrent: number;
    rahulBest: number;
    dileepCurrent: number;
    dileepBest: number;
  };
}

export interface AnalyticsResponse {
  challenge: {
    startDate: string;
    endDate: string;
    currentDate: string;
    currentDayNumber: number;
    totalDays: number;
    daysRemaining: number;
  };
  summary: AnalyticsSummary;
  timeline: AnalyticsTimelinePoint[];
}

export interface DashboardResponse extends CompetitionOverview {
  currentUser: User;
  partnerUser: User;
  rahulStats: UserStats;
  dileepStats: UserStats;
  currentUserStats: UserStats;
  partnerStats: UserStats;
  todayTask: DailyTask | null;
  todayDsaProblem: DSAProblem | null;
  todayTaskStatus: TaskCompletionStatus;
  todayDsaSolved: boolean;
  todaySectionStatuses: Record<ScheduleSection, ScheduleSectionStatus>;
  notifications: AppNotification[];
  pendingApprovalsForUser: PermissionRequest[];
  isReversalBlocked?: boolean;
  reversalCooldownText?: string;
  todayMorningCheckin?: MorningCheckin | null;
  userLeaves?: LeaveDay[];
  partnerLeaves?: LeaveDay[];
  remainingLeaves: number;
  isOnLeaveToday: boolean;
  dailyCheckinInfo: {
    myCheckin: DailyCheckinRecord | null;
    partnerCheckin: DailyCheckinRecord | null;
    myStreak: number;
    partnerStreak: number;
    hasCheckedInToday: boolean;
    partnerHasCheckedInToday: boolean;
    daysUntilBonus: number; // 1 to 7
    totalCoins: number;
    partnerName: string;
  };
}
