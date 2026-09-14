import React, { useState } from 'react';
import { Sun, CheckCircle2, AlertTriangle, Clock, Shield, Sparkles, Moon, Coffee } from 'lucide-react';
import { DayInfo, MorningCheckin } from '../types';
import confetti from 'canvas-confetti';

interface MorningCheckinCardProps {
  dayInfo: DayInfo;
  checkin?: MorningCheckin | null;
  isOnLeaveToday: boolean;
  wakeUpStreak?: number;
  onCheckinSuccess: () => void;
}

export const MorningCheckinCard: React.FC<MorningCheckinCardProps> = ({
  dayInfo,
  checkin,
  isOnLeaveToday,
  wakeUpStreak = 0,
  onCheckinSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isCheckedIn = checkin?.status === 'CHECKED_IN';
  const isWindowActive = dayInfo.morningWindowStatus === 'ACTIVE';
  const isWindowClosed = dayInfo.morningWindowStatus === 'CLOSED';
  const isWindowUpcoming = dayInfo.morningWindowStatus === 'UPCOMING';
  const isMissed = checkin?.status === 'MISSED' || (isWindowClosed && !isCheckedIn && !isOnLeaveToday);

  const handleCheckin = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/morning/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to check in');
      }

      setSuccessMsg(data.message || 'Morning check-in confirmed! +2 points awarded.');
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.6 },
      });
      onCheckinSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="morning-checkin-card"
      className={`rounded-2xl border p-5 sm:p-6 transition-all shadow-xl ${
        isCheckedIn
          ? 'bg-emerald-950/20 border-emerald-500/30'
          : isWindowActive
          ? 'bg-gradient-to-r from-amber-950/40 via-indigo-950/30 to-amber-950/40 border-amber-500/50 ring-2 ring-amber-500/20'
          : isOnLeaveToday
          ? 'bg-sky-950/20 border-sky-500/30'
          : 'bg-slate-900 border-slate-800'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left Info */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div
              className={`p-2 rounded-xl flex items-center justify-center ${
                isCheckedIn
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : isWindowActive
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              <Sun className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-1.5">
                  Early Morning Wake-Up Protocol
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                    04:00–05:00 AM IST
                  </span>
                </h3>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                Current IST Time: <strong className="text-slate-200">{dayInfo.istTime} IST</strong>
                <span className="text-slate-500">•</span>
                <span>Strict 1-hour window: opens 04:00 AM, locks at 05:00 AM</span>
              </p>
            </div>
          </div>
        </div>

        {/* Right Status & Action Button */}
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {isOnLeaveToday ? (
            <div className="px-4 py-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400" />
              <span>Approved Holiday Active (Check-in waived)</span>
            </div>
          ) : isCheckedIn ? (
            <div className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2 shadow-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Checked In (+2 Points Earned)</span>
            </div>
          ) : isWindowActive ? (
            <button
              type="button"
              onClick={handleCheckin}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center gap-2"
            >
              <Coffee className="w-4 h-4" />
              {loading ? 'Verifying Wake-up...' : 'Check In +2 Pts'}
            </button>
          ) : isWindowUpcoming ? (
            <button type="button" disabled className="px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-400 text-xs font-medium flex items-center gap-2 disabled:opacity-80">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Check In • Opens at 04:00 AM IST</span>
            </button>
          ) : isWindowClosed ? (
            <button type="button" disabled className="px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium flex items-center gap-2 disabled:opacity-80">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>Check-in missed • Window closed at 05:00 AM IST</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Details & Status Banners */}
      {error && (
        <div className="mt-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mt-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {isWindowActive && !isCheckedIn && (
        <div className="mt-3 text-[11px] text-amber-300/90 bg-amber-950/30 border border-amber-500/30 rounded-lg px-3 py-1.5 flex items-center justify-between">
          <span>⚡ Morning window is live. Check in between 04:00 AM and 05:00 AM IST to secure +2 discipline points.</span>
          <span className="font-mono font-bold text-amber-200">Locks at 05:00 AM</span>
        </div>
      )}
      {(isCheckedIn || isMissed) && !isOnLeaveToday && (
        <div className={`mt-3 text-[11px] rounded-lg px-3 py-1.5 flex items-center justify-between ${isCheckedIn ? 'text-emerald-300 bg-emerald-950/30 border border-emerald-500/30' : 'text-rose-300 bg-rose-950/30 border border-rose-500/30'}`}>
          <span>{isCheckedIn ? `Completed at ${checkin?.checkedInAt ? new Date(checkin.checkedInAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : '04:00–05:00 AM IST'} (+2 pts)` : 'Today\'s check-in was missed. The wake-up streak is reset.'}</span>
          <span className="font-bold">Wake-Up Streak: {isCheckedIn ? wakeUpStreak : 0} Days</span>
        </div>
      )}
    </div>
  );
};
