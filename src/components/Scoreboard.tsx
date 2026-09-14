import React from 'react';
import {
  Trophy,
  Flame,
  CheckCircle2,
  AlertOctagon,
  Clock,
  Code2,
  BookOpen,
  TrendingUp,
  Percent,
  Coins,
} from 'lucide-react';
import { UserStats, DayInfo, MotivationQuote } from '../types';

interface ScoreboardProps {
  dayInfo: DayInfo;
  rahul: UserStats;
  dileep: UserStats;
  pointDifferenceText: string;
  dailyQuote: MotivationQuote;
  currentUserId: string;
}

export const Scoreboard: React.FC<ScoreboardProps> = ({
  dayInfo,
  rahul,
  dileep,
  pointDifferenceText,
  dailyQuote,
  currentUserId,
}) => {
  const isRahulLeading = rahul.totalPoints > dileep.totalPoints;
  const isDileepLeading = dileep.totalPoints > rahul.totalPoints;
  const gap = Math.abs(rahul.totalPoints - dileep.totalPoints);

  return (
    <div className="space-y-6">
      {/* Daily Motivation Quote Bar (Section 7) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mt-0.5 flex-shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <blockquote className="text-sm sm:text-base font-medium text-slate-200 italic leading-relaxed">
              "{dailyQuote.quote}"
            </blockquote>
            <p className="text-xs text-indigo-400 font-semibold mt-1">
              — {dailyQuote.author} <span className="text-slate-500 font-normal">({dailyQuote.category})</span>
            </p>
          </div>
        </div>
      </div>

      {/* Main Great Coders Scoreboard Banner */}
      <div className="bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Subtle accent glow */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500"></div>

        <div className="text-center space-y-1 mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Great Coders Scoreboard
          </h2>
          <p className="text-xs text-slate-500">
            Calculated from daily execution and progress • Asia/Kolkata
          </p>
        </div>

        {/* Dual Competitor Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
          {/* Rahul Card */}
          <div
            className={`rounded-xl p-6 border transition-all relative ${
              isRahulLeading
                ? 'bg-indigo-950/20 border-indigo-500/50 shadow-lg shadow-indigo-500/10'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            {isRahulLeading && (
              <span className="absolute top-4 right-4 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                <Trophy className="w-3 h-3" /> RANK #1
              </span>
            )}
            {!isRahulLeading && !isDileepLeading && (
              <span className="absolute top-4 right-4 text-xs font-semibold text-slate-400">
                TIED #1
              </span>
            )}
            {!isRahulLeading && isDileepLeading && (
              <span className="absolute top-4 right-4 text-xs font-semibold text-slate-500">
                RANK #2
              </span>
            )}

            <div className="flex items-center gap-4">
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"
                alt="Rahul"
                className="w-14 h-14 rounded-xl object-cover ring-2 ring-indigo-500/40"
              />
              <div>
                <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  RAHUL
                  {currentUserId === 'user-rahul' && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      YOU
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-400">DSA + Java + OS + DBMS Advanced Track</p>
              </div>
            </div>

            <div className="mt-5 flex items-baseline justify-between border-t border-slate-800/80 pt-4">
              <div>
                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold block">
                  Total Points
                </span>
                <span className="text-4xl font-extrabold text-indigo-400 tracking-tight">
                  {rahul.totalPoints}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Task Streak</span>
                <span className="text-base font-bold text-amber-400 flex items-center justify-end gap-1">
                  <Flame className="w-4 h-4 fill-amber-400" /> {rahul.currentStreak} Days
                </span>
              </div>
            </div>

            {/* Daily Check-in & Coins status */}
            <div className="mt-3 pt-3 border-t border-slate-800/50 flex items-center justify-between text-xs">
              <span className={`inline-flex items-center gap-1 font-semibold ${rahul.hasCheckedInToday ? 'text-emerald-400' : 'text-slate-400'}`}>
                {rahul.hasCheckedInToday ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Checked In Today</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Check-In Pending</span>
                  </>
                )}
              </span>
              <span className="font-semibold text-amber-400 flex items-center gap-1">
                <Coins className="w-3.5 h-3.5" />
                {rahul.checkinStreak || 0}d Checkin Streak
              </span>
            </div>
          </div>

          {/* Dileep Card */}
          <div
            className={`rounded-xl p-6 border transition-all relative ${
              isDileepLeading
                ? 'bg-indigo-950/20 border-indigo-500/50 shadow-lg shadow-indigo-500/10'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            {isDileepLeading && (
              <span className="absolute top-4 right-4 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                <Trophy className="w-3 h-3" /> RANK #1
              </span>
            )}
            {!isDileepLeading && !isRahulLeading && (
              <span className="absolute top-4 right-4 text-xs font-semibold text-slate-400">
                TIED #1
              </span>
            )}
            {!isDileepLeading && isRahulLeading && (
              <span className="absolute top-4 right-4 text-xs font-semibold text-slate-500">
                RANK #2
              </span>
            )}

            <div className="flex items-center gap-4">
              <img
                src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80"
                alt="Dileep"
                className="w-14 h-14 rounded-xl object-cover ring-2 ring-emerald-500/40"
              />
              <div>
                <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  DILEEP
                  {currentUserId === 'user-dileep' && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      YOU
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-400">DSA + Java + OS + DBMS Core Track</p>
              </div>
            </div>

            <div className="mt-5 flex items-baseline justify-between border-t border-slate-800/80 pt-4">
              <div>
                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold block">
                  Total Points
                </span>
                <span className="text-4xl font-extrabold text-emerald-400 tracking-tight">
                  {dileep.totalPoints}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Task Streak</span>
                <span className="text-base font-bold text-amber-400 flex items-center justify-end gap-1">
                  <Flame className="w-4 h-4 fill-amber-400" /> {dileep.currentStreak} Days
                </span>
              </div>
            </div>

            {/* Daily Check-in & Coins status */}
            <div className="mt-3 pt-3 border-t border-slate-800/50 flex items-center justify-between text-xs">
              <span className={`inline-flex items-center gap-1 font-semibold ${dileep.hasCheckedInToday ? 'text-emerald-400' : 'text-slate-400'}`}>
                {dileep.hasCheckedInToday ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Checked In Today</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Check-In Pending</span>
                  </>
                )}
              </span>
              <span className="font-semibold text-amber-400 flex items-center gap-1">
                <Coins className="w-3.5 h-3.5" />
                {dileep.checkinStreak || 0}d Checkin Streak
              </span>
            </div>
          </div>
        </div>

        {/* Central Point Difference Banner (Section 9) */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
          <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-xl bg-slate-800/90 border border-slate-700/80 shadow-md">
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-bold text-slate-100">{pointDifferenceText}</span>
            {gap > 0 && (
              <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-extrabold">
                +{gap} PTS
              </span>
            )}
          </div>
        </div>

        {/* Detailed Side-by-Side Metrics Grid */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block mb-1 flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Completed
            </span>
            <div className="text-sm font-bold text-slate-200">
              <span className="text-indigo-400">{rahul.completedTasks}</span> vs{' '}
              <span className="text-emerald-400">{dileep.completedTasks}</span>
            </div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block mb-1 flex items-center justify-center gap-1">
              <AlertOctagon className="w-3.5 h-3.5 text-rose-400" /> Missed (-5)
            </span>
            <div className="text-sm font-bold text-slate-200">
              <span className="text-rose-400">{rahul.missedTasks}</span> vs{' '}
              <span className="text-rose-400">{dileep.missedTasks}</span>
            </div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block mb-1 flex items-center justify-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-400" /> Late (+2)
            </span>
            <div className="text-sm font-bold text-slate-200">
              <span className="text-amber-400">{rahul.lateTasks}</span> vs{' '}
              <span className="text-amber-400">{dileep.lateTasks}</span>
            </div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block mb-1 flex items-center justify-center gap-1">
              <Code2 className="w-3.5 h-3.5 text-cyan-400" /> DSA Solved
            </span>
            <div className="text-sm font-bold text-slate-200">
              <span className="text-cyan-400">{rahul.dsaSolved}</span> vs{' '}
              <span className="text-cyan-400">{dileep.dsaSolved}</span>
            </div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block mb-1 flex items-center justify-center gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-500" /> Best Streak
            </span>
            <div className="text-sm font-bold text-slate-200">
              <span className="text-indigo-400">{rahul.bestStreak}d</span> vs{' '}
              <span className="text-emerald-400">{dileep.bestStreak}d</span>
            </div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block mb-1 flex items-center justify-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-purple-400" /> Study Hours
            </span>
            <div className="text-sm font-bold text-slate-200">
              <span className="text-purple-400">{rahul.totalStudyHours}h</span> vs{' '}
              <span className="text-purple-400">{dileep.totalStudyHours}h</span>
            </div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 col-span-2 sm:col-span-1">
            <span className="text-[11px] text-slate-400 block mb-1 flex items-center justify-center gap-1">
              <Percent className="w-3.5 h-3.5 text-emerald-400" /> Completion
            </span>
            <div className="text-sm font-bold text-slate-200">
              <span className="text-indigo-400">{rahul.completionPercentage}%</span> vs{' '}
              <span className="text-emerald-400">{dileep.completionPercentage}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
