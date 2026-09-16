import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Moon,
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
import { ProfileCompetitionBanner, ProfileEditModal, getDefaultProfileSettings } from './components/ProfileCompetitionBanner';
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
import { DashboardSidebar, MobileMenuButton } from './components/DashboardSidebar';

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

const normalizePermissionsData = (data: Partial<{
  pendingForMe: PermissionRequest[];
  myRequests: PermissionRequest[];
  allRequests: PermissionRequest[];
  all: PermissionRequest[];
}>) => ({
  pendingForMe: Array.isArray(data.pendingForMe) ? data.pendingForMe : [],
  myRequests: Array.isArray(data.myRequests) ? data.myRequests : [],
  allRequests: Array.isArray(data.allRequests) ? data.allRequests : Array.isArray(data.all) ? data.all : [],
});

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
  const [showSidebar, setShowSidebar] = useState(false);

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
    partnerBestStreak: number;
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
        const permissionsRes = await fetch('/api/permissions', { credentials: 'include' });
        if (permissionsRes.ok) setPermissionsData(normalizePermissionsData(await permissionsRes.json()));
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
        setPermissionsData(normalizePermissionsData(data));
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
  }, [sessionChecked, activeTab, fetchDashboardData, fetchTabData]);

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

  const handleRequestCompletion = async (taskId: string, section: ScheduleSection) => {
    const reason = window.prompt(`Why do you need late completion approval for ${section}?`);
    if (!reason) return;
    const res = await fetch(`/api/tasks/${taskId}/sections/${section}/request-completion`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to request late completion.');
    await fetchDashboardData();
    await fetchTabData('ROADMAP');
    await fetchTabData('APPROVALS');
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

  const handleRequestJournalReset = async (reason: string) => {
    const res = await fetch('/api/journal/reset-request', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dashboard?.dayInfo.currentDate, reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to request entry reset.');
    await fetchTabData('APPROVALS');
    await fetchTabData('JOURNAL');
  };

  // Handlers for Approvals
  const handleApproveRequest = async (id: string, responseNotes?: string) => {
    const res = await fetch(`/api/permissions/${id}/approve`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseNotes }),
      });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to approve request.');
    await fetchTabData('APPROVALS');
    await fetchTabData('ROADMAP');
    await fetchTabData('JOURNAL');
    await fetchDashboardData();
  };

  const handleDeclineRequest = async (id: string, responseNotes?: string) => {
    const res = await fetch(`/api/permissions/${id}/decline`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseNotes }),
      });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to decline request.');
    await fetchTabData('APPROVALS');
    await fetchTabData('ROADMAP');
    await fetchDashboardData();
  };

  const handleLoginSuccess = (user: User) => {
    setCurrentUserId(user.id);
    setShowAuthModal(false);
    fetchDashboardData();
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setCurrentUserId('');
    setDashboard(null);
    setShowAuthModal(true);
    setSessionChecked(true);
    setShowSidebar(false);
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST', credentials: 'include' });
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
  const currentProfile = dashboard.profile || getDefaultProfileSettings(currentUser);
  const partnerProfile = dashboard.partnerProfile || getDefaultProfileSettings(partnerUser);
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

  return (
    <div className="app-shell min-h-screen text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      <DashboardSidebar
        currentUser={currentUser}
          currentProfile={currentProfile}
        activeTab={activeTab}
        pendingApprovals={dashboard.pendingApprovalsForUser.length}
        isOpen={showSidebar}
        onClose={() => setShowSidebar(false)}
        onAction={action => {
          if (action.type === 'tab') {
            setActiveTab(action.value);
            if (action.value === 'JOURNAL') setJournalSubView('MY_JOURNAL');
          } else if (action.type === 'calendar') {
            setShowCalendarModal(true);
          } else if (action.type === 'profile') {
            setShowProfileEditor(true);
          } else {
            void handleLogout();
          }
        }}
      />
      {/* 1. Global Header Bar (Section 6) */}
      <div className="app-content">
        <div className="mobile-topbar">
          <MobileMenuButton onClick={() => setShowSidebar(true)} />
          <div className="mobile-brand"><span className="brand-mark brand-mark-small">GC</span><strong>Great Coders</strong></div>
          <span className="mobile-day">D{dashboard.dayInfo.dayNumber}</span>
        </div>
        <Navbar
          currentUser={currentUser}
          partnerUser={partnerUser}
          currentProfile={currentProfile}
          dayInfo={dashboard.dayInfo}
          notifications={dashboard.notifications}
          remainingLeaves={dashboard.remainingLeaves ?? 5}
          onOpenLeavesModal={() => setShowLeaveModal(true)}
          onOpenCalendar={() => setShowCalendarModal(true)}
          onMarkNotificationRead={handleMarkNotificationRead}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        />

      {/* Main Container */}
      <main className="dashboard-main flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
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

        {/* 4. Active Tab Content View */}
        <div className="animate-in fade-in duration-200">
          {activeTab === 'TODAY' && (
            <div className="space-y-6">
              {/* Daily Check-In & Streak System (+1 Coin & 7-Day Bonus) */}
              <DailyCheckinWidget
                checkinInfo={dashboard.dailyCheckinInfo}
                currentUser={currentUser}
                partnerUser={partnerUser}
                currentProfile={currentProfile}
                partnerProfile={partnerProfile}
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
              pendingScheduleRequests={permissionsData.allRequests.filter(req => req.actionType === 'SCHEDULE_CHANGE' || req.actionType === 'RETROACTIVE_COMPLETION')}
              currentUserId={currentUserId}
              onSelectDay={dayNum => setSelectedInspectDay(dayNum)}
              onCompleteSection={handleCompleteSection}
              onRequestCompletion={handleRequestCompletion}
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
              partnerBestStreak={habitData.partnerBestStreak}
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
              onRequestReset={handleRequestJournalReset}
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
          onApprovalRequested={async () => {
            await fetchDashboardData();
            await fetchTabData('ROADMAP');
            await fetchTabData('APPROVALS');
          }}
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
            setDashboard(prev => prev ? { ...prev, profile: data.profile } : prev);
            await fetchDashboardData();
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
    </div>
  );
}
