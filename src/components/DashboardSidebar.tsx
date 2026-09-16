import React from 'react';
import {
  Award,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Crosshair,
  Flame,
  History,
  LayoutDashboard,
  Layers3,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
  Trophy,
  UserRound,
  X,
} from 'lucide-react';
import type { ProfileSettings, User } from '../types';

type SidebarAction =
  | { type: 'tab'; value: 'TODAY' | 'ROADMAP' | 'LEDGER' | 'HABITS' | 'JOURNAL' | 'ACHIEVEMENTS' | 'ANALYTICS' | 'APPROVALS' | 'HISTORY' }
  | { type: 'calendar' }
  | { type: 'profile' }
  | { type: 'logout' };

interface DashboardSidebarProps {
  currentUser: User;
  currentProfile: ProfileSettings;
  activeTab: Extract<SidebarAction, { type: 'tab' }>['value'];
  pendingApprovals: number;
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: SidebarAction) => void;
}

const primaryItems: Array<{ label: string; icon: React.ElementType; action: SidebarAction }> = [
  { label: 'Dashboard', icon: LayoutDashboard, action: { type: 'tab', value: 'TODAY' } },
  { label: "Today's Mission", icon: Crosshair, action: { type: 'tab', value: 'TODAY' } },
  { label: '100-Day Roadmap', icon: Layers3, action: { type: 'tab', value: 'ROADMAP' } },
  { label: 'Daily Check-In', icon: CheckCircle2, action: { type: 'tab', value: 'TODAY' } },
  { label: 'Points Ledger', icon: Award, action: { type: 'tab', value: 'LEDGER' } },
  { label: 'My Progress', icon: BarChart3, action: { type: 'tab', value: 'ANALYTICS' } },
  { label: 'Self-Control', icon: Flame, action: { type: 'tab', value: 'HABITS' } },
  { label: 'Calendar', icon: CalendarDays, action: { type: 'calendar' } },
  { label: 'Leaderboard', icon: Trophy, action: { type: 'tab', value: 'ANALYTICS' } },
  { label: 'Partner Zone', icon: UserRound, action: { type: 'tab', value: 'JOURNAL' } },
];

const secondaryItems: Array<{ label: string; icon: React.ElementType; action: SidebarAction }> = [
  { label: 'Resources', icon: BookOpen, action: { type: 'tab', value: 'ROADMAP' } },
  { label: 'Badges', icon: Award, action: { type: 'tab', value: 'ACHIEVEMENTS' } },
  { label: 'Activity', icon: History, action: { type: 'tab', value: 'HISTORY' } },
  { label: 'Approvals', icon: ShieldCheck, action: { type: 'tab', value: 'APPROVALS' } },
];

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  currentUser,
  currentProfile,
  activeTab,
  pendingApprovals,
  isOpen,
  onClose,
  onAction,
}) => {
  const handleAction = (action: SidebarAction) => {
    onAction(action);
    if (action.type !== 'profile') onClose();
  };

  const isActive = (action: SidebarAction) => action.type === 'tab' && action.value === activeTab;

  return (
    <>
      {isOpen && <button type="button" aria-label="Close navigation" className="sidebar-scrim" onClick={onClose} />}
      <aside className={`dashboard-sidebar ${isOpen ? 'dashboard-sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">GC</div>
          <div>
            <p className="brand-name">Great Coders</p>
            <p className="brand-caption">100-day challenge</p>
          </div>
          <button type="button" className="sidebar-close" aria-label="Close navigation" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="sidebar-user">
          <img src={currentProfile.avatarUrl || currentUser.avatar} alt="" />
          <div className="sidebar-user-copy">
            <strong>{currentUser.name}</strong>
            <span>Focused learner</span>
          </div>
          <span className="status-dot" />
        </div>

        <nav className="sidebar-nav" aria-label="Application navigation">
          <p className="sidebar-label">Workspace</p>
          {primaryItems.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.label} type="button" className={`sidebar-link ${isActive(item.action) ? 'sidebar-link-active' : ''}`} onClick={() => handleAction(item.action)}>
                <Icon size={17} strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.label === 'Dashboard' && isActive(item.action) && <ChevronRight size={14} className="sidebar-link-arrow" />}
              </button>
            );
          })}

          <p className="sidebar-label sidebar-label-spaced">More</p>
          {secondaryItems.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.label} type="button" className={`sidebar-link ${isActive(item.action) ? 'sidebar-link-active' : ''}`} onClick={() => handleAction(item.action)}>
                <Icon size={17} strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.label === 'Approvals' && pendingApprovals > 0 && <b className="sidebar-badge">{pendingApprovals}</b>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="sidebar-link" onClick={() => handleAction({ type: 'profile' })}>
            <Settings2 size={17} strokeWidth={1.8} />
            <span>Settings</span>
          </button>
          <button type="button" className="sidebar-logout" onClick={() => handleAction({ type: 'logout' })}>
            <LogOut size={17} />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export const MobileMenuButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button type="button" className="mobile-menu-button" aria-label="Open navigation" onClick={onClick}>
    <Menu size={20} />
  </button>
);
