import React, { useState } from 'react';
import {
  FileSpreadsheet,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  Search,
  Clock,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import { PointLedgerEntry } from '../types';

interface ScoreLedgerViewProps {
  entries: PointLedgerEntry[];
  currentUserId: string;
}

export const ScoreLedgerView: React.FC<ScoreLedgerViewProps> = ({
  entries,
  currentUserId,
}) => {
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('ALL');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEntries = entries.filter(entry => {
    if (selectedUserFilter !== 'ALL' && entry.userId !== selectedUserFilter) return false;
    if (selectedTypeFilter !== 'ALL' && entry.eventType !== selectedTypeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        entry.reason.toLowerCase().includes(q) ||
        (entry.sourceTaskTitle && entry.sourceTaskTitle.toLowerCase().includes(q)) ||
        entry.eventType.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'TASK_COMPLETED_ON_TIME':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            ON-TIME TASK
          </span>
        );
      case 'TASK_COMPLETED_LATE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            LATE TASK
          </span>
        );
      case 'TASK_MISSED_SETTLEMENT':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            MISSED PENALTY
          </span>
        );
      case 'DSA_COMPLETED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
            DSA PRACTICE
          </span>
        );
      case 'TASK_REVERSED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
            REVERSAL
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
            {type}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Principle Notice */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100">Immutable Point Ledger</h3>
              <p className="text-xs text-slate-400">
                Authoritative double-entry audit trail. Scores are never overwritten, only credited or penalized.
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <select
              value={selectedUserFilter}
              onChange={e => setSelectedUserFilter(e.target.value)}
              className="flex-1 sm:flex-initial bg-slate-950 border border-slate-700 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 min-h-[36px]"
            >
              <option value="ALL">All Competitors</option>
              <option value="user-rahul">Rahul Only</option>
              <option value="user-dileep">Dileep Only</option>
            </select>

            <select
              value={selectedTypeFilter}
              onChange={e => setSelectedTypeFilter(e.target.value)}
              className="flex-1 sm:flex-initial bg-slate-950 border border-slate-700 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 min-h-[36px]"
            >
              <option value="ALL">All Event Types</option>
              <option value="TASK_COMPLETED_ON_TIME">+4 On-Time Completion</option>
              <option value="TASK_MISSED_SETTLEMENT">-5 Missed Penalty</option>
              <option value="TASK_COMPLETED_LATE">+2 Late Completion</option>
              <option value="DSA_COMPLETED">DSA Practice (+1..+4)</option>
              <option value="TASK_REVERSED">Task Reversals</option>
            </select>

            <div className="relative w-full sm:w-60">
              <input
                type="text"
                placeholder="Search ledger entries..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 min-h-[36px]"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Ledger Cards for Mobile (< md) */}
      <div className="md:hidden space-y-3">
        {filteredEntries.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-500">
            No point events found matching the selected criteria.
          </div>
        ) : (
          filteredEntries.map(entry => {
            const isPositive = entry.points > 0;
            const isRahul = entry.userId === 'user-rahul';

            return (
              <div
                key={entry.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2 shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-semibold text-xs px-2 py-0.5 rounded-full ${
                        isRahul
                          ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                          : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                      }`}
                    >
                      {isRahul ? 'Rahul' : 'Dileep'}
                    </span>
                    {getEventBadge(entry.eventType)}
                  </div>
                  <div className="flex items-center gap-1 font-mono font-bold text-sm">
                    <span
                      className={`inline-flex items-center gap-0.5 ${
                        isPositive
                          ? 'text-emerald-400'
                          : entry.points < 0
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                      {isPositive ? `+${entry.points}` : entry.points}
                    </span>
                    <span className="text-slate-500 font-normal text-xs">({entry.runningTotal} total)</span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">{entry.reason}</p>

                {entry.sourceTaskTitle && (
                  <span className="text-[11px] text-indigo-400 font-medium block">
                    Target: {entry.sourceTaskTitle}
                  </span>
                )}

                <div className="text-[10px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-800/80">
                  <span className="font-mono">{entry.date}</span>
                  <span>{entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''} IST</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Ledger Table for Desktop (>= md) */}
      <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Timestamp (IST)</th>
                <th className="py-3.5 px-4 font-semibold">Competitor</th>
                <th className="py-3.5 px-4 font-semibold">Event Type</th>
                <th className="py-3.5 px-4 font-semibold text-right">Points</th>
                <th className="py-3.5 px-4 font-semibold text-right">Running Total</th>
                <th className="py-3.5 px-6 font-semibold">Reason & Audit Context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                    No point events found matching the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredEntries.map(entry => {
                  const isPositive = entry.points > 0;
                  const isRahul = entry.userId === 'user-rahul';

                  return (
                    <tr key={entry.id} className="hover:bg-slate-800/40 transition-colors font-sans">
                      {/* Timestamp */}
                      <td className="py-3 px-4 text-xs text-slate-400 whitespace-nowrap">
                        <div className="font-mono text-slate-300">
                          {entry.date}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                      </td>

                      {/* Competitor */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`font-semibold text-xs px-2 py-0.5 rounded-full ${
                            isRahul
                              ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                              : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                          }`}
                        >
                          {isRahul ? 'Rahul' : 'Dileep'}
                        </span>
                      </td>

                      {/* Event Type */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getEventBadge(entry.eventType)}
                      </td>

                      {/* Points Delta */}
                      <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-bold">
                        <span
                          className={`inline-flex items-center gap-0.5 ${
                            isPositive
                              ? 'text-emerald-400'
                              : entry.points < 0
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          {isPositive ? `+${entry.points}` : entry.points}
                        </span>
                      </td>

                      {/* Running Total */}
                      <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-bold text-slate-200">
                        {entry.runningTotal}
                      </td>

                      {/* Reason */}
                      <td className="py-3 px-6 text-xs text-slate-300 max-w-md">
                        <p className="line-clamp-2 leading-relaxed">{entry.reason}</p>
                        {entry.sourceTaskTitle && (
                          <span className="text-[11px] text-indigo-400 font-medium block mt-0.5">
                            Target: {entry.sourceTaskTitle}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
