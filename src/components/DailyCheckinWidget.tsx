import React, { useState } from 'react';
import {
  Coins,
  Flame,
  CheckCircle2,
  Clock,
  Sparkles,
  Trophy,
  Loader2,
  CalendarCheck,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
import { User, DailyCheckinRecord, ProfileSettings } from '../types';
import { CheckinResult } from './CheckinSuccessModal';

interface DailyCheckinWidgetProps {
  checkinInfo?: {
    myCheckin: DailyCheckinRecord | null;
    partnerCheckin: DailyCheckinRecord | null;
    myStreak: number;
    partnerStreak: number;
    hasCheckedInToday: boolean;
    partnerHasCheckedInToday: boolean;
    daysUntilBonus: number;
    totalCoins: number;
    partnerName: string;
  };
  currentUser: User;
  partnerUser: User;
  currentProfile: ProfileSettings;
  partnerProfile: ProfileSettings;
  onCheckinSuccess: (result: CheckinResult) => void;
  isNightLockdown?: boolean;
}

export const DailyCheckinWidget: React.FC<DailyCheckinWidgetProps> = ({
  checkinInfo,
  currentUser,
  partnerUser,
  currentProfile,
  partnerProfile,
  onCheckinSuccess,
  isNightLockdown = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasCheckedIn = !!checkinInfo?.hasCheckedInToday;
  const partnerCheckedIn = !!checkinInfo?.partnerHasCheckedInToday;
  const myStreak = checkinInfo?.myStreak ?? 0;
  const partnerStreak = checkinInfo?.partnerStreak ?? 0;

  const handleCheckin = async () => {
    if (loading || hasCheckedIn) return;
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Check-in failed');
      }

      onCheckinSuccess({
        streak: data.streak,
        coinsAwarded: data.coinsAwarded || 1,
        bonusAwarded: data.bonusAwarded,
        bonusPoints: data.bonusPoints,
        totalCoinsAwarded: data.totalCoinsAwarded,
        message: data.message,
        timeStr: data.checkin?.timeStr,
      });
    } catch (err: any) {
      console.error('Checkin error:', err);
      setErrorMessage(err.message || 'Failed to check in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="daily-checkin-widget"
      className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden"
    >
      {/* Subtle background gradient glow */}
      <div className="absolute top-0 right-0 w-80 h-40 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-40 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header bar: Title & 7-Day Cycle tracker */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-500/10 border border-amber-500/30 text-amber-400">
              <Coins className="w-5 h-5 fill-amber-400/20" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                Daily Check-In & Streak Radar
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  +1 Point / Day
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Check in once during the server-controlled daily window to earn +1 point.
              </p>
            </div>
          </div>
        </div>

        {/* Daily point status */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 sm:px-4 py-2.5 flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 self-stretch sm:self-start md:self-auto">
          <div className="flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-slate-300">Daily reward:</span>
          </div>

          <div className="flex items-center gap-1">
            <div className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold bg-amber-500 text-slate-950">+1</div>
          </div>

          <span className="text-[11px] font-medium text-amber-400 whitespace-nowrap">
            {hasCheckedIn ? 'Awarded today' : 'Available once today'}
          </span>
        </div>
      </div>

      {/* Error alert if any */}
      {errorMessage && (
        <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Grid: User Action Card (Left) vs Partner Status Card (Right) */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* User Card: Daily Check-In Button or Completed State */}
        <div
          id="user-checkin-card"
          className={`rounded-xl p-4 sm:p-5 border transition-all flex flex-col justify-between ${
            hasCheckedIn
              ? 'bg-emerald-950/20 border-emerald-500/30 shadow-md shadow-emerald-950/20'
              : 'bg-gradient-to-br from-slate-900 to-slate-950 border-amber-500/40 shadow-lg shadow-amber-500/5'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <img
                src={currentProfile.avatarUrl || currentUser.avatar}
                alt={currentUser.name}
                className="w-11 h-11 rounded-xl object-cover ring-2 ring-indigo-500/40"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-100">{currentUser.name}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    YOU
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                  <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span className="font-semibold text-slate-200">{myStreak} Days</span>
                  <span>Continuous Streak</span>
                </div>
              </div>
            </div>

            {/* Status badge */}
            {hasCheckedIn ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                <CheckCircle2 className="w-3.5 h-3.5" /> Checked In
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                <Clock className="w-3.5 h-3.5" /> Pending Today
              </span>
            )}
          </div>

          {/* Action button or Checked In confirmation details */}
          <div className="mt-4 pt-4 border-t border-slate-800/80">
            {hasCheckedIn ? (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block">Today's Check-In Status:</span>
                  <span className="text-xs font-medium text-emerald-400 flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Completed at {checkinInfo?.myCheckin?.timeStr || 'Today'} IST (+1 Coin earned)
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-500 block">Streak Safe</span>
                  <span className="text-xs font-bold text-amber-400">🔥 Day {myStreak}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  id="btn-daily-checkin"
                  onClick={handleCheckin}
                  disabled={loading || isNightLockdown}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 hover:from-amber-400 hover:to-yellow-400 shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed group cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                      <span>Verifying Check-In...</span>
                    </>
                  ) : (
                    <>
                      <Coins className="w-4 h-4 text-slate-950 group-hover:scale-110 transition-transform" />
                      <span>Daily Check-In (+1 Coin & +1 Streak)</span>
                      <Sparkles className="w-3.5 h-3.5 text-slate-900" />
                    </>
                  )}
                </button>
                <p className="text-[11px] text-slate-400 text-center">
                  Instant +1 coin added to your ledger • Streak increments by 1 day
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Partner Check-In Details Card (Right) */}
        {/* "Also, I can see other checking details that whether he is checked in or not." */}
        <div
          id="partner-checkin-card"
          className={`rounded-xl p-4 sm:p-5 border transition-all flex flex-col justify-between ${
            partnerCheckedIn
              ? 'bg-slate-900/70 border-slate-700/60'
              : 'bg-slate-900/40 border-slate-800'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <img
                src={partnerProfile.avatarUrl || partnerUser.avatar}
                alt={partnerUser.name}
                className="w-11 h-11 rounded-xl object-cover ring-2 ring-emerald-500/30"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-100">{partnerUser.name}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    COMPETITOR
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                  <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span className="font-semibold text-slate-200">{partnerStreak} Days</span>
                  <span>Continuous Streak</span>
                </div>
              </div>
            </div>

            {/* Partner status badge */}
            {partnerCheckedIn ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                <CheckCircle2 className="w-3.5 h-3.5" /> Checked In
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 text-amber-400 border border-amber-500/30">
                <Clock className="w-3.5 h-3.5" /> Not Checked In
              </span>
            )}
          </div>

          {/* Partner status details */}
          <div className="mt-4 pt-4 border-t border-slate-800/80">
            {partnerCheckedIn ? (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block">{partnerUser.name}'s Status Today:</span>
                  <span className="text-xs font-medium text-emerald-400 flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Checked in at {checkinInfo?.partnerCheckin?.timeStr || 'Today'} IST
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-500 block">Earned Today</span>
                  <span className="text-xs font-bold text-amber-400">+1 Coin</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block">{partnerUser.name}'s Status Today:</span>
                  <span className="text-xs font-medium text-amber-400/90 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3.5 h-3.5" />
                    Has not completed today's check-in yet
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-500 block">Daily Check-In Status</span>
                  <span className="text-xs font-bold text-slate-300">No wake-up deadline</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
