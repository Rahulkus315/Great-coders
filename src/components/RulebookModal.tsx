import React from 'react';
import {
  X,
  BookOpen,
  Award,
  AlertTriangle,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Flame,
} from 'lucide-react';

interface RulebookModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulebookModal: React.FC<RulebookModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Official Rules of Engagement</h3>
              <p className="text-xs text-slate-400">Great Coders Challenge • Asia/Kolkata</p>
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

        {/* Content Sections */}
        <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
          {/* Rule 1: Point Scoring */}
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center gap-2 font-bold text-emerald-400 text-sm">
              <Award className="w-4 h-4" /> 1. Immutable Point Ledger Scoring
            </div>
            <p>Scores are calculated exclusively through an append-only transaction ledger:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px] pt-1">
              <div className="p-2 bg-slate-900 rounded border border-slate-800 text-emerald-300">
                +4 PTS: On-time daily curriculum completion (04:00 – 22:30 IST)
              </div>
              <div className="p-2 bg-slate-900 rounded border border-slate-800 text-rose-300">
                -5 PTS: Midnight settlement penalty for missed tasks (00:00 IST)
              </div>
              <div className="p-2 bg-slate-900 rounded border border-slate-800 text-amber-300">
                +2 PTS: Late catch-up task completion (after day has settled)
              </div>
              <div className="p-2 bg-slate-900 rounded border border-slate-800 text-cyan-300">
                +1 to +4 PTS: Daily DSA practice based on tier (+1 Basic, +2 Easy, +3 Med, +4 Hard)
              </div>
            </div>
          </div>

          {/* Rule 2: Learning Window */}
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center gap-2 font-bold text-indigo-400 text-sm">
              <Clock className="w-4 h-4" /> 2. IST Learning Window Times
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-300">
              <li><strong className="text-emerald-400">04:00 AM IST</strong>: Daily learning window officially opens.</li>
              <li><strong className="text-amber-400">10:00 PM IST</strong>: Closing warning triggers (30-minute buffer).</li>
              <li><strong className="text-rose-400">10:30 PM IST</strong>: Learning window firmly locks. Tasks cannot be logged as on-time afterwards.</li>
              <li><strong className="text-purple-400">00:00 AM IST</strong>: Automated midnight settlement evaluates missing tasks and applies penalties.</li>
            </ul>
          </div>

          {/* Rule 3: Mutual Approvals & Cooldowns */}
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-400 text-sm">
              <ShieldCheck className="w-4 h-4" /> 3. Mutual Admin Approvals & 12-Hour Cooldown
            </div>
            <p>
              Completed tasks cannot be unchecked unilaterally. To reverse an accidental completion or request an adjustment, you must submit a Reversal Request with a mandatory reason.
            </p>
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 font-medium">
              ⚠️ Strict Cooldown: If your partner declines a request, the system imposes a mandatory 12-hour lock preventing re-submission of that request.
            </div>
          </div>

          {/* Rule 4: Self-Control & Habits */}
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center gap-2 font-bold text-rose-400 text-sm">
              <Flame className="w-4 h-4" /> 4. Self-Control Accountability
            </div>
            <p>
              Mental clarity and discipline are tracked strictly for personal growth and friendly rivalry. Only aggregate streak numbers are compared head-to-head. Private reflection notes remain confidential.
            </p>
          </div>

          {/* Rule 5: 04:00 AM – 05:00 AM IST Wake-Up Protocol */}
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-400 text-sm">
              <Clock className="w-4 h-4" /> 5. Early Morning Wake-Up Protocol (04:00 AM – 05:00 AM IST)
            </div>
            <p>
              To ensure discipline in your daily rhythm, you must wake up at 04:00 AM IST and sleep at 10:30 PM IST.
            </p>
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 font-medium space-y-1 text-[11px]">
              <div>• <strong>1-Hour Active Window:</strong> The check-in button opens at 04:00 AM and stays live only until 05:00 AM IST.</div>
              <div>• <strong>+2 Discipline Points:</strong> Checking in during this 1-hour window awards +2 points to your ledger.</div>
              <div>• <strong>Window Locks:</strong> After 05:00 AM IST, the check-in is permanently locked for the day. Missing the window incurs a -1 point discipline deduction at midnight.</div>
            </div>
          </div>

          {/* Rule 6: 5-Day Holiday & Schedule Shift System */}
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center gap-2 font-bold text-sky-400 text-sm">
              <ShieldCheck className="w-4 h-4" /> 6. 5-Day Holiday Quota & Zero-Penalty Schedule Shift
            </div>
            <p>
              Across the 100-day curriculum (September 15, 2026 – December 23, 2026), each competitor is granted a maximum of <strong>5 allowable holidays/leaves</strong>.
            </p>
            <div className="p-2.5 bg-sky-500/10 border border-sky-500/20 rounded-lg text-sky-300 font-medium space-y-1 text-[11px]">
              <div>• <strong>Any Day Flexibility:</strong> You can apply for a holiday on any day when rest, illness, or travel requires it.</div>
              <div>• <strong>1-Day Schedule Shift:</strong> When you take a holiday, today's curriculum task and DSA problem shift forward to tomorrow. You will do that exact task tomorrow without losing any points.</div>
              <div>• <strong>Zero Penalty:</strong> No points are deducted, morning check-in is waived, and your ongoing streak is fully preserved.</div>
              <div>• <strong>Maximum Limit:</strong> Exactly 5 days total. Not more than 5 days under any circumstances.</div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
          >
            I Understand the Rules
          </button>
        </div>
      </div>
    </div>
  );
};
