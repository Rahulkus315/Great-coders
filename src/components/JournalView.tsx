import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Save,
  Clock,
  Star,
  Sparkles,
  AlertCircle,
  User,
  CheckCircle2,
  Moon,
  TrendingUp,
} from 'lucide-react';
import { DailyJournal } from '../types';

interface JournalViewProps {
  initialJournal: DailyJournal;
  partnerJournal?: DailyJournal | null;
  partnerName?: string;
  currentDate: string;
  isNightLockdown?: boolean;
  initialView?: 'MY_JOURNAL' | 'PARTNER_JOURNAL';
  onSaveJournal: (journal: Partial<DailyJournal>) => Promise<void>;
  onRatePartner?: (rating: number) => Promise<void>;
}

export const JournalView: React.FC<JournalViewProps> = ({
  initialJournal,
  partnerJournal,
  partnerName = 'Partner',
  currentDate,
  isNightLockdown = false,
  initialView = 'MY_JOURNAL',
  onSaveJournal,
  onRatePartner,
}) => {
  const [activeView, setActiveView] = useState<'MY_JOURNAL' | 'PARTNER_JOURNAL'>(initialView);

  const [formData, setFormData] = useState<Partial<DailyJournal>>({
    todayRoutine: initialJournal.todayRoutine || '',
    whatILearned: initialJournal.whatILearned || '',
    whatIBuilt: initialJournal.whatIBuilt || '',
    whatIStruggledWith: initialJournal.whatIStruggledWith || '',
    mistakes: initialJournal.mistakes || '',
    tomorrowImprovements: initialJournal.tomorrowImprovements || '',
    studyHours: initialJournal.studyHours || 3.0,
    energyRating: initialJournal.energyRating || 4,
    productivityRating: initialJournal.productivityRating || 4,
    isShared: true,
  });

  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isFocusedExecutionLocked = Boolean(initialJournal.focusedExecutionFinalizedAt || initialJournal.focusedExecutionMinutes !== undefined);

  // Peer rating state
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [selectedRating, setSelectedRating] = useState<number>(partnerJournal?.peerReviewRating || 0);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingSuccessMessage, setRatingSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setActiveView(initialView);
  }, [initialView]);

  useEffect(() => {
    if (partnerJournal?.peerReviewRating) {
      setSelectedRating(partnerJournal.peerReviewRating);
    }
  }, [partnerJournal?.peerReviewRating]);

  useEffect(() => {
    setFormData({
      todayRoutine: initialJournal.todayRoutine || '',
      whatILearned: initialJournal.whatILearned || '',
      whatIBuilt: initialJournal.whatIBuilt || '',
      whatIStruggledWith: initialJournal.whatIStruggledWith || '',
      mistakes: initialJournal.mistakes || '',
      tomorrowImprovements: initialJournal.tomorrowImprovements || '',
      studyHours: initialJournal.studyHours || 3.0,
      energyRating: initialJournal.energyRating || 4,
      productivityRating: initialJournal.productivityRating || 4,
      isShared: true,
    });
  }, [initialJournal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const finalizedMinutes = Math.round((Number(formData.studyHours || 0) * 60));
      await onSaveJournal({
        ...formData,
        isShared: true,
        status: 'SUBMITTED',
        focusedExecutionMinutes: finalizedMinutes,
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRatePartner = async (rating: number) => {
    if (ratingSubmitting) return;
    setRatingSubmitting(true);
    setRatingSuccessMessage(null);
    try {
      if (onRatePartner) {
        await onRatePartner(rating);
      } else {
        const res = await fetch('/api/journal/rate-partner', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            date: currentDate,
            rating,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to submit rating');
      }
      setSelectedRating(rating);
      setRatingSuccessMessage(`Rating saved! You gave ${partnerName} ${rating}/5 Stars ("Yeah, well done!").`);
      setTimeout(() => setRatingSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Error submitting rating');
    } finally {
      setRatingSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Night Mode Notice */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-100">Today’s Live</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Editable Until Midnight IST
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Daily reflection on output, learning, mistakes, and execution focus. Your accountability partner can review it and rate it once submitted.
              </p>
            </div>
          </div>

          {/* Tab Switcher between My Journal & Partner's Journal */}
          <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs gap-1">
            <button
              type="button"
              onClick={() => setActiveView('MY_JOURNAL')}
              className={`px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-2 min-h-[38px] ${
                activeView === 'MY_JOURNAL'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <User className="w-4 h-4 flex-shrink-0" />
              <span>My Today’s Live</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('PARTNER_JOURNAL')}
              className={`px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-2 min-h-[38px] ${
                activeView === 'PARTNER_JOURNAL'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-4 h-4 flex-shrink-0" />
              <span>{partnerName}'s Today’s Live & Rating</span>
            </button>
          </div>
        </div>

        {isNightLockdown && (
          <div className="bg-purple-950/40 border border-purple-500/30 rounded-xl p-3 flex items-center gap-2.5 text-xs text-purple-200">
            <Moon className="w-4 h-4 text-purple-400 flex-shrink-0" />
            <span>
              <strong>Night Reflection Window:</strong> You may continue refining your Today’s Live until midnight IST. After that, the entry becomes read-only.
            </span>
          </div>
        )}
      </div>

      {activeView === 'MY_JOURNAL' ? (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Peer Review Rating Received Banner */}
          {initialJournal.peerReviewRating && (
            <div className="p-4 bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-indigo-500/10 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Star className="w-5 h-5 fill-amber-400" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-amber-200 uppercase tracking-wide">
                    Peer Rating from {partnerName}
                  </h4>
                  <p className="text-sm font-black text-slate-100 mt-0.5">
                    {initialJournal.peerReviewRating} / 5 Stars — "Yeah, well done!"
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star
                    key={s}
                    className={`w-4 h-4 ${
                      s <= (initialJournal.peerReviewRating || 0)
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Top Control Bar with Save Button */}
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-5 py-3 shadow-md">
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>Transparent Mode Active • Entry will be visible to {partnerName}</span>
            </div>

            <button
              type="submit"
              disabled={isSaving || isFocusedExecutionLocked}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 transition-all shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? 'Submitting...' : isFocusedExecutionLocked ? 'Permanently Locked' : isSaved ? 'Saved Securely!' : 'Submit & Lock'}
            </button>
          </div>

          {/* Quick Metrics Bar: Hours & Ratings */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Hours */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <label className="text-xs font-semibold text-slate-400 block mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-purple-400" /> Focused Execution Hours:
              </label>
              {isFocusedExecutionLocked ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-300 font-bold text-sm">
                    <span>🔒</span>
                    <span>{(initialJournal.focusedExecutionMinutes ?? 0) / 60}h</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Permanently recorded. It cannot be changed.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="18"
                      value={formData.studyHours}
                      onChange={e => setFormData({ ...formData, studyHours: parseFloat(e.target.value) || 0 })}
                      className="w-24 px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 text-sm font-semibold"
                    />
                    <span className="text-xs text-slate-400">hours</span>
                  </div>
                  <p className="text-[10px] text-amber-300">
                    ⚠️ This can be submitted only once. After submission, it cannot be changed.
                  </p>
                </div>
              )}
            </div>

            {/* Daily Performance / Sales Rating */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl sm:col-span-2">
              <label className="text-xs font-semibold text-slate-400 block mb-1.5 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-amber-400" /> Rating for Today (1–5 Stars):
              </label>
              <div className="flex items-center gap-2 pt-0.5">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setFormData({ ...formData, productivityRating: star })}
                    className={`p-1 text-lg font-bold cursor-pointer transition-transform hover:scale-110 ${
                      (formData.productivityRating || 0) >= star ? 'text-amber-400' : 'text-slate-700'
                    }`}
                  >
                    ★
                  </button>
                ))}
                <span className="text-xs font-semibold text-slate-300 ml-2">
                  {formData.productivityRating === 1 && '1/5 - Struggled / Low Focus'}
                  {formData.productivityRating === 2 && '2/5 - Fair / Distracted'}
                  {formData.productivityRating === 3 && '3/5 - Solid Execution'}
                  {formData.productivityRating === 4 && '4/5 - Strong Productivity'}
                  {formData.productivityRating === 5 && '5/5 - Peak Performance!'}
                </span>
              </div>
            </div>
          </div>

          {/* Form Prompts */}
          <div className="space-y-4">
            {/* What I did today */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-purple-400">
                1. What I Did Today
              </label>
              <p className="text-[11px] text-slate-400">Calls, outreach, curriculum tasks completed, prototypes, and meetings.</p>
              <textarea
                rows={3}
                placeholder="Detail exactly what you accomplished today..."
                value={formData.whatIBuilt}
                onChange={e => setFormData({ ...formData, whatIBuilt: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* What I learned */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-emerald-400">
                2. What I Learned Today
              </label>
              <p className="text-[11px] text-slate-400">New architectural insights, sales psychology, objection handling, or technical concepts.</p>
              <textarea
                rows={3}
                placeholder="Key takeaways and new perspectives..."
                value={formData.whatILearned}
                onChange={e => setFormData({ ...formData, whatILearned: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Mistakes made today */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" /> 3. Mistakes Made Today
              </label>
              <p className="text-[11px] text-slate-400">Honest breakdown of time wasted, bad communication, missed opportunities, or errors.</p>
              <textarea
                rows={3}
                placeholder="Be completely honest: where did you slip or make mistakes today?..."
                value={formData.mistakes}
                onChange={e => setFormData({ ...formData, mistakes: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Improvements for tomorrow */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-cyan-400">
                4. Actionable Improvements for Tomorrow
              </label>
              <p className="text-[11px] text-slate-400">Specific rule or adjustment you will execute tomorrow.</p>
              <textarea
                rows={2}
                placeholder="Tomorrow I will wake up promptly at 04:00 AM and avoid..."
                value={formData.tomorrowImprovements}
                onChange={e => setFormData({ ...formData, tomorrowImprovements: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
        </form>
      ) : (
        /* PARTNER'S JOURNAL VIEW (STRICTLY READ-ONLY + 1-5 STAR RATING ONLY) */
        <div className="space-y-6">
          {/* Read-Only Notice Banner */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-700/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5 text-slate-300">
              <BookOpen className="w-4 h-4 text-purple-400 flex-shrink-0" />
              <span>
                <strong>Read-Only Mode:</strong> You cannot edit or modify {partnerName}'s Today’s Live. You can only review it and give a 1–5 star rating ("Yeah, well done!").
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveView('MY_JOURNAL')}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 transition-colors cursor-pointer"
            >
              ← Back to My Journal
            </button>
          </div>

          {/* Interactive Peer Review Rating Component */}
          <div className="bg-gradient-to-br from-indigo-950/70 via-slate-900 to-purple-950/70 border border-indigo-500/40 rounded-2xl p-5 sm:p-6 shadow-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-sm sm:text-base font-black text-slate-100 flex items-center gap-2">
                  <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                  Rate {partnerName}'s Today’s Live (1–5 Stars)
                </h4>
                <p className="text-xs text-slate-300">
                  Give honest feedback on {partnerName}'s daily consistency, productivity, and transparency.
                </p>
              </div>

              {partnerJournal?.peerReviewRating ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Rated {partnerJournal.peerReviewRating}/5 Stars
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Rating Pending
                </div>
              )}
            </div>

            {/* Interactive 1 to 5 Star Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map(starValue => {
                  const isFilled =
                    (hoverRating || selectedRating || partnerJournal?.peerReviewRating || 0) >= starValue;
                  return (
                    <button
                      key={starValue}
                      type="button"
                      disabled={ratingSubmitting}
                      onMouseEnter={() => setHoverRating(starValue)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => handleRatePartner(starValue)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isFilled
                          ? 'bg-amber-500/20 border-amber-500/60 text-amber-400 scale-105 shadow-md shadow-amber-500/10'
                          : 'bg-slate-950 border-slate-800 text-slate-600 hover:text-slate-400 hover:bg-slate-800'
                      }`}
                      title={`Give ${starValue} Star${starValue > 1 ? 's' : ''}`}
                    >
                      <Star className={`w-6 h-6 ${isFilled ? 'fill-amber-400 text-amber-400' : ''}`} />
                    </button>
                  );
                })}
              </div>

              <div className="text-xs font-semibold text-slate-200">
                {(hoverRating || selectedRating || partnerJournal?.peerReviewRating) === 5 && (
                  <span className="text-emerald-400 font-bold">5 Stars: "Yeah, well done! Outstanding performance."</span>
                )}
                {(hoverRating || selectedRating || partnerJournal?.peerReviewRating) === 4 && (
                  <span className="text-indigo-300 font-bold">4 Stars: "Very strong discipline and output."</span>
                )}
                {(hoverRating || selectedRating || partnerJournal?.peerReviewRating) === 3 && (
                  <span className="text-amber-400 font-bold">3 Stars: "Good progress, keep the momentum."</span>
                )}
                {(hoverRating || selectedRating || partnerJournal?.peerReviewRating) === 2 && (
                  <span className="text-amber-300 font-bold">2 Stars: "Fair effort, needs more focus."</span>
                )}
                {(hoverRating || selectedRating || partnerJournal?.peerReviewRating) === 1 && (
                  <span className="text-rose-400 font-bold">1 Star: "Underperformed today, step up tomorrow."</span>
                )}
                {!(hoverRating || selectedRating || partnerJournal?.peerReviewRating) && (
                  <span className="text-slate-400 font-normal">Click any star (1–5) to record rating</span>
                )}
              </div>
            </div>

            {ratingSuccessMessage && (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>{ratingSuccessMessage}</span>
              </div>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center justify-center font-bold">
                  {partnerName.charAt(0)}
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-100">{partnerName}'s Journal for Today</h4>
                  <p className="text-xs text-slate-400">
                    Daily routine, tasks completed, mistakes, and self-rating.
                  </p>
                </div>
              </div>

              {partnerJournal && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 text-amber-400" title="Partner Self-Rating">
                    {[1, 2, 3, 4, 5].map(s => (
                      <span key={s} className={s <= (partnerJournal.productivityRating || 0) ? 'text-amber-400' : 'text-slate-700'}>
                        ★
                      </span>
                    ))}
                  </div>
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-200 border border-slate-700">
                    {partnerJournal.studyHours || 0} hrs
                  </span>
                </div>
              )}
            </div>

            {!partnerJournal || (!partnerJournal.whatIBuilt && !partnerJournal.mistakes && !partnerJournal.whatILearned) ? (
              <div className="py-12 text-center text-slate-500 space-y-2">
                <BookOpen className="w-8 h-8 mx-auto text-slate-600 opacity-50" />
                <p className="text-sm font-medium text-slate-400">
                  {partnerName} has not written their journal entry for today yet.
                </p>
                <p className="text-xs text-slate-500">
                  Entries are submitted during the evening or night reflection window. Check back soon.
                </p>
              </div>
            ) : (
              <div className="space-y-5 pt-2 text-xs text-slate-300">
                {/* 1. What Partner Did */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="font-bold text-purple-400 block text-[11px] uppercase tracking-wider">
                    What {partnerName} Did Today:
                  </span>
                  <p className="whitespace-pre-line leading-relaxed text-slate-200">
                    {partnerJournal.whatIBuilt || 'No notes entered.'}
                  </p>
                </div>

                {/* 2. Mistakes Made */}
                <div className="bg-slate-950 p-4 rounded-xl border border-rose-900/30 space-y-1.5">
                  <span className="font-bold text-rose-400 block text-[11px] uppercase tracking-wider flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Mistakes {partnerName} Made Today:
                  </span>
                  <p className="whitespace-pre-line leading-relaxed text-rose-200/90">
                    {partnerJournal.mistakes || 'None reported.'}
                  </p>
                </div>

                {/* 3. What Partner Learned */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="font-bold text-emerald-400 block text-[11px] uppercase tracking-wider">
                    What {partnerName} Learned:
                  </span>
                  <p className="whitespace-pre-line leading-relaxed text-slate-200">
                    {partnerJournal.whatILearned || 'No notes entered.'}
                  </p>
                </div>

                {/* 4. Improvements for Tomorrow */}
                {partnerJournal.tomorrowImprovements && (
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
                    <span className="font-bold text-cyan-400 block text-[11px] uppercase tracking-wider">
                      Tomorrow's Improvements:
                    </span>
                    <p className="whitespace-pre-line leading-relaxed text-slate-200">
                      {partnerJournal.tomorrowImprovements}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
