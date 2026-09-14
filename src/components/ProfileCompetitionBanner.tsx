import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Clock3,
  Flame,
  PencilLine,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  User,
  X,
} from 'lucide-react';
import { DayInfo, User as AppUser, UserStats } from '../types';

export type CoverTheme =
  | 'default'
  | 'developer'
  | 'java'
  | 'ai'
  | 'backend'
  | 'fullstack';

export interface ProfileSettings {
  displayName: string;
  headline: string;
  bio: string;
  skills: string;
  coverTheme: CoverTheme;
  avatarUrl?: string;
}

interface ProfileCompetitionBannerProps {
  currentUser: AppUser;
  partnerUser: AppUser;
  currentUserStats: UserStats;
  partnerStats: UserStats;
  dayInfo: DayInfo;
  leaderName: string | null;
  currentProfile: ProfileSettings;
  partnerProfile: ProfileSettings;
  canEdit: boolean;
  onEditProfile: () => void;
}

const COVER_THEMES: Array<{ key: CoverTheme; label: string; className: string }> = [
  { key: 'default', label: 'Great Coders Default', className: 'from-slate-950 via-indigo-950 to-slate-900' },
  { key: 'developer', label: 'Developer', className: 'from-slate-950 via-violet-950 to-slate-900' },
  { key: 'java', label: 'Java', className: 'from-amber-950 via-orange-900 to-slate-900' },
  { key: 'ai', label: 'AI / ML', className: 'from-cyan-950 via-sky-950 to-slate-900' },
  { key: 'backend', label: 'Backend', className: 'from-emerald-950 via-slate-900 to-slate-950' },
  { key: 'fullstack', label: 'Full Stack', className: 'from-fuchsia-950 via-purple-950 to-slate-900' },
];

function getCoverClass(theme: CoverTheme) {
  return COVER_THEMES.find(item => item.key === theme)?.className ?? COVER_THEMES[0].className;
}

const defaultProfileSettings = (user: AppUser): ProfileSettings => ({
  displayName: user.name,
  headline: user.targetRole || 'Java Backend • DSA • Web Development',
  bio: 'Building every day. Becoming a better coder.',
  skills: 'Java Backend • DSA • React • Spring Boot',
  coverTheme: 'default',
  avatarUrl: user.avatar,
});

const clamp = (value: string, maxLength: number) => value.slice(0, maxLength);

export const ProfileCompetitionBanner: React.FC<ProfileCompetitionBannerProps> = ({
  currentUser,
  partnerUser,
  currentUserStats,
  partnerStats,
  dayInfo,
  leaderName,
  currentProfile,
  partnerProfile,
  canEdit,
  onEditProfile,
}) => {
  const displayName = currentProfile.displayName?.trim() || currentUser.name;
  const headline = currentProfile.headline?.trim() || currentUser.targetRole || 'Java Backend • DSA • Web Development';
  const bio = currentProfile.bio?.trim() || 'Building every day. Becoming a better coder.';
  const skills = currentProfile.skills?.trim() || 'Java Backend • DSA • React • Spring Boot';
  const partnerDisplayName = partnerProfile.displayName?.trim() || partnerUser.name;
  const partnerHeadline = partnerProfile.headline?.trim() || partnerUser.targetRole || 'Java Backend • DSA • Web Development';
  const highlightStats = [
    { label: 'Streak', value: `${currentUserStats.currentStreak}`, icon: Flame, accent: 'amber' },
    { label: 'Points', value: `${currentUserStats.totalPoints}`, icon: Trophy, accent: 'indigo' },
    { label: 'Focused', value: `${currentUserStats.totalStudyHours}h`, icon: Sparkles, accent: 'purple' },
    { label: 'Tasks', value: `${currentUserStats.completionPercentage}%`, icon: CheckCircle2, accent: 'emerald' },
    { label: 'DSA', value: `${currentUserStats.dsaSolved}`, icon: Star, accent: 'sky' },
    { label: 'Rank', value: `#${currentUserStats.rank || 1}`, icon: ShieldCheck, accent: 'rose' },
  ];

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 shadow-[0_20px_60px_rgba(15,23,42,0.5)]">
      <div className={`relative bg-gradient-to-br ${getCoverClass(currentProfile.coverTheme)} p-4 sm:p-6 lg:p-8`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.28),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.2),_transparent_30%)]" />
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/35 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-100/90 backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Great Coders
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={onEditProfile}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/40 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition hover:bg-slate-950/60"
            >
              <PencilLine className="h-3.5 w-3.5" />
              Edit Profile
            </button>
          )}
        </div>

        <div className="relative z-10 mt-8 flex flex-col gap-5 sm:mt-10 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <div className="relative shrink-0 overflow-hidden rounded-full border-4 border-slate-950 bg-slate-900 shadow-[0_12px_30px_rgba(15,23,42,0.7)] ring-2 ring-white/10">
              <img
                src={currentProfile.avatarUrl || currentUser.avatar}
                alt={`${displayName} profile`}
                className="h-20 w-20 object-cover sm:h-[112px] sm:w-[112px]"
              />
            </div>

            <div className="min-w-0 pb-1">
              <h2 className="text-2xl font-black tracking-tight text-white sm:text-4xl">{displayName}</h2>
              <p className="mt-1 text-sm font-medium text-slate-200 sm:text-base">{headline}</p>
              <p className="mt-1 text-xs text-slate-300/90 sm:text-sm">{skills}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700/60 bg-slate-950/30 px-3 py-2 text-left backdrop-blur-sm sm:min-w-[220px]">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Challenge Status</p>
            <div className="mt-2 space-y-1 text-sm text-slate-100">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-300">Great Coders</span>
                <span className="font-semibold text-indigo-300">Day {dayInfo.dayNumber} / {dayInfo.totalDays}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-300">Head-to-Head</span>
                <span className="font-semibold text-emerald-300">{currentUser.name} vs {partnerUser.name}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-300">Leader</span>
                <span className="font-semibold text-amber-300">{leaderName || 'Tied'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-5 max-w-2xl">
          <p className="text-sm text-slate-100/90 italic sm:text-base">“{bio}”</p>
        </div>

        <div className="relative z-10 mt-6 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-950/25 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <img
                src={currentProfile.avatarUrl || currentUser.avatar}
                alt={`${displayName} avatar`}
                className="h-12 w-12 rounded-full border border-white/15 object-cover"
              />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Current Profile</p>
                <div className="mt-1 truncate text-sm font-bold text-white">{displayName}</div>
                <div className="truncate text-xs text-slate-300">{headline}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/25 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <img
                src={partnerProfile.avatarUrl || partnerUser.avatar}
                alt={`${partnerDisplayName} avatar`}
                className="h-12 w-12 rounded-full border border-white/15 object-cover"
              />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Partner Profile</p>
                <div className="mt-1 truncate text-sm font-bold text-white">{partnerDisplayName}</div>
                <div className="truncate text-xs text-slate-300">{partnerHeadline}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-slate-800 bg-slate-950/60 p-3 sm:grid-cols-3 lg:grid-cols-6 lg:p-4">
        {highlightStats.map(stat => {
          const Icon = stat.icon;
          const accentClass =
            stat.accent === 'amber'
              ? 'text-amber-300'
              : stat.accent === 'indigo'
                ? 'text-indigo-300'
                : stat.accent === 'purple'
                  ? 'text-violet-300'
                  : stat.accent === 'emerald'
                    ? 'text-emerald-300'
                    : stat.accent === 'sky'
                      ? 'text-sky-300'
                      : 'text-rose-300';

          return (
            <div key={stat.label} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                <Icon className={`h-3.5 w-3.5 ${accentClass}`} />
                {stat.label}
              </div>
              <div className={`mt-2 text-xl font-black tracking-tight ${accentClass}`}>{stat.value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface ProfileEditModalProps {
  isOpen: boolean;
  currentUser: AppUser;
  profile: ProfileSettings;
  onClose: () => void;
  onSave: (next: ProfileSettings) => Promise<void> | void;
}

export const ProfileEditModal: React.FC<ProfileEditModalProps> = ({ isOpen, currentUser, profile, onClose, onSave }) => {
  const [draft, setDraft] = useState<ProfileSettings>(profile);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft(profile);
      setAvatarError(null);
      setIsSaving(false);
    }
  }, [isOpen, profile]);

  if (!isOpen) return null;

  const updateField = <K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const validateAvatarFile = (file: File) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    const maxSizeBytes = 2 * 1024 * 1024;
    const lowerName = file.name.toLowerCase();

    if (!allowedTypes.includes(file.type)) {
      throw new Error('Only PNG, JPG, or WEBP images are allowed.');
    }
    if (!lowerName.endsWith('.png') && !lowerName.endsWith('.jpg') && !lowerName.endsWith('.jpeg') && !lowerName.endsWith('.webp')) {
      throw new Error('Invalid file extension for the selected image.');
    }
    if (file.size > maxSizeBytes) {
      throw new Error('Image must be 2MB or smaller.');
    }

    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const isValidSize = img.width > 0 && img.height > 0;
          if (!isValidSize) reject(new Error('Unable to decode image.'));
          else resolve(String(reader.result));
        };
        img.onerror = () => reject(new Error('Invalid image file.'));
        img.src = String(reader.result);
      };
      reader.onerror = () => reject(new Error('Could not read the selected image.'));
      reader.readAsDataURL(file);
    });
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await validateAvatarFile(file);
      setDraft(prev => ({ ...prev, avatarUrl: dataUrl }));
      setAvatarError(null);
    } catch (error: any) {
      setAvatarError(error?.message || 'Invalid profile image.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeAvatar = () => {
    setDraft(prev => ({ ...prev, avatarUrl: currentUser.avatar }));
    setAvatarError(null);
  };

  const handleSubmit = async () => {
    const sanitizedDisplayName = draft.displayName.trim();
    const sanitizedHeadline = clamp(draft.headline.trim(), 120);
    const sanitizedBio = clamp(draft.bio.trim(), 160);
    const sanitizedSkills = clamp(draft.skills.trim(), 220);

    if (!sanitizedDisplayName) {
      setAvatarError('Display name is required.');
      return;
    }

    const nextProfile: ProfileSettings = {
      displayName: sanitizedDisplayName,
      headline: sanitizedHeadline,
      bio: sanitizedBio,
      skills: sanitizedSkills,
      coverTheme: draft.coverTheme,
      avatarUrl: draft.avatarUrl || currentUser.avatar,
    };

    try {
      setIsSaving(true);
      setAvatarError(null);
      await onSave(nextProfile);
      onClose();
    } catch (error: any) {
      setAvatarError(error?.message || 'Failed to save profile changes.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[28px] border border-slate-800 bg-slate-950 shadow-[0_30px_80px_rgba(15,23,42,0.7)]">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400">Profile settings</p>
            <h3 className="mt-1 text-xl font-bold text-slate-100">Edit Profile</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-700 p-2 text-slate-300 transition hover:bg-slate-900">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 p-5 sm:p-6">
          <div className="space-y-4">
            <div className={`rounded-2xl bg-gradient-to-br ${getCoverClass(draft.coverTheme)} p-4`}>
              <div className="flex items-center gap-4">
                <div className="relative overflow-hidden rounded-full border-4 border-slate-950">
                  <img src={draft.avatarUrl || currentUser.avatar} alt="Profile preview" className="h-20 w-20 object-cover sm:h-24 sm:w-24" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xl font-black text-white">{draft.displayName || currentUser.name}</h4>
                  <p className="mt-1 text-sm text-slate-200">{draft.headline || currentUser.targetRole}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Profile picture</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Change Picture
                  </button>
                  <button
                    type="button"
                    onClick={removeAvatar}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
                  >
                    Remove
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleAvatarChange} />
                </div>
                {avatarError && <p className="mt-2 text-xs text-rose-400">{avatarError}</p>}
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Display name</label>
                <input
                  value={draft.displayName}
                  onChange={event => updateField('displayName', event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Headline</label>
                <input
                  value={draft.headline}
                  onChange={event => updateField('headline', clamp(event.target.value, 120))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Skills</label>
                <input
                  value={draft.skills}
                  onChange={event => updateField('skills', clamp(event.target.value, 220))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Short bio</label>
                <textarea
                  rows={3}
                  value={draft.bio}
                  onChange={event => updateField('bio', clamp(event.target.value, 160))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
                />
                <div className="mt-1.5 flex justify-end text-[10px] uppercase tracking-[0.18em] text-slate-400">
                  {draft.bio.length} / 160
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Banner theme</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {COVER_THEMES.map(theme => (
                    <button
                      key={theme.key}
                      type="button"
                      onClick={() => updateField('coverTheme', theme.key)}
                      className={`rounded-xl border px-2 py-2 text-left text-[11px] font-semibold transition ${
                        draft.coverTheme === theme.key
                          ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200'
                          : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className={`mb-2 h-10 rounded-lg bg-gradient-to-br ${theme.className}`} />
                      {theme.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-800 px-5 py-4 sm:px-6">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const getDefaultProfileSettings = defaultProfileSettings;
