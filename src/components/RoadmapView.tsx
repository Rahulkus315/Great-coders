import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Code2,
  Coffee,
  Database,
  Server,
  Clock,
  Target,
} from 'lucide-react';
import { DailyTask, PermissionRequest, ScheduleSection, ScheduleSectionStatus } from '../types';

type RoadmapTask = DailyTask & {
  dsaProblem?: { title: string; description: string; difficulty: string };
  sectionStatuses: Record<ScheduleSection, ScheduleSectionStatus>;
  isCurrentDay: boolean;
  isLocked: boolean;
};

interface RoadmapViewProps {
  tasks: RoadmapTask[];
  currentDayNumber: number;
  totalDays?: number;
  subjectPoints?: Partial<Record<ScheduleSection, number>>;
  pendingScheduleRequests?: PermissionRequest[];
  onSelectDay: (dayNumber: number) => void;
  onCompleteSection: (taskId: string, section: ScheduleSection) => Promise<void>;
}

const SUBJECTS: Array<{ id: ScheduleSection; label: string; icon: React.ReactNode; points: number }> = [
  { id: 'DSA', label: 'DSA', icon: <Code2 className="w-5 h-5" />, points: 10 },
  { id: 'JAVA', label: 'Java', icon: <Coffee className="w-5 h-5" />, points: 10 },
  { id: 'OS', label: 'Operating Systems', icon: <Server className="w-5 h-5" />, points: 8 },
  { id: 'DBMS', label: 'DBMS', icon: <Database className="w-5 h-5" />, points: 8 },
];

const completed = (status?: ScheduleSectionStatus) =>
  status?.status === 'COMPLETED_ON_TIME' || status?.status === 'COMPLETED_LATE';

export const RoadmapView: React.FC<RoadmapViewProps> = ({
  tasks,
  currentDayNumber,
  totalDays = 100,
  subjectPoints = {},
  onSelectDay,
  onCompleteSection,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<ScheduleSection>('DSA');
  const [completing, setCompleting] = useState<string | null>(null);
  const subject = SUBJECTS.find(item => item.id === selectedSubject)!;
  const elapsedTasks = tasks.filter(task => task.dayNumber <= currentDayNumber);
  const subjectTasks = tasks.filter(task => task.sectionStatuses?.[selectedSubject]);
  const completedDays = elapsedTasks.filter(task => completed(task.sectionStatuses[selectedSubject])).length;

  const getTopic = (task: RoadmapTask) => {
    if (selectedSubject === 'DSA') {
      return {
        title: task.dsaProblem?.title || task.title,
        description: task.dsaProblem?.description || task.description,
        minutes: task.estimatedMinutes,
      };
    }
    const topic = task.studyTopics?.find(item => item.subject === selectedSubject);
    return {
      title: topic?.title || `${subject.label} study topic`,
      description: topic?.description || task.description,
      minutes: topic?.estimatedMinutes || task.estimatedMinutes,
    };
  };

  const handleComplete = async (task: RoadmapTask) => {
    const key = `${task.id}-${selectedSubject}`;
    setCompleting(key);
    try {
      await onCompleteSection(task.id, selectedSubject);
    } finally {
      setCompleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-400 font-bold">100-Day Roadmap</p>
            <h2 className="text-2xl font-black text-white mt-1">Choose your learning track</h2>
          </div>
          <span className="text-xs text-slate-400">Active through Day {currentDayNumber}</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {SUBJECTS.map(item => {
            const subjectCompleted = elapsedTasks.filter(task => completed(task.sectionStatuses?.[item.id])).length;
            const points = subjectPoints[item.id] || 0;
            const isSelected = item.id === selectedSubject;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedSubject(item.id)}
                className={`text-left p-4 rounded-2xl border transition-all ${
                  isSelected
                    ? 'bg-indigo-950/50 border-indigo-500 ring-1 ring-indigo-500/50 shadow-lg'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-2 text-slate-100 font-bold">
                  <span className="text-indigo-400">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </div>
                <div className="mt-4 flex items-end justify-between gap-2">
                  <span className="text-xl font-black text-white">{subjectCompleted} <span className="text-xs text-slate-500">/ {totalDays}</span></span>
                  <span className="text-sm font-bold text-emerald-400">{points} pts</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, (subjectCompleted / totalDays) * 100)}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
              {subject.icon} {subject.label}
            </div>
            <h3 className="text-xl font-black text-white mt-1">{subject.label} - 100 Day Progress</h3>
          </div>
          <div className="text-right">
            <div className="text-lg font-black text-white">{completedDays} / {totalDays} days</div>
            <div className="text-xs text-emerald-400 font-bold">{subjectPoints[selectedSubject] || 0} authoritative points</div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          {subjectTasks.map(task => {
            const status = task.sectionStatuses[selectedSubject];
            const isDone = completed(status);
            const isFuture = task.dayNumber > currentDayNumber;
            const topic = getTopic(task);
            const key = `${task.id}-${selectedSubject}`;
            return (
              <article
                key={key}
                className={`rounded-xl border p-4 flex flex-col min-h-[220px] ${
                  task.isCurrentDay ? 'bg-indigo-950/30 border-indigo-500/70 ring-1 ring-indigo-500/30' : isFuture ? 'bg-slate-950/40 border-slate-800 opacity-70' : 'bg-slate-950/70 border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-indigo-400 font-bold">
                      Day {task.dayNumber} • {task.date}
                    </p>
                    <h4 className="text-base font-bold text-slate-100 mt-2">{topic.title}</h4>
                  </div>
                  {task.isCurrentDay && <span className="text-[10px] font-bold text-indigo-300 bg-indigo-500/20 px-2 py-1 rounded">TODAY</span>}
                  {isFuture && <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-2 py-1 rounded">LOCKED</span>}
                </div>
                <p className="mt-3 text-xs text-slate-300 leading-relaxed flex-1">{topic.description}</p>
                <p className="mt-2 text-[11px] text-slate-400 leading-relaxed"><span className="font-semibold text-slate-300">Learning objective:</span> {task.learningObjective}</p>
                <div className="mt-3 flex items-center gap-3 text-[10px] text-slate-400">
                  <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {topic.minutes} min</span>
                  <span>{task.difficulty} • {task.priority}</span>
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-bold"><Target className="w-3 h-3" /> +{status?.pointsAwarded || subject.points} pts</span>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800">
                  {isDone ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-300"><CheckCircle2 className="w-4 h-4" /> Completed (+{status.pointsAwarded} pts)</span>
                  ) : isFuture ? (
                    <span className="text-xs font-semibold text-slate-500">Available on Day {task.dayNumber}</span>
                  ) : (
                    <button
                      type="button"
                      disabled={completing === key}
                      onClick={() => handleComplete(task)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-60"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> {completing === key ? 'Completing...' : 'Complete Section'}
                    </button>
                  )}
                  <button type="button" onClick={() => onSelectDay(task.dayNumber)} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-400 hover:text-indigo-300">
                    Inspect Day <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {subjectTasks.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No elapsed curriculum days are available yet.</p>}
      </section>
    </div>
  );
};
