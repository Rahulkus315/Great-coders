import React, { useState } from 'react';
import {
  X,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Code2,
  ExternalLink,
} from 'lucide-react';
import { DailyTask, DSAProblem, TaskCompletionStatus } from '../types';

interface DayDetailModalProps {
  dayNumber: number;
  isOpen: boolean;
  onClose: () => void;
}

export const DayDetailModal: React.FC<DayDetailModalProps> = ({
  dayNumber,
  isOpen,
  onClose,
}) => {
  const [data, setData] = useState<{
    task: DailyTask;
    dsaProblem?: DSAProblem;
    rahulStatus: TaskCompletionStatus;
    dileepStatus: TaskCompletionStatus;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`/api/day/${dayNumber}`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load day details: status ${res.status}`);
        return res.json();
      })
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load day details:', err);
        setLoading(false);
      });
  }, [dayNumber, isOpen]);

  if (!isOpen) return null;

  const renderStatus = (name: string, status: TaskCompletionStatus) => {
    switch (status) {
      case 'COMPLETED_ON_TIME':
        return (
          <span className="text-emerald-400 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Completed On-Time (+4 pts)
          </span>
        );
      case 'COMPLETED_LATE':
        return (
          <span className="text-amber-400 font-semibold flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> Completed Late (+2 pts)
          </span>
        );
      case 'MISSED':
        return (
          <span className="text-rose-400 font-semibold flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> Missed Penalty (-5 pts)
          </span>
        );
      case 'PENDING':
      default:
        return <span className="text-slate-400 font-medium">Pending Completion</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-600 font-bold text-white text-sm">
              D{dayNumber}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Day {dayNumber} Curriculum Deep Dive
              </h3>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> {data?.task.date || 'Curriculum Schedule'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading || !data ? (
          <div className="py-12 text-center text-xs text-slate-400">
            Loading Day {dayNumber} curriculum details...
          </div>
        ) : (
          <div className="space-y-5 text-xs text-slate-300">
            {/* Task Overview */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold">
                  {data.task.category.replace('_', ' ')}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  Priority: {data.task.priority}
                </span>
                <span className="text-slate-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> ~{data.task.estimatedMinutes} mins
                </span>
              </div>
              <h4 className="text-lg font-bold text-slate-100">{data.task.title}</h4>
              <p className="text-slate-300 leading-relaxed">{data.task.description}</p>
            </div>

            {/* Learning Objective */}
            <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1">
              <span className="text-indigo-400 font-semibold block">🎯 Concrete Learning Objective:</span>
              <p className="leading-relaxed">{data.task.learningObjective}</p>
            </div>

            {/* Coordinated study tracks */}
            {data.task.studyTopics && data.task.studyTopics.length > 0 && (
              <div>
                <span className="text-slate-400 font-semibold uppercase tracking-wider block mb-1.5">
                  Study Tracks:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {data.task.studyTopics.map(st => (
                    <div key={st.subject} className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
                      <span className="text-cyan-300 font-semibold block">{st.subject} · {st.estimatedMinutes} min</span>
                      <span className="text-slate-300 leading-relaxed">{st.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Partner Status Comparison for this Day */}
            <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2.5">
              <span className="text-slate-400 font-semibold uppercase tracking-wider block">
                Competitor Completion Status (Day {dayNumber})
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[11px] mb-1">RAHUL:</span>
                  {renderStatus('Rahul', data.rahulStatus)}
                </div>
                <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[11px] mb-1">DILEEP:</span>
                  {renderStatus('Dileep', data.dileepStatus)}
                </div>
              </div>
            </div>

            {/* DSA Problem for this day */}
            {data.dsaProblem && (
              <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-cyan-400 font-semibold flex items-center gap-1.5">
                    <Code2 className="w-4 h-4" /> DSA Challenge: {data.dsaProblem.title}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-mono">
                    +{data.dsaProblem.points} PTS
                  </span>
                </div>
                <p>{data.dsaProblem.description}</p>
                <div className="text-[11px] text-slate-400">
                  Optimal: <span className="text-slate-200">{data.dsaProblem.approach}</span> (Time: {data.dsaProblem.timeComplexity})
                </div>
              </div>
            )}

            {/* Interview Question */}
            {data.task.interviewQuestions && data.task.interviewQuestions.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <span className="text-amber-400 font-semibold flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4" /> Associated Interview Question:
                </span>
                {data.task.interviewQuestions.map(iq => {
                  const isExp = expandedQuestion === iq.id;
                  return (
                    <div key={iq.id} className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1.5">
                      <div
                        className="flex items-center justify-between cursor-pointer font-medium text-slate-200"
                        onClick={() => setExpandedQuestion(isExp ? null : iq.id)}
                      >
                        <span>{iq.question}</span>
                        {isExp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </div>
                      {isExp && (
                        <p className="text-slate-300 pt-2 border-t border-slate-800 whitespace-pre-line leading-relaxed">
                          {iq.answerSummary}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
