import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  Award,
  BarChart2,
  Clock,
  Code2,
  Flame,
  CheckCircle2,
  Trophy,
  Sparkles,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { AnalyticsMetricKey, AnalyticsResponse, UserStats } from '../types';

interface AnalyticsViewProps {
  analytics: AnalyticsResponse;
  rahul: UserStats;
  dileep: UserStats;
}

const metricLabels: Record<AnalyticsMetricKey, string> = {
  CUMULATIVE: 'Cumulative Points',
  DAILY: 'Daily Points',
  TASKS: 'Task Completion',
  DSA: 'DSA Performance',
  FOCUSED: 'Focused Execution',
  STREAK: 'Streak Performance',
};

const formatMetricValue = (metric: AnalyticsMetricKey, value: number) => {
  if (metric === 'FOCUSED') return `${value.toFixed(1)}h`;
  if (metric === 'STREAK') return `${value}d`;
  return value.toString();
};

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ analytics, rahul, dileep }) => {
  const [selectedMetric, setSelectedMetric] = useState<AnalyticsMetricKey>('CUMULATIVE');
  const [range, setRange] = useState<number | 'all'>('all');

  const visibleTimeline = useMemo(() => {
    if (!analytics?.timeline?.length) return [];
    const points = [...analytics.timeline];
    if (range === 'all') return points;
    return points.slice(Math.max(0, points.length - range));
  }, [analytics, range]);

  const chartData = useMemo(() => {
    return visibleTimeline.map(day => {
      const base: Record<string, number | string> = {
        day: `Day ${day.dayNumber}`,
        label: `D${day.dayNumber}`,
      };

      if (selectedMetric === 'CUMULATIVE') {
        base.Rahul = day.rahulCumulative;
        base.Dileep = day.dileepCumulative;
      } else if (selectedMetric === 'DAILY') {
        base.Rahul = day.rahulDaily;
        base.Dileep = day.dileepDaily;
      } else if (selectedMetric === 'TASKS') {
        base.Rahul = day.rahulTasks;
        base.Dileep = day.dileepTasks;
      } else if (selectedMetric === 'DSA') {
        base.Rahul = day.rahulDsa;
        base.Dileep = day.dileepDsa;
      } else if (selectedMetric === 'FOCUSED') {
        base.Rahul = day.rahulFocused;
        base.Dileep = day.dileepFocused;
      } else {
        base.Rahul = day.rahulStreak;
        base.Dileep = day.dileepStreak;
      }

      return base;
    });
  }, [visibleTimeline, selectedMetric]);

  const challengeDayLabel = `Day ${analytics.challenge.currentDayNumber}`;

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <BarChart2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100">Great Coders Analytics & Performance</h3>
              <p className="text-xs text-slate-400">
                Challenge synced to {analytics.challenge.startDate} → {analytics.challenge.endDate}. Only elapsed challenge days are included.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Today — {challengeDayLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Current Score</p>
          <div className="mt-3 flex items-center justify-between">
            <div>
              <div className="text-lg font-black text-slate-100">{rahul.totalPoints}</div>
              <div className="text-xs text-slate-400">Rahul</div>
            </div>
            <div>
              <div className="text-lg font-black text-slate-100">{dileep.totalPoints}</div>
              <div className="text-xs text-slate-400">Dileep</div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Score Gap</p>
          <div className="mt-3 text-xl font-black text-slate-100">
            {analytics.summary.pointDifferenceText}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Current Leader</p>
          <div className="mt-3 flex items-center gap-2 text-lg font-black text-slate-100">
            <Trophy className="w-4 h-4 text-amber-400" />
            {analytics.summary.leaderName || 'Tie'}
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            Challenge Performance
          </div>

          <div className="flex flex-wrap gap-2">
            {(['CUMULATIVE', 'DAILY', 'TASKS', 'DSA', 'FOCUSED', 'STREAK'] as AnalyticsMetricKey[]).map(metric => (
              <button
                key={metric}
                type="button"
                onClick={() => setSelectedMetric(metric)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  selectedMetric === metric
                    ? 'bg-indigo-500 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {metricLabels[metric]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {[7, 14, 30, 'all'].map(option => (
            <button
              key={String(option)}
              type="button"
              onClick={() => setRange(option as number | 'all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                range === option ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {option === 'all' ? 'All Days' : `Last ${option}`}
            </button>
          ))}
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip
                formatter={(value: number) => formatMetricValue(selectedMetric, Number(value))}
                labelFormatter={(label) => label}
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                itemStyle={{ fontSize: '12px' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Line type="monotone" dataKey="Rahul" stroke="#818cf8" strokeWidth={3} dot={{ r: 2 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="Dileep" stroke="#34d399" strokeWidth={3} dot={{ r: 2 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Win Days</p>
          <div className="mt-2 text-sm text-slate-200">
            Rahul {analytics.summary.winDays.rahul} • Dileep {analytics.summary.winDays.dileep} • Ties {analytics.summary.winDays.tie}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Best Daily Performance</p>
          <div className="mt-2 text-sm text-slate-200">
            Rahul {analytics.summary.bestDailyPerformance.rahul} • Dileep {analytics.summary.bestDailyPerformance.dileep}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Average Daily Points</p>
          <div className="mt-2 text-sm text-slate-200">
            Rahul {analytics.summary.averageDailyPoints.rahul} • Dileep {analytics.summary.averageDailyPoints.dileep}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Focused Execution</p>
          <div className="mt-2 text-sm text-slate-200">
            Rahul {analytics.summary.focusedExecution.rahul}h • Dileep {analytics.summary.focusedExecution.dileep}h
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Code2 className="w-4 h-4 text-cyan-400" /> DSA Comparison
          </h4>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[{ label: 'DSA Solved', Rahul: analytics.summary.dsaComparison.rahul, Dileep: analytics.summary.dsaComparison.dileep }]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }} />
                <Bar dataKey="Rahul" fill="#818cf8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Dileep" fill="#34d399" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" /> Learning Streak
          </h4>
          <div className="mt-4 space-y-3 text-sm text-slate-200">
            <div className="flex items-center justify-between rounded-xl bg-slate-950 border border-slate-800 p-3">
              <span>Rahul current</span>
              <span className="font-bold text-amber-300">{analytics.summary.learningStreak.rahulCurrent} days</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-950 border border-slate-800 p-3">
              <span>Rahul best</span>
              <span className="font-bold text-amber-300">{analytics.summary.learningStreak.rahulBest} days</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-950 border border-slate-800 p-3">
              <span>Dileep current</span>
              <span className="font-bold text-emerald-300">{analytics.summary.learningStreak.dileepCurrent} days</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-950 border border-slate-800 p-3">
              <span>Dileep best</span>
              <span className="font-bold text-emerald-300">{analytics.summary.learningStreak.dileepBest} days</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
