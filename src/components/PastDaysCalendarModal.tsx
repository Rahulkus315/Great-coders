import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronRight,
  FileText,
  Search,
  Sparkles,
  History,
  ShieldAlert,
} from 'lucide-react';
import { HistoricalDayDetailModal } from './HistoricalDayDetailModal';

interface DaySummary {
  dayNumber: number;
  date: string;
  title: string;
  category: string;
  priority: string;
  isUnlocked: boolean;
  isPast: boolean;
  isCurrent: boolean;
  isFuture: boolean;
  myStatus: 'COMPLETED_ON_TIME' | 'COMPLETED_LATE' | 'MISSED' | 'PENDING';
  partnerStatus: 'COMPLETED_ON_TIME' | 'COMPLETED_LATE' | 'MISSED' | 'PENDING';
  hasMyJournal: boolean;
  hasPartnerJournal: boolean;
  myPoints: number;
  partnerPoints: number;
}

interface PastDaysCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  currentDayNumber?: number;
  onRefreshData?: () => void;
}

export const PastDaysCalendarModal: React.FC<PastDaysCalendarModalProps> = ({
  isOpen,
  onClose,
  currentUserId,
  currentDayNumber = 1,
  onRefreshData,
}) => {
  const [days, setDays] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDayNumber, setSelectedDayNumber] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'PAST' | 'LOCKED'>('ALL');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);

    fetch('/api/history/calendar-overview', {
      credentials: 'include',
    })
      .then(res => res.json())
      .then(data => {
        if (data.days) {
          setDays(data.days);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load calendar overview:', err);
        setLoading(false);
      });
  }, [isOpen, currentUserId]);

  if (!isOpen) return null;

  const filteredDays = days.filter(d => {
    if (filter === 'PAST' && !d.isPast && !d.isCurrent) return false;
    if (filter === 'LOCKED' && !d.isFuture) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchDay = d.dayNumber.toString().includes(q);
      const matchDate = d.date.toLowerCase().includes(q);
      const matchTitle = d.title.toLowerCase().includes(q);
      const matchCat = d.category.toLowerCase().includes(q);
      return matchDay || matchDate || matchTitle || matchCat;
    }
    return true;
  });

  const handleSelectDay = (day: DaySummary) => {
    if (day.isFuture) {
      alert(`Day ${day.dayNumber} is in the future and locked. It will unlock on ${day.date}.`);
      return;
    }
    setSelectedDayNumber(day.dayNumber);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED_ON_TIME':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'COMPLETED_LATE':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'MISSED':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <>
      <div
        id="past-days-calendar-modal"
        className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-5xl max-h-[92vh] bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start sm:items-center justify-between p-4 sm:p-6 border-b border-slate-800 bg-slate-950/70 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0">
                <History className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <h2 className="text-base sm:text-xl font-bold text-slate-100 truncate">
                    Past Days Calendar
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 whitespace-nowrap">
                    1 – 100
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 line-clamp-2 sm:line-clamp-none">
                  Click any past day (1, 2, 3...) to view immutable records, journals, and scores.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer flex-shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search, Filter & Legend Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between px-4 sm:px-6 py-3 bg-slate-950/40 border-b border-slate-800 gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search day # (e.g. 1, 2, 3), topic, or date..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                onClick={() => setFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                  filter === 'ALL'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                All 100 Days
              </button>
              <button
                onClick={() => setFilter('PAST')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1 ${
                  filter === 'PAST'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Unlock className="w-3.5 h-3.5" />
                Past / Open Days
              </button>
              <button
                onClick={() => setFilter('LOCKED')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1 ${
                  filter === 'LOCKED'
                    ? 'bg-slate-700 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                Future Locked
              </button>
            </div>

            {/* Legend */}
            <div className="hidden xl:flex items-center gap-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Completed
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Late (+2)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Missed (-5)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span> Today
              </span>
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3 text-slate-500" /> Future Locked
              </span>
            </div>
          </div>

          {/* Calendar Day Grid (1, 2, 3, 4, ... 100) */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6">
            {loading ? (
              <div className="py-24 text-center text-slate-400 text-xs">
                Loading curriculum calendar and past dates...
              </div>
            ) : filteredDays.length === 0 ? (
              <div className="py-20 text-center text-slate-500 text-xs">
                No curriculum days matched your search filter.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {filteredDays.map(day => {
                  const isClickable = !day.isFuture;

                  return (
                    <button
                      key={day.dayNumber}
                      type="button"
                      onClick={() => handleSelectDay(day)}
                      disabled={day.isFuture}
                      className={`relative flex flex-col p-3 rounded-2xl border text-left transition-all duration-150 group cursor-pointer ${
                        day.isCurrent
                          ? 'bg-indigo-950/40 border-indigo-500/80 shadow-lg shadow-indigo-500/10 ring-2 ring-indigo-500/30'
                          : day.isPast
                          ? 'bg-slate-900/90 border-slate-700/80 hover:border-indigo-500 hover:bg-slate-800/80'
                          : 'bg-slate-950/50 border-slate-800/40 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      {/* Top Row: Big Number & Lock / Status Indicator */}
                      <div className="flex items-center justify-between w-full mb-1.5">
                        <span
                          className={`text-xl font-black font-mono leading-none ${
                            day.isCurrent
                              ? 'text-indigo-400'
                              : day.isPast
                              ? 'text-slate-100'
                              : 'text-slate-600'
                          }`}
                        >
                          {day.dayNumber}
                        </span>

                        {day.isFuture ? (
                          <span
                            className="p-1 rounded-md bg-slate-900 border border-slate-800 text-slate-500"
                            title="Future date is locked"
                          >
                            <Lock className="w-3.5 h-3.5" />
                          </span>
                        ) : day.isCurrent ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-indigo-500 text-white animate-pulse">
                            TODAY
                          </span>
                        ) : (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${getStatusColor(
                              day.myStatus
                            )}`}
                          >
                            {day.myStatus === 'COMPLETED_ON_TIME'
                              ? '+4'
                              : day.myStatus === 'COMPLETED_LATE'
                              ? '+2'
                              : day.myStatus === 'MISSED'
                              ? '-5'
                              : 'PENDING'}
                          </span>
                        )}
                      </div>

                      {/* Date */}
                      <span className="text-[10px] text-slate-400 font-medium truncate block mb-1">
                        {day.date}
                      </span>

                      {/* Topic Title */}
                      <p
                        className={`text-[11px] font-semibold line-clamp-2 leading-tight flex-1 ${
                          day.isFuture ? 'text-slate-600' : 'text-slate-300 group-hover:text-white'
                        }`}
                      >
                        {day.title}
                      </p>

                      {/* Bottom Footer Info for Past Days */}
                      {day.isPast && (
                        <div className="pt-2 mt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
                          <span className="flex items-center gap-1 font-mono font-bold text-indigo-400">
                            +{day.myPoints} pts
                          </span>
                          <span className="text-[9px] text-slate-500 group-hover:text-slate-300">
                            Inspect ➔
                          </span>
                        </div>
                      )}

                      {day.isCurrent && (
                        <div className="pt-2 mt-2 border-t border-indigo-900/50 flex items-center justify-between text-[10px] text-indigo-300">
                          <span className="font-bold">Active Today</span>
                          <span>Open ➔</span>
                        </div>
                      )}

                      {day.isFuture && (
                        <div className="pt-2 mt-2 border-t border-slate-900 flex items-center justify-between text-[9px] text-slate-600">
                          <span>Locked</span>
                          <Lock className="w-3 h-3" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Info */}
          <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/70 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-400 gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>
                Past dates are read-only. Unfinished tasks can only be submitted with mutual partner approval.
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold transition-colors cursor-pointer"
            >
              Close Calendar
            </button>
          </div>
        </div>
      </div>

      {/* Historical Detail Modal when a past date is selected */}
      {selectedDayNumber !== null && (
        <HistoricalDayDetailModal
          dayNumber={selectedDayNumber}
          isOpen={selectedDayNumber !== null}
          onClose={() => setSelectedDayNumber(null)}
          currentUserId={currentUserId}
          onApprovalRequested={() => {
            if (onRefreshData) onRefreshData();
          }}
        />
      )}
    </>
  );
};
