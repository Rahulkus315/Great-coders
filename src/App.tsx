import React, { useState, useEffect, useCallback } from 'react';
import {
  Trophy,
  Calendar,
  Flame,
  FileSpreadsheet,
  BookOpen,
  Code2,
  BarChart2,
  ShieldCheck,
  History,
  Sparkles,
  RefreshCw,
  Clock,
  Layers,
  Award,
  Moon,
  Star,
} from 'lucide-react';
import {
  DashboardResponse,
  DailyTask,
  DSAProblem,
  ScheduleSection,
  PointLedgerEntry,
  HabitStats,
  HabitEntry,
  DailyJournal,
  PermissionRequest,
  AuditLogEntry,
  AppNotification,
  User,
} from './types';
import { Navbar } from './components/Navbar';
import { ProfileCompetitionBanner, ProfileEditModal, ProfileSettings, getDefaultProfileSettings } from './components/ProfileCompetitionBanner';
import { TodayTasks } from './components/TodayTasks';
import { RoadmapView } from './components/RoadmapView';
import { ScoreLedgerView } from './components/ScoreLedgerView';
import { HabitTracker } from './components/HabitTracker';
import { JournalView } from './components/JournalView';
import { AnalyticsView } from './components/AnalyticsView';
import { ApprovalsView } from './components/ApprovalsView';
import { HistoryView } from './components/HistoryView';
import { DayDetailModal } from './components/DayDetailModal';
import { HistoricalDayDetailModal } from './components/HistoricalDayDetailModal';
import { PastDaysCalendarModal } from './components/PastDaysCalendarModal';
import { RulebookModal } from './components/RulebookModal';
import { DailyRoutineGuide } from './components/DailyRoutineGuide';
import { AchievementsView } from './components/AchievementsView';
import { AuthModal } from './components/AuthModal';
import { MorningCheckinCard } from './components/MorningCheckinCard';
import { LeaveModal } from './components/LeaveModal';
import { DailyCheckinWidget } from './components/DailyCheckinWidget';
import { CheckinSuccessModal, CheckinResult } from './components/CheckinSuccessModal';

type ActiveTab =
  | 'TODAY'
  | 'ROADMAP'
  | 'LEDGER'
  | 'HABITS'
  | 'JOURNAL'
  | 'ACHIEVEMENTS'
  | 'ANALYTICS'
  | 'APPROVALS'
  | 'HISTORY';

export default function App() {
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [showAuthModal, setShowAuthModal] = useState<boolean>(true);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('TODAY');
  const [journalSubView, setJournalSubView] = useState<'MY_JOURNAL' | 'PARTNER_JOURNAL'>('MY_JOURNAL');
  const [selectedInspectDay, setSelectedInspectDay] = useState<number | null>(null);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showRulebook, setShowRulebook] = useState(false);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [checkinResult, setCheckinResult] = useState<CheckinResult | null>(null);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [profileSettings, setProfileSettings] = useState<Record<string, ProfileSettings>>({});

  // Core dashboard state
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Tab-specific fetched datasets
  const [roadmapData, setRoadmapData] = useState<{
    tasks: any[];
    totalDays: number;
    currentDayNumber: number;
    subjectPoints: Partial<Record<ScheduleSection, number>>;
  }>({ tasks: [], totalDays: 100, currentDayNumber: 1, subjectPoints: {} });
  const [ledgerEntries, setLedgerEntries] = useState<PointLedgerEntry[]>([]);
  const [habitData, setHabitData] = useState<{
    myStats: HabitStats;
    partnerStreak: number;
    partnerCleanDays: number;
    partnerName: string;
    comparisonText: string;
    todayRecorded: boolean;
    todayStatus: 'NO_REPORT' | 'REPORTED_RELAPSE' | 'HOLIDAY' | null;
    history: HabitEntry[];
  } | null>(null);
  const [currentJournal, setCurrentJournal] = useState<DailyJournal | null>(null);
  const [partnerJournal, setPartnerJournal] = useState<DailyJournal | null>(null);
  const [permissionsData, setPermissionsData] = useState<{
    pendingForMe: PermissionRequest[];
    myRequests: PermissionRequest[];
    allRequests: PermissionRequest[];
  }>({ pendingForMe: [], myRequests: [], allRequests: [] });
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [analyticsData, setAnalyticsData] = useState<any>(null);

  const fetchProfileSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/profile', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.profile) {
        setProfileSettings(prev => ({ ...prev, [currentUserId || data.userId]: data.profile }));
      }
    } catch (err) {
      console.error('Error loading profile settings:', err);
    }
  }, [currentUserId]);

  // Fetch all core application state
  const fetchDashboardData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load dashboard');
      const data: DashboardResponse = await res.json();
      setDashboard(data);
    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUserId]);

  const fetchTabData = useCallback(async (tab: ActiveTab) => {
    try {
      if (tab === 'ROADMAP') {
        const res = await fetch('/api/roadmap', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setRoadmapData(data);
      } else if (tab === 'LEDGER') {
        const res = await fetch('/api/ledger');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setLedgerEntries(data.entries);
      } else if (tab === 'HABITS') {
        const res = await fetch('/api/habit', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setHabitData(data);
      } else if (tab === 'JOURNAL') {
        const res = await fetch('/api/journal', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setCurrentJournal(data.journal);
        setPartnerJournal(data.partnerJournal || null);
      } else if (tab === 'APPROVALS') {
        const res = await fetch('/api/permissions', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setPermissionsData(data);
      } else if (tab === 'HISTORY') {
        const res = await fetch('/api/audit-logs');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setAuditLogs(data.logs);
      } else if (tab === 'ANALYTICS') {
        const res = await fetch('/api/analytics');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch (err) {
      console.error(`Error loading tab data for ${tab}:`, err);
    }
  }, [currentUserId]);

  useEffect(() => {
    const initializeSession = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) {
          setCurrentUserId('');
          setShowAuthModal(true);
          setLoading(false);
          setSessionChecked(true);
          return;
        }

        const data = await res.json();
        if (data.user) {
          setCurrentUserId(data.user.id);
          setShowAuthModal(false);
        } else {
          setCurrentUserId('');
          setShowAuthModal(true);
          setLoading(false);
        }
      } catch {
        setCurrentUserId('');
        setShowAuthModal(true);
        setLoading(false);
      } finally {
        setSessionChecked(true);
      }
    };

    initializeSession();
  }, []);

  useEffect(() => {
    if (!sessionChecked || !currentUserId) return;
    fetchDashboardData();
    fetchTabData(activeTab);
    fetchProfileSettings();
  }, [sessionChecked, currentUserId, activeTab, fetchDashboardData, fetchTabData, fetchProfileSettings]);

  // Periodic refresh every 30 seconds for real-time synchronization
  useEffect(() => {
    const timer = setInterval(() => {
      fetchDashboardData();
    }, 30000);
    return () => clearInterval(timer);
  }, [fetchDashboardData]);

  // Handlers for Task Actions
  const handleCompleteSection = async (taskId: string, section: ScheduleSection) => {
    const res = await fetch(`/api/tasks/${taskId}/sections/${section}/complete`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to complete section');
    }
    await fetchDashboardData();
    await fetchTabData(activeTab);
  };

  const handleCompleteTodayTask = async () => {
    if (!dashboard?.todayTask) return;
    try {
      const res = await fetch(`/api/tasks/${dashboard.todayTask.id}/complete`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      });
      if (res.ok) {
        await fetchDashboardData();
        await fetchTabData(activeTab);
      }
    } catch (err) {
      console.error('Failed to complete task:', err);
    }
  };

  const handleRequestReversal = async (reason: string) => {
    if (!dashboard?.todayTask) return;
    try {
      const res = await fetch(`/api/tasks/${dashboard.todayTask.id}/reversal`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        await fetchDashboardData();
        await fetchTabData(activeTab);
      }
    } catch (err) {
      console.error('Failed to request reversal:', err);
    }
  };

  const handleRequestScheduleChange = async (payload: { entityId: string; entityType: 'TASK' | 'DSA'; proposedDay: number; reason: string }) => {
    try {
      const res = await fetch('/api/future-schedule-request', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to submit schedule change request.');
      }
      await fetchDashboardData();
      await fetchTabData('APPROVALS');
      await fetchTabData('ROADMAP');
      return data;
    } catch (err) {
      console.error('Failed to submit future schedule request:', err);
      throw err;
    }
  };

  const handleSubmitDsaAttempt = async (timeMinutes: number, notes: string) => {
    if (!dashboard?.todayDsaProblem) return;
    try {
      const res = await fetch('/api/dsa/attempt', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId: dashboard.todayDsaProblem.id,
          solved: true,
          timeSpentMinutes: timeMinutes,
          notes,
        }),
      });
      if (res.ok) {
        await fetchDashboardData();
        await fetchTabData(activeTab);
      }
    } catch (err) {
      console.error('Failed to submit DSA attempt:', err);
    }
  };

  // Handlers for Habit Tracker
  const handleHabitCheckIn = async (status: 'REPORTED_RELAPSE', notes?: string) => {
    try {
      const res = await fetch('/api/habit/checkin', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, confirmed: true, notes }),
      });
      if (res.ok) {
        await fetchTabData('HABITS');
        await fetchDashboardData();
      }
    } catch (err) {
      console.error('Failed habit check-in:', err);
    }
  };

  // Handlers for Journal
  const handleSaveJournal = async (journal: Partial<DailyJournal>) => {
    try {
      const res = await fetch('/api/journal', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: dashboard?.dayInfo.currentDate,
          ...journal,
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        setCurrentJournal(saved.journal);
        await fetchDashboardData();
      }
    } catch (err) {
      console.error('Failed to save journal:', err);
    }
  };

  const handleRatePartner = async (rating: number) => {
    try {
      const res = await fetch('/api/journal/rate-partner', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: dashboard?.dayInfo.currentDate,
          rating,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPartnerJournal(data.partnerJournal);
        await fetchDashboardData();
      }
    } catch (err) {
      console.error('Failed to rate partner journal:', err);
    }
  };

  // Handlers for Approvals
  const handleApproveRequest = async (id: string, responseNotes?: string) => {
    try {
      const res = await fetch(`/api/permissions/${id}/approve`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseNotes }),
      });
      if (res.ok) {
        await fetchTabData('APPROVALS');
        await fetchDashboardData();
      }
    } catch (err) {
      console.error('Failed to approve request:', err);
    }
  };

  const handleDeclineRequest = async (id: string, responseNotes?: string) => {
    try {
      const res = await fetch(`/api/permissions/${id}/decline`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseNotes }),
      });
      if (res.ok) {
        await fetchTabData('APPROVALS');
        await fetchDashboardData();
      }
    } catch (err) {
      console.error('Failed to decline request:', err);
    }
  };

  const handleLoginSuccess = (user: User) => {
    setCurrentUserId(user.id);
    setShowAuthModal(false);
    fetchDashboardData();
    fetchProfileSettings();
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      await fetchDashboardData();
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      await fetchDashboardData();
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    }
  };

  if (!dashboard) {
    return (
      <>
        <AuthModal
          isOpen={showAuthModal}
          onLoginSuccess={handleLoginSuccess}
        />
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300 space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-semibold tracking-wider">Synchronizing Great Coders...</p>
          <span className="text-xs text-slate-500 font-mono">IST (Asia/Kolkata) • Daily execution and progress</span>
        </div>
      </>
    );
  }

  const currentUser = dashboard.currentUser;
  const partnerUser = dashboard.partnerUser;
  const currentProfile = profileSettings[currentUser.id] || getDefaultProfileSettings(currentUser);
  const partnerProfile = profileSettings[partnerUser.id] || getDefaultProfileSettings(partnerUser);
  const fallbackJournal: DailyJournal = {
    id: '',
    userId: currentUser.id,
    date: dashboard.dayInfo.currentDate,
    todayRoutine: '',
    whatILearned: '',
    whatIBuilt: '',
    whatIStruggledWith: '',
    mistakes: '',
    tomorrowImprovements: '',
    studyHours: 3,
    energyRating: 4,
    productivityRating: 4,
    isShared: true,
    status: 'OPEN',
    updatedAt: new Date().toISOString(),
  };
  const journalForView = currentJournal ?? fallbackJournal;

  const tabs: Array<{ id: ActiveTab; label: string; icon: React.ReactNode; badge?: number | string }> = [
    { id: 'TODAY', label: "Today's Mission", icon: <Trophy className="w-4 h-4" /> },
    { id: 'ROADMAP', label: '100-Day Roadmap', icon: <Layers className="w-4 h-4" /> },
    { id: 'LEDGER', label: 'Point Ledger', icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: 'HABITS', label: 'Self-Control', icon: <Flame className="w-4 h-4" /> },
    { id: 'JOURNAL', label: 'Today’s Live', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'ACHIEVEMENTS', label: 'Badges', icon: <Award className="w-4 h-4" /> },
    { id: 'ANALYTICS', label: 'Head-to-Head', icon: <BarChart2 className="w-4 h-4" /> },
    {
      id: 'APPROVALS',
      label: 'Mutual Approvals',
      icon: <ShieldCheck className="w-4 h-4" />,
      badge: dashboard.pendingApprovalsForUser.length > 0 ? dashboard.pendingApprovalsForUser.length : undefined,
    },
    { id: 'HISTORY', label: 'Activity History', icon: <History className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* 1. Global Header Bar (Section 6) */}
      <Navbar
        currentUser={currentUser}
        partnerUser={partnerUser}
        dayInfo={dashboard.dayInfo}
        notifications={dashboard.notifications}
        remainingLeaves={dashboard.remainingLeaves ?? 5}
        onOpenLeavesModal={() => setShowLeaveModal(true)}
        onOpenCalendar={() => setShowCalendarModal(true)}
        onMarkNotificationRead={handleMarkNotificationRead}
        onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* 2. Profile competition banner (LinkedIn-inspired profile header) */}
        <ProfileCompetitionBanner
          currentUser={currentUser}
          partnerUser={partnerUser}
          currentUserStats={dashboard.currentUserStats}
          partnerStats={dashboard.partnerStats}
          dayInfo={dashboard.dayInfo}
          leaderName={dashboard.leaderName}
          currentProfile={currentProfile}
          partnerProfile={partnerProfile}
          canEdit={currentUserId === currentUser.id}
          onEditProfile={() => setShowProfileEditor(true)}
        />

        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/85 p-4 shadow-[0_14px_40px_rgba(15,23,42,0.4)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400">Today’s Mission</p>
                <h3 className="mt-1 text-lg font-black text-white">Execution Snapshot</h3>
              </div>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                {dashboard.todayTaskStatus}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Task</p>
                <p className="mt-2 text-sm font-bold text-slate-100">{dashboard.todayTask ? dashboard.todayTask.title : 'Rest / Leave Day'}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">DSA</p>
                <p className="mt-2 text-sm font-bold text-slate-100">{dashboard.todayDsaProblem ? dashboard.todayDsaProblem.title : 'No problem scheduled'}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Focus Hours</p>
                <p className="mt-2 text-sm font-bold text-slate-100">{dashboard.currentUserStats.totalStudyHours}h</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/85 p-4 shadow-[0_14px_40px_rgba(15,23,42,0.4)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400">Competition vs</p>
            <h3 className="mt-1 text-lg font-black text-white">{currentUser.name} vs {partnerUser.name}</h3>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
                <span className="text-slate-300">Points</span>
                <span className="font-bold text-white">{dashboard.currentUserStats.totalPoints} - {dashboard.partnerStats.totalPoints}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
                <span className="text-slate-300">Streak</span>
                <span className="font-bold text-white">{dashboard.currentUserStats.currentStreak} - {dashboard.partnerStats.currentStreak}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
                <span className="text-slate-300">DSA solved</span>
                <span className="font-bold text-white">{dashboard.currentUserStats.dsaSolved} - {dashboard.partnerStats.dsaSolved}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
                <span className="text-slate-300">Leader</span>
                <span className="font-bold text-amber-300">{dashboard.leaderName || 'Tied'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Night Lockdown Active Notification Banner (10:30 PM - 04:00 AM IST) */}
        {dashboard.dayInfo.isNightLockdown && (
          <div className="bg-gradient-to-r from-purple-950/80 via-slate-900 to-indigo-950/80 border border-purple-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                <Moon className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  Night Lockdown Curfew (10:30 PM – 04:00 AM IST)
                  <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase font-mono">
                    Read-Only Mode
                  </span>
                </h4>
                <p className="text-xs text-slate-400">
                  Task completions, DSA practice, and check-ins are frozen for rest & recovery. You can browse the platform or update your <strong>Today’s Live</strong> reflection.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('JOURNAL')}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors shadow-md flex items-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5" /> Open Today’s Live
            </button>
          </div>
        )}

        {/* 3. Tab Navigation Bar & Quick Actions */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="bg-slate-900/90 backdrop-blur-md p-1 sm:p-1.5 rounded-2xl border border-slate-800 flex items-center overflow-x-auto gap-1 shadow-md flex-1 scroll-smooth">
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (tab.id === 'JOURNAL') {
                      setJournalSubView('MY_JOURNAL');
                    }
                  }}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex-shrink-0 min-h-[42px] relative ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Dedicated Button to Inspect & Rate Partner's Journal */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('JOURNAL');
                setJournalSubView('PARTNER_JOURNAL');
              }}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 sm:px-3.5 py-2.5 rounded-2xl bg-purple-950/80 hover:bg-purple-900 border border-purple-500/40 text-xs font-bold text-purple-200 hover:text-white transition-all shadow-md cursor-pointer whitespace-nowrap min-h-[42px]"
              title={`View ${partnerUser.name}'s Today’s Live and give a 1-5 star peer rating`}
            >
              <Star className="w-4 h-4 text-amber-400 fill-amber-400 flex-shrink-0" />
              <span className="hidden xs:inline">{partnerUser.name}'s Journal</span>
              <span className="xs:hidden">Partner Journal</span>
              <span className="text-amber-400 font-semibold text-[11px]">& Rating</span>
            </button>

            <button
              type="button"
              onClick={() => setShowRulebook(true)}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors shadow-md cursor-pointer whitespace-nowrap min-h-[42px]"
            >
              <BookOpen className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <span>Rules</span>
            </button>
          </div>
        </div>

        {/* 4. Active Tab Content View */}
        <div className="animate-in fade-in duration-200">
          {activeTab === 'TODAY' && (
            <div className="space-y-6">
              {/* Daily Check-In & Streak System (+1 Coin & 7-Day Bonus) */}
              <DailyCheckinWidget
                checkinInfo={dashboard.dailyCheckinInfo}
                currentUser={currentUser}
                partnerUser={partnerUser}
                isNightLockdown={dashboard.dayInfo.isNightLockdown}
                onCheckinSuccess={(result) => {
                  setCheckinResult(result);
                  setShowCheckinModal(true);
                  fetchDashboardData();
                }}
              />

              <DailyRoutineGuide />

              {/* 04:00 AM - 05:00 AM IST Morning Wake-Up Protocol */}
              <MorningCheckinCard
                dayInfo={dashboard.dayInfo}
                checkin={dashboard.todayMorningCheckin}
                isOnLeaveToday={dashboard.isOnLeaveToday}
                wakeUpStreak={dashboard.currentUserStats.morningCheckinStreak}
                onCheckinSuccess={fetchDashboardData}
              />

              <TodayTasks
                task={dashboard.todayTask}
                dsaProblem={dashboard.todayDsaProblem}
                sectionStatuses={dashboard.todaySectionStatuses}
                windowStatus={dashboard.dayInfo.windowStatus}
                reversalCooldownText={dashboard.reversalCooldownText}
                isReversalBlocked={dashboard.isReversalBlocked}
                isOnLeaveToday={dashboard.isOnLeaveToday}
                isNightLockdown={dashboard.dayInfo.isNightLockdown}
                onOpenLeavesModal={() => setShowLeaveModal(true)}
                onCompleteSection={section => {
                  if (!dashboard.todayTask) return Promise.reject(new Error('Today\'s task is unavailable.'));
                  return handleCompleteSection(dashboard.todayTask.id, section);
                }}
                onUndoSection={async section => {
                  if (!dashboard.todayTask) throw new Error('Today\'s task is unavailable.');
                  const res = await fetch(`/api/tasks/${dashboard.todayTask.id}/sections/${section}/undo`, {
                    method: 'POST',
                    credentials: 'include',
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(data.error || 'Failed to undo section completion');
                  await fetchDashboardData();
                  await fetchTabData(activeTab);
                }}
              />
            </div>
          )}

          {activeTab === 'ACHIEVEMENTS' && (
            <AchievementsView
              rahul={dashboard.rahulStats}
              dileep={dashboard.dileepStats}
              currentUserId={currentUserId}
            />
          )}

          {activeTab === 'ROADMAP' && (
            <RoadmapView
              tasks={roadmapData.tasks}
              totalDays={roadmapData.totalDays}
              currentDayNumber={roadmapData.currentDayNumber}
              subjectPoints={roadmapData.subjectPoints}
              pendingScheduleRequests={permissionsData.allRequests.filter(req => req.actionType === 'SCHEDULE_CHANGE')}
              onSelectDay={dayNum => setSelectedInspectDay(dayNum)}
              onCompleteSection={handleCompleteSection}
            />
          )}

          {activeTab === 'LEDGER' && (
            <ScoreLedgerView
              entries={ledgerEntries}
              currentUserId={currentUserId}
            />
          )}

          {activeTab === 'HABITS' && habitData && (
            <HabitTracker
              myStats={habitData.myStats}
              partnerStreak={habitData.partnerStreak}
              partnerCleanDays={habitData.partnerCleanDays}
              partnerName={habitData.partnerName}
              comparisonText={habitData.comparisonText}
              todayRecorded={habitData.todayRecorded}
              todayStatus={habitData.todayStatus}
              history={habitData.history}
              currentUserName={currentUser.name}
              onCheckIn={handleHabitCheckIn}
            />
          )}

          {activeTab === 'JOURNAL' && (
            <JournalView
              initialJournal={journalForView}
              partnerJournal={partnerJournal}
              partnerName={partnerUser.name}
              currentDate={dashboard.dayInfo.currentDate}
              isNightLockdown={dashboard.dayInfo.isNightLockdown}
              initialView={journalSubView}
              onSaveJournal={handleSaveJournal}
              onRatePartner={handleRatePartner}
            />
          )}

          {activeTab === 'ANALYTICS' && analyticsData && (
            <AnalyticsView
              analytics={analyticsData}
              rahul={dashboard.rahulStats}
              dileep={dashboard.dileepStats}
            />
          )}

          {activeTab === 'APPROVALS' && (
            <ApprovalsView
              pendingForMe={permissionsData.pendingForMe}
              myRequests={permissionsData.myRequests}
              allRequests={permissionsData.allRequests}
              currentUserName={currentUser.name}
              onApprove={handleApproveRequest}
              onDecline={handleDeclineRequest}
            />
          )}

          {activeTab === 'HISTORY' && (
            <HistoryView
              logs={auditLogs}
              currentDate={dashboard.dayInfo.currentDate}
              onOpenCalendar={() => setShowCalendarModal(true)}
            />
          )}
        </div>
      </main>

      {/* 5. Historical Day Detail & Approval Modal */}
      {selectedInspectDay !== null && (
        <HistoricalDayDetailModal
          dayNumber={selectedInspectDay}
          isOpen={selectedInspectDay !== null}
          onClose={() => setSelectedInspectDay(null)}
          currentUserId={currentUserId}
          onApprovalRequested={fetchDashboardData}
        />
      )}

      {/* 5B. Past Days Calendar Archive (Days 1 to 100) */}
      <PastDaysCalendarModal
        isOpen={showCalendarModal}
        onClose={() => setShowCalendarModal(false)}
        currentUserId={currentUserId}
        currentDayNumber={dashboard.dayInfo.dayNumber}
        onRefreshData={fetchDashboardData}
      />

      {/* 6. Official Rules & Scoring Guide Modal */}
      <RulebookModal
        isOpen={showRulebook}
        onClose={() => setShowRulebook(false)}
      />

      {/* 7. 5-Day Leave & Schedule Shift Modal */}
      <LeaveModal
        isOpen={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        dayInfo={dashboard.dayInfo}
        userLeaves={dashboard.userLeaves || []}
        remainingLeaves={dashboard.remainingLeaves ?? 5}
        isOnLeaveToday={dashboard.isOnLeaveToday}
        onApplySuccess={fetchDashboardData}
      />

      {/* 8. Permanent Account Authentication & Identity Lock Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onLoginSuccess={handleLoginSuccess}
      />

      <ProfileEditModal
        isOpen={showProfileEditor}
        currentUser={currentUser}
        profile={currentProfile}
        onClose={() => setShowProfileEditor(false)}
        onSave={async (nextProfile) => {
          try {
            const res = await fetch('/api/profile', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(nextProfile),
            });

            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error || 'Profile save failed');
            }

            const data = await res.json();
            setProfileSettings(prev => ({
              ...prev,
              [currentUser.id]: data.profile,
            }));
            await fetchProfileSettings();
          } catch (err) {
            console.error('Failed to save profile to server:', err);
            throw err;
          }
        }}
      />

      {/* 9. Daily Check-In Celebration Pop-up (+1 Coin & Streak Added) */}
      <CheckinSuccessModal
        isOpen={showCheckinModal}
        onClose={() => setShowCheckinModal(false)}
        result={checkinResult}
        userName={currentUser.name}
      />

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <p>Great Coders</p>
        <p className="mt-1 text-[11px] text-slate-600">
          Compete. Build. Learn. Improve.
        </p>
      </footer>
    </div>
  );
}
