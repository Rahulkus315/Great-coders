import React, { useState } from 'react';
import {
  History,
  Clock,
  Calendar,
  User,
  Search,
  CheckCircle2,
  Moon,
  Sun,
  Flame,
  BookOpen,
  Palmtree,
  ShieldCheck,
  Filter,
} from 'lucide-react';
import { AuditLogEntry } from '../types';

interface HistoryViewProps {
  logs: AuditLogEntry[];
  currentDate: string;
  onOpenCalendar?: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ logs = [], currentDate, onOpenCalendar }) => {
  const [filterUser, setFilterUser] = useState<'ALL' | 'Rahul' | 'Dileep'>('ALL');
  const [filterPeriod, setFilterPeriod] = useState<'ALL' | 'TODAY'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Format ISO timestamp to readable IST time and date
  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      const timeStr = d.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      const dateStr = d.toLocaleDateString('en-GB', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      return { timeStr, dateStr };
    } catch {
      return { timeStr: iso, dateStr: currentDate };
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'MORNING_CHECKIN':
        return <Sun className="w-4 h-4 text-amber-400" />;
      case 'MARK_TASK_COMPLETE':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'SOLVE_DSA':
        return <Flame className="w-4 h-4 text-cyan-400" />;
      case 'SAVE_JOURNAL':
        return <BookOpen className="w-4 h-4 text-purple-400" />;
      case 'APPLY_LEAVE':
        return <Palmtree className="w-4 h-4 text-sky-400" />;
      case 'MUTUAL_APPROVAL':
        return <ShieldCheck className="w-4 h-4 text-indigo-400" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const filteredLogs = logs.filter(log => {
    // User filter
    if (filterUser !== 'ALL') {
      if (filterUser === 'Rahul' && log.actorName !== 'Rahul' && log.actorId !== 'user-rahul') return false;
      if (filterUser === 'Dileep' && log.actorName !== 'Dileep' && log.actorId !== 'user-dileep') return false;
    }

    // Period filter
    if (filterPeriod === 'TODAY') {
      const { dateStr } = formatTimestamp(log.timestamp);
      // check if includes current date or today
      if (!log.timestamp.includes(currentDate)) {
        // fallback check
        const d = new Date(log.timestamp);
        const logDate = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        if (logDate !== currentDate) return false;
      }
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const text = `${log.action} ${log.reason || ''} ${log.targetId || ''} ${log.actorName}`.toLowerCase();
      if (!text.includes(q)) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100">Activity History Log</h3>
              <p className="text-xs text-slate-400">
                Transparent, immutable chronological record of every task, edit, morning check-in, and action taken by Rahul and Dileep.
              </p>
            </div>
          </div>

          {/* Quick Counter & Calendar Launcher */}
          <div className="flex items-center gap-3">
            {onOpenCalendar && (
              <button
                type="button"
                onClick={onOpenCalendar}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Open Days Calendar (1 to 100)</span>
              </button>
            )}
            <span className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-300 font-mono">
              Total Entries: <strong className="text-indigo-400">{filteredLogs.length}</strong>
            </span>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            {/* User Filter */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setFilterUser('ALL')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  filterUser === 'ALL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Users
              </button>
              <button
                type="button"
                onClick={() => setFilterUser('Rahul')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  filterUser === 'Rahul' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Rahul
              </button>
              <button
                type="button"
                onClick={() => setFilterUser('Dileep')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  filterUser === 'Dileep' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Dileep
              </button>
            </div>

            {/* Period Filter */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setFilterPeriod('ALL')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  filterPeriod === 'ALL' ? 'bg-slate-800 text-slate-200' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Full History
              </button>
              <button
                type="button"
                onClick={() => setFilterPeriod('TODAY')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  filterPeriod === 'TODAY' ? 'bg-slate-800 text-slate-200' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Today Only
              </button>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by task, action, or reason..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="py-3 px-4 w-44">Date & Time (IST)</th>
                <th className="py-3 px-4 w-32">User</th>
                <th className="py-3 px-4">Task / Action Taken</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-12 text-center text-slate-500">
                    <History className="w-8 h-8 mx-auto mb-2 text-slate-600 opacity-50" />
                    <p className="text-sm font-medium text-slate-400">No activity recorded yet.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Actions taken by you or Dileep will appear here in real time with exact timestamp and task details.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => {
                  const { timeStr, dateStr } = formatTimestamp(log.timestamp);
                  const isRahul = log.actorName === 'Rahul' || log.actorId === 'user-rahul';
                  const isDileep = log.actorName === 'Dileep' || log.actorId === 'user-dileep';

                  return (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* 1. Date & Time */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-semibold text-slate-200">
                            {timeStr}
                          </span>
                          <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3" /> {dateStr}
                          </span>
                        </div>
                      </td>

                      {/* 2. User */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isRahul ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                            {log.actorAvatar ? <img src={log.actorAvatar} alt="Rahul" className="w-4 h-4 rounded-full object-cover" /> : <User className="w-3 h-3 text-indigo-400" />} Rahul
                          </span>
                        ) : isDileep ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            {log.actorAvatar ? <img src={log.actorAvatar} alt="Dileep" className="w-4 h-4 rounded-full object-cover" /> : <User className="w-3 h-3 text-amber-400" />} Dileep
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
                            System
                          </span>
                        )}
                      </td>

                      {/* 3. Task / Action */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5 p-1 rounded-lg bg-slate-800 border border-slate-700">
                            {getActionIcon(log.action)}
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-slate-200 font-medium leading-snug">
                              {log.reason || log.action}
                            </p>
                            {log.targetId && (
                              <span className="text-[10px] text-slate-500 font-mono block">
                                Ref: {log.targetType} • {log.targetId}
                              </span>
                            )}
                          </div>
                        </div>
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
