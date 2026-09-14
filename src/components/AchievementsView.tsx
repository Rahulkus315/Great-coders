import React from 'react';
import {
  Award,
  Flame,
  CheckCircle2,
  Lock,
  Code2,
  BookOpen,
  Server,
  Zap,
  ShieldCheck,
  Trophy,
} from 'lucide-react';
import { UserStats } from '../types';

interface AchievementsViewProps {
  rahul: UserStats;
  dileep: UserStats;
  currentUserId: string;
}

export const AchievementsView: React.FC<AchievementsViewProps> = ({
  rahul,
  dileep,
  currentUserId,
}) => {
  const myStats = currentUserId === 'user-rahul' ? rahul : dileep;
  const partnerStats = currentUserId === 'user-rahul' ? dileep : rahul;

  const badges = [
    {
      id: 'first_blood',
      title: 'First Blood',
      desc: 'Complete Day 1 curriculum mission on time.',
      icon: <Zap className="w-5 h-5 text-amber-400" />,
      unlocked: myStats.completedTasks >= 1,
      partnerUnlocked: partnerStats.completedTasks >= 1,
    },
    {
      id: 'seven_day_streak',
      title: '7-Day Iron Streak',
      desc: 'Maintain 7 consecutive days of on-time task completions.',
      icon: <Flame className="w-5 h-5 text-rose-400" />,
      unlocked: myStats.bestStreak >= 7,
      partnerUnlocked: partnerStats.bestStreak >= 7,
    },
    {
      id: 'dsa_10',
      title: 'Algorithm Apprentice',
      desc: 'Solve at least 10 daily DSA coding problems.',
      icon: <Code2 className="w-5 h-5 text-cyan-400" />,
      unlocked: myStats.dsaSolved >= 10,
      partnerUnlocked: partnerStats.dsaSolved >= 10,
    },
    {
      id: 'java_foundations',
      title: 'Java Architect',
      desc: 'Complete Month 1 Java & JVM Foundations track.',
      icon: <BookOpen className="w-5 h-5 text-indigo-400" />,
      unlocked: myStats.completedTasks >= 28,
      partnerUnlocked: partnerStats.completedTasks >= 28,
    },
    {
      id: 'database_master',
      title: 'Data Tier Master',
      desc: 'Complete Month 2 SQL, Concurrency & Hibernate track.',
      icon: <Server className="w-5 h-5 text-purple-400" />,
      unlocked: myStats.completedTasks >= 56,
      partnerUnlocked: partnerStats.completedTasks >= 56,
    },
    {
      id: 'spring_boot_builder',
      title: 'Enterprise Spring Boot',
      desc: 'Complete Month 3 Spring Boot, REST & React track.',
      icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />,
      unlocked: myStats.completedTasks >= 84,
      partnerUnlocked: partnerStats.completedTasks >= 84,
    },
    {
      id: 'centurion',
      title: 'Great Coders Milestone',
      desc: 'Complete the full challenge journey with focus and consistency.',
      icon: <Trophy className="w-5 h-5 text-yellow-400" />,
      unlocked: myStats.completedTasks >= 100,
      partnerUnlocked: partnerStats.completedTasks >= 100,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100">Milestone Achievements & Badges</h3>
            <p className="text-xs text-slate-400">
              Special honors unlocked through sustained consistency, streak preservation, and curriculum mastery.
            </p>
          </div>
        </div>
      </div>

      {/* Badges Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {badges.map(b => (
          <div
            key={b.id}
            className={`p-5 rounded-xl border transition-all relative overflow-hidden ${
              b.unlocked
                ? 'bg-slate-900 border-indigo-500/40 shadow-lg'
                : 'bg-slate-900/50 border-slate-800/80 opacity-70'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-3 rounded-xl border ${
                  b.unlocked
                    ? 'bg-indigo-500/15 border-indigo-500/30'
                    : 'bg-slate-800 border-slate-700 text-slate-500'
                }`}
              >
                {b.unlocked ? b.icon : <Lock className="w-5 h-5 text-slate-500" />}
              </div>

              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-100">{b.title}</h4>
                  {b.unlocked ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> UNLOCKED
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                      LOCKED
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">{b.desc}</p>

                <div className="pt-2 text-[11px] text-slate-500 flex items-center justify-between">
                  <span>
                    Partner status: {b.partnerUnlocked ? 'Unlocked ✅' : 'In Progress ⏳'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
