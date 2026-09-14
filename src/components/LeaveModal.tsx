import React, { useState } from 'react';
import { Palmtree, Calendar, Shield, AlertCircle, CheckCircle2, Clock, X, Info } from 'lucide-react';
import { DayInfo, LeaveDay } from '../types';

interface LeaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  dayInfo: DayInfo;
  userLeaves: LeaveDay[];
  remainingLeaves: number;
  isOnLeaveToday: boolean;
  onApplySuccess: () => void;
}

export const LeaveModal: React.FC<LeaveModalProps> = ({
  isOpen,
  onClose,
  dayInfo,
  userLeaves,
  remainingLeaves,
  isOnLeaveToday,
  onApplySuccess,
}) => {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (remainingLeaves <= 0) {
      setError('Leave quota exhausted (5/5 used).');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/leaves/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dayInfo.currentDate,
          reason: reason || 'Personal Rest / Holiday',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to apply for holiday');
      }

      setSuccess(data.message || 'Approved holiday recorded! Task schedule shifted forward by 1 day.');
      setReason('');
      onApplySuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Palmtree className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                5-Day Holiday & Schedule Shift System
              </h3>
              <p className="text-xs text-slate-400">
                100-Day Quota: September 15 – December 23, 2026
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quota Counter Visual */}
        <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-center">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Remaining Holidays
            </span>
            <span className="text-2xl font-black text-sky-400 mt-0.5 block">
              {remainingLeaves} <span className="text-xs font-normal text-slate-400">/ 5 Days</span>
            </span>
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Used Holidays
            </span>
            <span className="text-2xl font-black text-slate-200 mt-0.5 block">
              {userLeaves.length} <span className="text-xs font-normal text-slate-400">Days Taken</span>
            </span>
          </div>
        </div>

        {/* Quota Badges */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3, 4, 5].map(idx => {
            const isUsed = idx <= userLeaves.length;
            return (
              <div
                key={idx}
                className={`flex-1 py-1.5 rounded-lg text-center text-xs font-bold border transition-all ${
                  isUsed
                    ? 'bg-slate-800/80 border-slate-700 text-slate-400 line-through'
                    : 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                }`}
              >
                Day {idx}
              </div>
            );
          })}
        </div>

        {/* Schedule Shift Rule Explanation */}
        <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-500/30 text-xs text-slate-300 space-y-2">
          <div className="flex items-center gap-2 text-indigo-300 font-semibold">
            <Info className="w-4 h-4" />
            <span>Zero-Penalty Schedule Shift Guarantee</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            When you take an approved holiday, today's curriculum task and DSA problem shift forward by exactly 1 day.
            You will complete today's task tomorrow without losing any points, breaking your streak, or incurring midnight penalties.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Apply Today Action Form */}
        {isOnLeaveToday ? (
          <div className="p-4 rounded-xl bg-sky-950/40 border border-sky-500/40 text-center space-y-1">
            <span className="text-xs font-bold text-sky-300 flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Holiday Already Active for Today ({dayInfo.currentDate})
            </span>
            <p className="text-[11px] text-slate-400">
              Your task schedule is shifted. Rest well!
            </p>
          </div>
        ) : remainingLeaves > 0 ? (
          <form onSubmit={handleApplyLeave} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Reason / Note (Optional)
              </label>
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Travel, illness, family event, personal rest"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 font-bold text-xs text-white shadow-md shadow-sky-600/30 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Palmtree className="w-4 h-4" />
              {loading ? 'Submitting Leave...' : `Take Holiday Today (${dayInfo.currentDate})`}
            </button>
          </form>
        ) : (
          <div className="p-3 rounded-xl bg-slate-800 text-slate-400 text-xs text-center">
            All 5 holiday quotas have been fully utilized for this 100-day competition.
          </div>
        )}

        {/* Leave History */}
        {userLeaves.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Recorded Holidays ({userLeaves.length})
            </span>
            <div className="max-h-28 overflow-y-auto space-y-1 font-mono text-[11px]">
              {userLeaves.map((l, i) => (
                <div
                  key={l.id || i}
                  className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between text-slate-300"
                >
                  <span className="text-sky-400 font-semibold">{l.date}</span>
                  <span className="text-slate-400 truncate max-w-xs">{l.reason || 'Holiday'}</span>
                  <span className="text-[10px] text-slate-500">Day {i + 1}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
