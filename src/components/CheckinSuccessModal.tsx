import React from 'react';
import { Sparkles, Flame, Trophy, Coins, CheckCircle, ArrowRight, X } from 'lucide-react';

export interface CheckinResult {
  streak: number;
  coinsAwarded: number;
  bonusAwarded?: boolean;
  bonusPoints?: number;
  totalCoinsAwarded?: number;
  message?: string;
  timeStr?: string;
}

interface CheckinSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: CheckinResult | null;
  userName: string;
}

export const CheckinSuccessModal: React.FC<CheckinSuccessModalProps> = ({
  isOpen,
  onClose,
  result,
  userName,
}) => {
  if (!isOpen || !result) return null;

  const streak = result.streak || 1;
  const isBonus = !!result.bonusAwarded;
  const dayInCycle = streak % 7 === 0 ? 7 : streak % 7;
  const daysUntilNextBonus = streak % 7 === 0 ? 7 : 7 - (streak % 7);

  return (
    <div
      id="checkin-success-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-amber-500/60 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-amber-500/20 text-center overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Background glow effects */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />
        {isBonus && (
          <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
        )}

        {/* Close Button */}
        <button
          id="btn-close-checkin-modal"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Floating Coin & Fire Icon badge */}
        <div className="relative inline-flex items-center justify-center mb-5">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-amber-600 via-amber-400 to-yellow-300 p-1 shadow-lg shadow-amber-500/40 flex items-center justify-center animate-bounce duration-1000">
            <div className="w-full h-full rounded-2xl bg-slate-950 flex flex-col items-center justify-center">
              <Coins className="w-9 h-9 text-amber-400 fill-amber-400/30" />
              <span className="text-[11px] font-black text-amber-300 tracking-wider">+1 COIN</span>
            </div>
          </div>
          <div className="absolute -bottom-2 -right-2 p-2 rounded-xl bg-gradient-to-br from-rose-500 to-amber-500 shadow-md text-white">
            <Flame className="w-5 h-5 fill-white" />
          </div>
        </div>

        {/* Headline */}
        <h2 className="text-2xl sm:text-3xl font-black text-slate-100 tracking-tight">
          {isBonus ? '🎉 7-Day Streak Bonus!' : '⚡ Checked In Successfully!'}
        </h2>
        <p className="mt-1 text-sm text-slate-300 font-medium">
          Well done, <span className="text-amber-400 font-bold">{userName}</span>!
        </p>

        {/* Pop-up Core Stats Pill */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="bg-slate-800/80 border border-amber-500/30 rounded-2xl p-3.5">
            <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider block">
              Daily Reward
            </span>
            <span className="text-2xl font-black text-slate-100 flex items-center justify-center gap-1 mt-0.5">
              <Coins className="w-5 h-5 text-amber-400 fill-amber-400" />
              +1 Coin
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">+1 pt to ledger</span>
          </div>

          <div className="bg-slate-800/80 border border-rose-500/30 rounded-2xl p-3.5">
            <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider block">
              Continuous Streak
            </span>
            <span className="text-2xl font-black text-slate-100 flex items-center justify-center gap-1 mt-0.5">
              <Flame className="w-5 h-5 text-rose-500 fill-rose-500" />
              {streak} {streak === 1 ? 'Day' : 'Days'}
            </span>
            <span className="text-[10px] text-emerald-400 font-medium mt-0.5 block">
              +1 day added!
            </span>
          </div>
        </div>

        {/* 7-Day Continuous Streak Bonus Alert if reached */}
        {isBonus ? (
          <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-emerald-500/20 to-amber-500/20 border-2 border-emerald-500/50 text-left">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <Trophy className="w-5 h-5 text-amber-400 fill-amber-400" />
              7-Day Streak Milestone Unlocked!
            </div>
            <p className="mt-1 text-xs text-slate-200">
              You continuously maintained 7 days of daily discipline.
              <span className="font-bold text-emerald-300"> +5 Extra Points</span> have been credited to your competition ledger! (Total: +6 Points)
            </p>
          </div>
        ) : (
          /* Next Milestone Progress Bar */
          <div className="mt-5 p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-left">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                7-Day Bonus Progress
              </span>
              <span className="text-amber-400 font-bold">
                {daysUntilNextBonus} {daysUntilNextBonus === 1 ? 'day' : 'days'} to +5 pts
              </span>
            </div>

            {/* 7-day visual dots */}
            <div className="grid grid-cols-7 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map(day => {
                const isCompleted = day <= dayInCycle;
                const isGoal = day === 7;
                return (
                  <div
                    key={day}
                    className={`h-7 rounded-lg flex flex-col items-center justify-center border text-[10px] font-bold transition-all ${
                      isCompleted
                        ? 'bg-amber-500/30 border-amber-400 text-amber-200 shadow-sm'
                        : isGoal
                        ? 'bg-slate-800/80 border-amber-500/40 text-amber-400'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}
                  >
                    {isGoal ? '🎁+5' : `D${day}`}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Motivational confirmation */}
        <p className="mt-4 text-xs text-slate-400 flex items-center justify-center gap-1.5">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          Check-in verified and updated on live scoreboard.
        </p>

        {/* CTA Button */}
        <button
          id="btn-confirm-checkin-popup"
          onClick={onClose}
          className="mt-5 w-full py-3 px-5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 hover:from-amber-400 hover:to-yellow-400 shadow-lg shadow-amber-500/30 flex items-center justify-center gap-2 active:scale-98 transition-transform"
        >
          Awesome! Back to Mission
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
