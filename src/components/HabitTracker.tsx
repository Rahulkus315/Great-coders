import React, { useState } from 'react';
import {
  ShieldAlert,
  Flame,
  CheckCircle2,
  AlertTriangle,
  History,
  Lock,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { HabitStats, HabitEntry } from '../types';
import { ConfirmationModal } from './ConfirmationModal';

interface HabitTrackerProps {
  myStats: HabitStats;
  partnerStreak: number;
  partnerCleanDays: number;
  partnerName: string;
  comparisonText: string;
  todayRecorded: boolean;
  todayStatus: 'NO_REPORT' | 'REPORTED_RELAPSE' | 'HOLIDAY' | null;
  history: HabitEntry[];
  currentUserName: string;
  onCheckIn: (status: 'REPORTED_RELAPSE', notes?: string) => Promise<void>;
}

export const HabitTracker: React.FC<HabitTrackerProps> = ({
  myStats,
  partnerStreak,
  partnerCleanDays,
  partnerName,
  comparisonText,
  todayRecorded,
  todayStatus,
  history,
  currentUserName,
  onCheckIn,
}) => {
  const [showRelapseConfirm, setShowRelapseConfirm] = useState(false);
  const [notes, setNotes] = useState('');

  const handleConfirmRelapse = async () => {
    setShowRelapseConfirm(false);
    await onCheckIn('REPORTED_RELAPSE', notes);
    setNotes('');
  };

  const isReportedToday = todayStatus === 'REPORTED_RELAPSE';

  return (
    <div className="space-y-6">
      {/* Competitive Habit Header Banner (Section 29) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="text-center space-y-1 mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Flame className="w-4 h-4 fill-amber-400" /> SELF-CONTROL STREAK COMPETITION
          </div>
          <p className="text-xs text-slate-400">
            High-discipline mental endurance • Shared streak comparison
          </p>
        </div>

        {/* Head-to-Head Streak Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <div className="bg-slate-950/80 border border-slate-800 p-5 rounded-xl text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              Rahul {currentUserName === 'Rahul' && '(You)'}
            </span>
            <div className="text-3xl font-extrabold text-amber-400 flex items-center justify-center gap-1.5">
              <Flame className="w-6 h-6 fill-amber-400" />
              {currentUserName === 'Rahul' ? myStats.currentStreak : partnerStreak} Days
            </div>
            <span className="text-[11px] text-slate-500 block mt-1">
              Best: {currentUserName === 'Rahul' ? myStats.bestStreak : Math.max(partnerStreak, 18)} Days
            </span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 p-5 rounded-xl text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              Dileep {currentUserName === 'Dileep' && '(You)'}
            </span>
            <div className="text-3xl font-extrabold text-amber-400 flex items-center justify-center gap-1.5">
              <Flame className="w-6 h-6 fill-amber-400" />
              {currentUserName === 'Dileep' ? myStats.currentStreak : partnerStreak} Days
            </div>
            <span className="text-[11px] text-slate-500 block mt-1">
              Best: {currentUserName === 'Dileep' ? myStats.bestStreak : Math.max(partnerStreak, 14)} Days
            </span>
          </div>
        </div>

        {/* Central Gap Banner */}
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            <span>{comparisonText}</span>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" /> 🧠 SELF-CONTROL
            </h3>
            <p className="text-xs text-slate-400">
              No action is required. Your streak continues unless you report a relapse today.
            </p>
          </div>
          {isReportedToday && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20">
              Status: REPORTED
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Current Streak</p>
            <p className="mt-2 text-2xl font-black text-amber-400">🔥 {myStats.currentStreak} days</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Best Streak</p>
            <p className="mt-2 text-2xl font-black text-emerald-400">🏆 {myStats.bestStreak} days</p>
          </div>
        </div>

        <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-200">Today</span>
            <span className={`text-xs px-2 py-1 rounded-full border ${isReportedToday ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>
              {isReportedToday ? 'Reported' : 'Status pending'}
            </span>
          </div>

          <p className="text-xs text-slate-400">
            {isReportedToday
              ? 'Today\'s status has been recorded.'
              : 'No action is required. Your streak continues unless you report a relapse today.'}
          </p>

          {!isReportedToday ? (
            <button
              type="button"
              onClick={() => setShowRelapseConfirm(true)}
              className="w-full px-5 py-3 rounded-xl text-sm font-black transition-all cursor-pointer flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white border border-rose-500/40 shadow-lg shadow-rose-600/20"
            >
              <AlertTriangle className="w-4 h-4" /> Today done 😭
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="w-full px-5 py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2 bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> ✓ Today's status recorded
            </button>
          )}
        </div>
      </div>

      {/* Private Personal History Log */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" /> Your Private Consistency Log (Last 30 Days)
        </h4>

        <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/60">
          {history.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">No logs recorded yet.</p>
          ) : (
            history.map(item => (
              <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
                <span className="font-mono text-slate-400">{item.date}</span>
                <span
                  className={`font-semibold px-2 py-0.5 rounded ${
                    item.status === 'NO_REPORT'
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : item.status === 'HOLIDAY'
                        ? 'text-sky-400 bg-sky-500/10'
                        : 'text-rose-400 bg-rose-500/10'
                  }`}
                >
                  {item.status === 'NO_REPORT'
                    ? 'Maintained'
                    : item.status === 'HOLIDAY'
                      ? 'Holiday'
                      : 'Relapse Recorded'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={showRelapseConfirm}
        title="Confirm today's entry"
        message="This will record today's self-control status as a relapse and reset your current streak at the end of the day. Are you sure?"
        warningNote="Clicking confirm records the relapse. The streak will reset only when today's challenge day is finalized at midnight."
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={handleConfirmRelapse}
        onCancel={() => setShowRelapseConfirm(false)}
      />
    </div>
  );
};
