import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Code2,
  BookOpen,
  Lock,
  Send,
  HelpCircle,
  Coins,
  ChevronDown,
  ChevronUp,
  Award,
  Star,
  FileText,
  ShieldCheck,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import { DailyTask, DSAProblem, TaskCompletionStatus } from '../types';

interface DayHistoryDetail {
  dayNumber: number;
  date: string;
  isPast: boolean;
  isCurrent: boolean;
  isFuture: boolean;
  isLocked: boolean;
  currentDayNumber: number;
  task: DailyTask;
  dsaProblem?: DSAProblem;
  currentUser: {
    id: string;
    name: string;
    avatar?: string;
    taskStatus: TaskCompletionStatus;
    completedAt?: string;
    pointsAwarded: number;
    dsaAttempt: any;
    journal: any;
    checkin: any;
    dayPoints: number;
    dayLedger: any[];
  };
  partnerUser: {
    id: string;
    name: string;
    avatar?: string;
    taskStatus: TaskCompletionStatus;
    completedAt?: string;
    pointsAwarded: number;
    dsaAttempt: any;
    journal: any;
    checkin: any;
    dayPoints: number;
    dayLedger: any[];
  };
  existingRequest?: any;
  canRequestApproval: boolean;
}

interface HistoricalDayDetailModalProps {
  dayNumber: number | null;
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  onApprovalRequested?: () => void;
}

export const HistoricalDayDetailModal: React.FC<HistoricalDayDetailModalProps> = ({
  dayNumber,
  isOpen,
  onClose,
  currentUserId,
  onApprovalRequested,
}) => {
  const [data, setData] = useState<DayHistoryDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Approval request state
  const [requestReason, setRequestReason] = useState('');
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [approvalFeedback, setApprovalFeedback] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'DSA' | 'JOURNAL' | 'LEDGER'>('OVERVIEW');
  const [expandedInterview, setExpandedInterview] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || dayNumber === null) return;
    setLoading(true);
    setError(null);
    setApprovalFeedback(null);
    setRequestReason('');

    fetch(`/api/day/${dayNumber}`, {
      credentials: 'include',
    })
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load Day ${dayNumber} history`);
        return res.json();
      })
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Error fetching day historical details.');
        setLoading(false);
      });
  }, [dayNumber, isOpen, currentUserId]);

  if (!isOpen || dayNumber === null) return null;

  const handleSendApprovalRequest = async () => {
    if (!requestReason.trim() || requestReason.trim().length < 5) {
      alert('Please provide a descriptive explanation (min 5 characters) for requesting retroactive approval.');
      return;
    }

    setSubmittingApproval(true);
    try {
      const res = await fetch(`/api/day/${dayNumber}/request-approval`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          reason: requestReason.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to submit approval request');
      }

      setApprovalFeedback(json.message);
      if (data) {
        setData({
          ...data,
          existingRequest: json.request,
          canRequestApproval: false,
        });
      }
      if (onApprovalRequested) onApprovalRequested();
    } catch (err: any) {
      alert(err.message || 'Approval request failed.');
    } finally {
      setSubmittingApproval(false);
    }
  };

  const renderStatusBadge = (status: TaskCompletionStatus) => {
    switch (status) {
      case 'COMPLETED_ON_TIME':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" /> Completed On-Time (+4)
          </span>
        );
      case 'COMPLETED_LATE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <Clock className="w-3.5 h-3.5" /> Completed Late (+2)
          </span>
        );
      case 'MISSED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            <AlertCircle className="w-3.5 h-3.5" /> Missed Penalty (-5)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
            Pending / Incomplete
          </span>
        );
    }
  };

  return (
    <div
      id="historical-day-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[92vh] bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex flex-col items-center justify-center text-white font-black text-base shadow-lg shadow-indigo-500/20">
              <span className="text-[9px] uppercase font-bold text-indigo-200">DAY</span>
              <span>{dayNumber}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-bold text-slate-100">
                  Historical Record • Day {dayNumber}
                </h3>
                {data?.isPast && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                    <Lock className="w-3 h-3 text-slate-400" /> Read-Only Past Archive
                  </span>
                )}
                {data?.isCurrent && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Active Today
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" /> {data?.date || 'Curriculum Schedule'}
                <span className="text-slate-600">•</span>
                <span>Track: {data?.task.category?.replace('_', ' ')}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 gap-2 text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'OVERVIEW'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Task & Head-to-Head
          </button>
          <button
            onClick={() => setActiveTab('DSA')}
            className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'DSA'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-4 h-4" />
            DSA Solutions
          </button>
          <button
            onClick={() => setActiveTab('JOURNAL')}
            className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'JOURNAL'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            Engineering Journals
          </button>
          <button
            onClick={() => setActiveTab('LEDGER')}
            className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'LEDGER'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Coins className="w-4 h-4" />
            Day Points Ledger
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {loading && (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
              <p className="text-sm">Fetching immutable historical records for Day {dayNumber}...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
              {error}
            </div>
          )}

          {!loading && data && (
            <>
              {/* TAB 1: OVERVIEW & TASKS */}
              {activeTab === 'OVERVIEW' && (
                <div className="space-y-6">
                  {/* Task Header */}
                  <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300">
                        {data.task.category.replace('_', ' ')}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                        Priority: {data.task.priority}
                      </span>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> ~{data.task.estimatedMinutes} mins
                      </span>
                    </div>

                    <h4 className="text-xl font-bold text-slate-100">{data.task.title}</h4>
                    <p className="text-sm text-slate-300 leading-relaxed">{data.task.description}</p>

                    <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-xs text-slate-300">
                      <span className="font-bold text-indigo-400 block mb-1">
                        🎯 Concrete Learning Objective:
                      </span>
                      <p>{data.task.learningObjective}</p>
                    </div>

                    {data.task.subtopics && data.task.subtopics.length > 0 && (
                      <div className="pt-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                          Core Topics Covered:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {data.task.subtopics.map((st, i) => (
                            <span
                              key={i}
                              className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300"
                            >
                              {st}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Competitor Scores & Completion Comparison on this Day */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                      <span>Day {dayNumber} Head-to-Head Performance</span>
                      <span className="text-indigo-400 font-semibold lowercase">
                        {data.date}
                      </span>
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* You */}
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-200">
                            {data.currentUser.name} (YOU)
                          </span>
                          <span className="text-xs font-extrabold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                            +{data.currentUser.dayPoints} PTS ON THIS DAY
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-slate-500 block mb-1">
                            Curriculum Task Status:
                          </span>
                          {renderStatusBadge(data.currentUser.taskStatus)}
                        </div>
                        <div className="text-xs text-slate-400 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                          <span>DSA Problem:</span>
                          <span className="font-semibold text-slate-200">
                            {data.currentUser.dsaAttempt?.status === 'SOLVED' ? (
                              <span className="text-emerald-400">✓ Solved</span>
                            ) : (
                              <span className="text-slate-500">Not Solved</span>
                            )}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 flex items-center justify-between">
                          <span>Today’s Live:</span>
                          <span className="font-semibold text-slate-200">
                            {data.currentUser.journal ? (
                              <span className="text-emerald-400">✓ Written</span>
                            ) : (
                              <span className="text-slate-500">Not Logged</span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Partner */}
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-200">
                            {data.partnerUser.name} (COMPETITOR)
                          </span>
                          <span className="text-xs font-extrabold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            +{data.partnerUser.dayPoints} PTS ON THIS DAY
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-slate-500 block mb-1">
                            Curriculum Task Status:
                          </span>
                          {renderStatusBadge(data.partnerUser.taskStatus)}
                        </div>
                        <div className="text-xs text-slate-400 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                          <span>DSA Problem:</span>
                          <span className="font-semibold text-slate-200">
                            {data.partnerUser.dsaAttempt?.status === 'SOLVED' ? (
                              <span className="text-emerald-400">✓ Solved</span>
                            ) : (
                              <span className="text-slate-500">Not Solved</span>
                            )}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 flex items-center justify-between">
                          <span>Today’s Live:</span>
                          <span className="font-semibold text-slate-200">
                            {data.partnerUser.journal ? (
                              <span className="text-emerald-400">✓ Written</span>
                            ) : (
                              <span className="text-slate-500">Not Logged</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* APPROVAL-BASED ACTION IF TASK WAS LEFT INCOMPLETE */}
                  {/* "If anything which is left, only that I can edit with approval, not directly." */}
                  {data.isPast && (
                    <div className="bg-slate-950/90 border border-amber-500/40 rounded-2xl p-5 space-y-3">
                      <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                        <ShieldCheck className="w-5 h-5 text-amber-400" />
                        Retroactive Completion & Mutual Approval Protocol
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        In accordance with the 100-Day Rules, past dates are permanently immutable.
                        Direct editing is blocked. If you left this task incomplete on Day {dayNumber},
                        you may request your competitor’s approval to retroactively mark it complete as a
                        Late Submission (+2 points).
                      </p>

                      {approvalFeedback && (
                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                          ✓ {approvalFeedback}
                        </div>
                      )}

                      {data.existingRequest ? (
                        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1">
                          <span className="text-amber-400 font-bold block">
                            ⏳ Approval Request Currently Pending:
                          </span>
                          <p className="text-slate-300">"{data.existingRequest.reason}"</p>
                          <span className="text-[11px] text-slate-500 block">
                            Waiting for {data.partnerUser.name} to review in their Approvals tab.
                          </span>
                        </div>
                      ) : data.currentUser.taskStatus === 'COMPLETED_ON_TIME' ||
                        data.currentUser.taskStatus === 'COMPLETED_LATE' ? (
                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium">
                          ✓ Task is already complete for Day {dayNumber}. No approval request needed.
                        </div>
                      ) : data.canRequestApproval ? (
                        <div className="space-y-3 pt-2">
                          <textarea
                            value={requestReason}
                            onChange={e => setRequestReason(e.target.value)}
                            placeholder="Explain why this task was left incomplete and what you have completed now..."
                            rows={3}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                          />
                          <button
                            type="button"
                            onClick={handleSendApprovalRequest}
                            disabled={submittingApproval || requestReason.trim().length < 5}
                            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                          >
                            {submittingApproval ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Submitting Request...</span>
                              </>
                            ) : (
                              <>
                                <Send className="w-4 h-4" />
                                <span>Request Partner Approval (+2 Late Points)</span>
                              </>
                            )}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Interview Questions */}
                  {data.task.interviewQuestions && data.task.interviewQuestions.length > 0 && (
                    <div className="space-y-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <HelpCircle className="w-4 h-4" />
                        Associated Interview Questions
                      </span>
                      <div className="space-y-2">
                        {data.task.interviewQuestions.map(iq => {
                          const isExp = expandedInterview === iq.id;
                          return (
                            <div
                              key={iq.id}
                              className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs space-y-2 cursor-pointer hover:border-slate-700 transition-colors"
                              onClick={() => setExpandedInterview(isExp ? null : iq.id)}
                            >
                              <div className="flex items-center justify-between font-bold text-slate-200">
                                <span>{iq.question}</span>
                                {isExp ? (
                                  <ChevronUp className="w-4 h-4 text-slate-400" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-slate-400" />
                                )}
                              </div>
                              {isExp && (
                                <p className="pt-2 border-t border-slate-800 text-slate-300 leading-relaxed whitespace-pre-line">
                                  {iq.answerSummary}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: DSA CHALLENGE & SOLUTIONS */}
              {activeTab === 'DSA' && (
                <div className="space-y-5">
                  {data.dsaProblem ? (
                    <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            <Code2 className="w-4 h-4" />
                          </span>
                          <h4 className="text-base font-bold text-slate-100">
                            {data.dsaProblem.title}
                          </h4>
                        </div>
                        <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                          +{data.dsaProblem.points} PTS
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">
                        {data.dsaProblem.description}
                      </p>

                      <div className="grid grid-cols-2 gap-3 text-xs bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <div>
                          <span className="text-slate-500 block text-[10px]">Optimal Approach:</span>
                          <span className="font-semibold text-slate-200">
                            {data.dsaProblem.approach}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Complexity:</span>
                          <span className="font-semibold text-slate-200">
                            Time: {data.dsaProblem.timeComplexity} • Space: {data.dsaProblem.spaceComplexity}
                          </span>
                        </div>
                      </div>

                      {/* Solution Submissions */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
                          <span className="font-bold text-slate-300 block">
                            {data.currentUser.name}'s Solution:
                          </span>
                          {data.currentUser.dsaAttempt?.status === 'SOLVED' ? (
                            <div className="space-y-1.5">
                              <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Solved Successfully
                              </span>
                              <p className="text-slate-300 italic">
                                "{data.currentUser.dsaAttempt.notes || 'Clean solution submitted'}"
                              </p>
                              <span className="text-[10px] text-slate-500 block">
                                Time taken: {data.currentUser.dsaAttempt.timeTakenMinutes} mins
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-500 italic">No solution recorded on this day.</span>
                          )}
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
                          <span className="font-bold text-slate-300 block">
                            {data.partnerUser.name}'s Solution:
                          </span>
                          {data.partnerUser.dsaAttempt?.status === 'SOLVED' ? (
                            <div className="space-y-1.5">
                              <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Solved Successfully
                              </span>
                              <p className="text-slate-300 italic">
                                "{data.partnerUser.dsaAttempt.notes || 'Clean solution submitted'}"
                              </p>
                              <span className="text-[10px] text-slate-500 block">
                                Time taken: {data.partnerUser.dsaAttempt.timeTakenMinutes} mins
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-500 italic">No solution recorded on this day.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-12 text-center text-xs text-slate-500">
                      No dedicated DSA problem assigned for Day {dayNumber}.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: SALES & ENGINEERING JOURNALS */}
              {activeTab === 'JOURNAL' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* User Journal */}
                    <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="font-bold text-slate-200">
                          {data.currentUser.name}'s Journal
                        </span>
                        <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          {data.currentUser.journal ? 'Logged' : 'Missing'}
                        </span>
                      </div>

                      {data.currentUser.journal ? (
                        <div className="space-y-3 text-slate-300">
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase font-bold">
                              What I Built:
                            </span>
                            <p className="mt-0.5">{data.currentUser.journal.whatIBuilt || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase font-bold">
                              What I Learned:
                            </span>
                            <p className="mt-0.5">{data.currentUser.journal.whatILearned || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase font-bold">
                              Struggles & Mistakes:
                            </span>
                            <p className="mt-0.5">
                              {data.currentUser.journal.whatIStruggledWith || data.currentUser.journal.mistakes || 'None noted'}
                            </p>
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px]">
                            <span>Study Hours: {data.currentUser.journal.studyHours}h</span>
                            <span>Productivity: {data.currentUser.journal.productivityRating}/5</span>
                          </div>
                          {data.currentUser.journal.peerReviewRating && (
                            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center justify-between">
                              <span>Partner Peer Rating:</span>
                              <span className="font-bold flex items-center gap-1">
                                <Star className="w-3.5 h-3.5 fill-amber-400" />
                                {data.currentUser.journal.peerReviewRating} / 5 Stars
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-slate-500 italic py-6 text-center">
                          No journal was written by {data.currentUser.name} on this date.
                        </p>
                      )}
                    </div>

                    {/* Partner Journal */}
                    <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="font-bold text-slate-200">
                          {data.partnerUser.name}'s Journal
                        </span>
                        <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          {data.partnerUser.journal ? 'Logged' : 'Missing'}
                        </span>
                      </div>

                      {data.partnerUser.journal ? (
                        <div className="space-y-3 text-slate-300">
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase font-bold">
                              What They Built:
                            </span>
                            <p className="mt-0.5">{data.partnerUser.journal.whatIBuilt || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase font-bold">
                              What They Learned:
                            </span>
                            <p className="mt-0.5">{data.partnerUser.journal.whatILearned || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase font-bold">
                              Struggles & Mistakes:
                            </span>
                            <p className="mt-0.5">
                              {data.partnerUser.journal.whatIStruggledWith || data.partnerUser.journal.mistakes || 'None noted'}
                            </p>
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px]">
                            <span>Study Hours: {data.partnerUser.journal.studyHours}h</span>
                            <span>Productivity: {data.partnerUser.journal.productivityRating}/5</span>
                          </div>
                          {data.partnerUser.journal.peerReviewRating && (
                            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center justify-between">
                              <span>Your Rating Given:</span>
                              <span className="font-bold flex items-center gap-1">
                                <Star className="w-3.5 h-3.5 fill-amber-400" />
                                {data.partnerUser.journal.peerReviewRating} / 5 Stars
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-slate-500 italic py-6 text-center">
                          No journal was written by {data.partnerUser.name} on this date.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: IMMUTABLE DAY LEDGER */}
              {activeTab === 'LEDGER' && (
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300">
                      Immutable Points Ledger Transactions for {data.date}
                    </span>
                    <span className="text-slate-500 text-[11px]">
                      Ledger ID: D{dayNumber}-AUDIT
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* User Ledger */}
                    <div className="space-y-2">
                      <span className="font-bold text-slate-400 block">
                        {data.currentUser.name}'s Transactions ({data.currentUser.dayLedger.length}):
                      </span>
                      {data.currentUser.dayLedger.length > 0 ? (
                        data.currentUser.dayLedger.map((entry: any) => (
                          <div
                            key={entry.id}
                            className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-200">
                                {entry.eventType?.replace(/_/g, ' ')}
                              </span>
                              <span
                                className={`font-mono font-bold ${
                                  entry.points >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {entry.points >= 0 ? `+${entry.points}` : entry.points} PTS
                              </span>
                            </div>
                            <p className="text-slate-400 text-[11px]">{entry.reason}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-slate-500 italic p-3 bg-slate-950/50 rounded-xl">
                          No point transactions recorded on this day.
                        </p>
                      )}
                    </div>

                    {/* Partner Ledger */}
                    <div className="space-y-2">
                      <span className="font-bold text-slate-400 block">
                        {data.partnerUser.name}'s Transactions ({data.partnerUser.dayLedger.length}):
                      </span>
                      {data.partnerUser.dayLedger.length > 0 ? (
                        data.partnerUser.dayLedger.map((entry: any) => (
                          <div
                            key={entry.id}
                            className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-200">
                                {entry.eventType?.replace(/_/g, ' ')}
                              </span>
                              <span
                                className={`font-mono font-bold ${
                                  entry.points >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {entry.points >= 0 ? `+${entry.points}` : entry.points} PTS
                              </span>
                            </div>
                            <p className="text-slate-400 text-[11px]">{entry.reason}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-slate-500 italic p-3 bg-slate-950/50 rounded-xl">
                          No point transactions recorded on this day.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-t border-slate-800 bg-slate-950/70">
          <span className="text-[11px] text-slate-500">
            {data?.isPast
              ? 'Past entries are cryptographically fixed. Changes require mutual approval.'
              : 'Current active session.'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Close History
          </button>
        </div>
      </div>
    </div>
  );
};
