import React, { useState } from 'react';
import {
  User as UserIcon,
  Bell,
  Clock,
  Calendar,
  ShieldCheck,
  Check,
  ChevronDown,
  Lock,
  Sparkles,
  AlertCircle,
  X,
  Palmtree,
  Sun,
  History,
} from 'lucide-react';
import { User, DayInfo, AppNotification, ProfileSettings } from '../types';

interface NavbarProps {
  currentUser: User;
  partnerUser: User;
  currentProfile: ProfileSettings;
  dayInfo: DayInfo;
  notifications: AppNotification[];
  remainingLeaves?: number;
  onOpenLeavesModal?: () => void;
  onOpenCalendar?: () => void;
  onMarkNotificationRead: (id: string) => void;
  onMarkAllNotificationsRead: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  partnerUser,
  currentProfile,
  dayInfo,
  notifications,
  remainingLeaves = 5,
  onOpenLeavesModal,
  onOpenCalendar,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  const getWindowBadge = () => {
    switch (dayInfo.windowStatus) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Window Active (04:00 AM – 10:30 PM)
          </span>
        );
      case 'CLOSING_SOON':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
            Closing Soon (Ends 10:30 PM)
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <span className="w-2 h-2 rounded-full bg-rose-400"></span>
            Window Closed (Opens 04:00 AM)
          </span>
        );
      case 'NOT_STARTED':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            Window Opens 04:00 AM
          </span>
        );
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* Brand & Day Number */}
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-shrink">
            <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-sky-500 to-indigo-900 text-white font-black text-[10px] sm:text-xs shadow-md shadow-indigo-500/20 border border-indigo-300/30 flex-shrink-0 tracking-[0.12em]">
              J.S.R
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-sm sm:text-base font-bold text-slate-100 tracking-tight truncate">
                  Great Coders
                </span>
                <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30 whitespace-nowrap">
                  {dayInfo.dayNumber > 0 ? `D${dayInfo.dayNumber}` : 'Starts 15 Sep'}
                  <span className="hidden sm:inline">{dayInfo.dayNumber > 0 ? ` of ${dayInfo.totalDays}` : ''}</span>
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 flex items-center gap-1 truncate mt-0.5">
                <span className="truncate">{dayInfo.challengeStarted ? dayInfo.currentDate : 'Challenge starts 15 Sep 2026'}</span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-300 font-medium whitespace-nowrap">{dayInfo.istTime} IST</span>
              </p>
            </div>
          </div>

          {/* Center Window Status (Desktop) */}
          <div className="hidden lg:flex items-center space-x-2">
            {getWindowBadge()}
            {dayInfo.morningWindowStatus === 'ACTIVE' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse">
                <Sun className="w-3.5 h-3.5" />
                Wake-Up Window Active (04:00 – 05:00)
              </span>
            )}
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center space-x-1.5 sm:space-x-2.5 flex-shrink-0">
            {/* Calendar & Past Days History Icon Button */}
            {onOpenCalendar && (
              <button
                type="button"
                id="open-past-days-calendar-btn"
                onClick={onOpenCalendar}
                className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 shadow-sm transition-all cursor-pointer group min-h-[36px]"
                title="Open 100-Day Calendar: Inspect any past date (1, 2, 3...) & view history"
              >
                <Calendar className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition-transform" />
                <span className="hidden md:inline">Days Calendar</span>
                <span className="md:hidden font-mono text-[11px]">D1-{dayInfo.dayNumber}</span>
              </button>
            )}

            {/* Holiday Quota Button */}
            {onOpenLeavesModal && (
              <button
                type="button"
                onClick={onOpenLeavesModal}
                className="inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 transition-colors cursor-pointer min-h-[36px]"
                title="5-Day Holiday & Schedule Shift System"
              >
                <Palmtree className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">Holidays </span>
                <span className="font-mono text-[11px]">({remainingLeaves}/5)</span>
              </button>
            )}

            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-slate-950">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-72 sm:w-96 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-indigo-400" />
                      <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                        Notifications ({notifications.length})
                      </h4>
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={onMarkAllNotificationsRead}
                        className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">
                        No notifications yet.
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          onClick={() => onMarkNotificationRead(n.id)}
                          className={`p-3 text-xs transition-colors hover:bg-slate-800/60 cursor-pointer ${
                            !n.read ? 'bg-indigo-950/30' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-slate-200">{n.title}</span>
                            {!n.read && (
                              <span className="w-2 h-2 rounded-full bg-indigo-500 mt-1 flex-shrink-0"></span>
                            )}
                          </div>
                          <p className="text-slate-300 mt-1 leading-relaxed">{n.message}</p>
                          <span className="text-[10px] text-slate-500 mt-1.5 block">
                            {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Authenticated Identity Switcher (Rahul & Dileep ONLY) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center space-x-1.5 sm:space-x-2.5 p-1 sm:p-1.5 pr-1.5 sm:pr-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 transition-colors cursor-pointer min-h-[36px]"
              >
                <img
                  src={currentProfile.avatarUrl || currentUser.avatar}
                  alt={currentUser.name}
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover ring-1 ring-indigo-500/50"
                />
                <div className="text-left hidden md:block">
                  <div className="text-xs font-semibold text-slate-200 flex items-center gap-1">
                    {currentUser.name}
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  </div>
                  <div className="text-[10px] text-slate-400">Locked Identity</div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {/* User Identity Details Modal / Popover */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-1 py-1.5 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-100">
                      <Lock className="w-3.5 h-3.5 text-emerald-400" />
                      Permanently Bound Identity
                    </div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Active
                    </span>
                  </div>

                  <div className="space-y-2.5 mt-3">
                    {/* Current User Card */}
                    <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-xs">
                      <div className="flex items-center space-x-2.5">
                        <img
                          src={currentProfile.avatarUrl || currentUser.avatar}
                          alt={currentUser.name}
                          className="w-9 h-9 rounded-full object-cover ring-2 ring-indigo-500/40"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-indigo-200 block truncate">{currentUser.name}</span>
                          <span className="block text-[11px] text-slate-300 truncate">{currentUser.email}</span>
                          <span className="block text-[10px] text-indigo-300/70 truncate mt-0.5">{currentUser.targetRole}</span>
                        </div>
                      </div>
                    </div>

                    {/* Permanent Lock Integrity Notice */}
                    <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 space-y-1">
                      <p className="font-semibold text-slate-200 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> One-Time Access Active
                      </p>
                      <p className="text-[10px] text-slate-400 leading-normal">
                        Your account is permanently locked to this session. Account switching and sign-out are permanently disabled to preserve 100-day competition integrity.
                      </p>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-800 text-[10px] text-slate-500 text-center font-mono">
                      ID: {currentUser.boundIdentity || currentUser.id}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Learning Window Sub-Bar */}
      <div className="lg:hidden px-3 py-1.5 bg-slate-950/90 border-t border-slate-800/80 flex items-center justify-between text-[11px] overflow-x-auto gap-2">
        <div className="flex items-center gap-2 whitespace-nowrap">
          {getWindowBadge()}
        </div>
        {dayInfo.morningWindowStatus === 'ACTIVE' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap animate-pulse">
            <Sun className="w-3 h-3" />
            Wake-Up Active
          </span>
        )}
      </div>
    </header>
  );
};
