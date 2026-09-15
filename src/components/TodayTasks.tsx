import React, { useState } from 'react';
import { CheckCircle, Clock, Code2, Moon, Palmtree, Server, Database, Coffee, RotateCcw } from 'lucide-react';
import { DailyTask, DSAProblem, LearningWindowStatus, ScheduleSection, ScheduleSectionStatus } from '../types';
import { ConfirmationModal } from './ConfirmationModal';

interface TodayTasksProps {
  task: DailyTask | null;
  dsaProblem: DSAProblem | null;
  sectionStatuses: Record<ScheduleSection, ScheduleSectionStatus>;
  windowStatus: LearningWindowStatus;
  isReversalBlocked?: boolean;
  reversalCooldownText?: string;
  isOnLeaveToday?: boolean;
  isNightLockdown?: boolean;
  onOpenLeavesModal?: () => void;
  onCompleteSection: (section: ScheduleSection) => Promise<void>;
  onUndoSection: (section: ScheduleSection) => Promise<void>;
}

const SECTION_CONFIG: Record<ScheduleSection, { label: string; points: number; icon: React.ReactNode; color: string }> = {
  DSA: { label: 'DSA', points: 10, icon: <Code2 className="w-5 h-5" />, color: 'cyan' },
  JAVA: { label: 'Java', points: 10, icon: <Coffee className="w-5 h-5" />, color: 'amber' },
  OS: { label: 'Operating Systems (OS)', points: 8, icon: <Server className="w-5 h-5" />, color: 'violet' },
  DBMS: { label: 'DBMS', points: 8, icon: <Database className="w-5 h-5" />, color: 'emerald' },
};

const sectionOrder: ScheduleSection[] = ['DSA', 'JAVA', 'OS', 'DBMS'];

export const TodayTasks: React.FC<TodayTasksProps> = ({
  task,
  dsaProblem,
  sectionStatuses,
  isOnLeaveToday = false,
  isNightLockdown = false,
  onOpenLeavesModal,
  onCompleteSection,
  onUndoSection,
}) => {
  const [submittingSection, setSubmittingSection] = useState<ScheduleSection | null>(null);
  const [sectionError, setSectionError] = useState<ScheduleSection | null>(null);
  const [confirmation, setConfirmation] = useState<{ section: ScheduleSection; action: 'complete' | 'undo' } | null>(null);
  if (isOnLeaveToday || !task) {
    return (
      <div className="bg-sky-950/20 border border-sky-500/30 rounded-2xl p-8 text-center space-y-4 shadow-xl">
        <Palmtree className="w-10 h-10 mx-auto text-sky-400" />
        <h3 className="text-xl font-bold text-slate-100">Approved Holiday Active</h3>
        <p className="text-sm text-slate-300">Today&apos;s four sections are protected. Your schedule shifts forward by one day.</p>
        {onOpenLeavesModal && (
          <button type="button" onClick={onOpenLeavesModal} className="px-4 py-2 rounded-xl bg-sky-600/30 text-sky-200 border border-sky-500/40 text-xs font-semibold">
            Manage Holiday Quota
          </button>
        )}
      </div>
    );
  }

  const getTopic = (section: ScheduleSection) => {
    if (section === 'DSA') {
      return {
        title: dsaProblem?.title || 'DSA practice',
        description: dsaProblem?.description || 'Complete today&apos;s assigned DSA problems.',
        minutes: task.dayNumber % 7 === 0 ? 120 : 150,
        difficulty: dsaProblem?.difficulty || task.difficulty,
      };
    }
    const topic = task.studyTopics?.find(item => item.subject === section);
    return {
      title: topic?.title || `${section} study topic`,
      description: topic?.description || 'Study the assigned topic and record your notes.',
      minutes: task.dayNumber % 7 === 0 ? 60 : section === 'JAVA' ? 60 : 45,
      difficulty: task.difficulty,
    };
  };

  const confirmAction = async () => {
    if (!confirmation) return;
    const { section, action } = confirmation;
    setSubmittingSection(section);
    setSectionError(null);
    try {
      if (action === 'complete') await onCompleteSection(section);
      else await onUndoSection(section);
      setConfirmation(null);
    } catch (error) {
      console.error(`Failed to ${action} ${section} section:`, error);
      setSectionError(section);
    } finally {
      setSubmittingSection(null);
    }
  };

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-slate-800">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-indigo-400 font-bold">Day {task.dayNumber}</p>
          <h3 className="text-xl font-black text-white">Today&apos;s Schedule</h3>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
          <Clock className="w-4 h-4 text-indigo-400" /> 5+ hours total
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
        {sectionOrder.map(section => {
          const config = SECTION_CONFIG[section];
          const topic = getTopic(section);
          const status = sectionStatuses[section];
          const completed = status?.status === 'COMPLETED_ON_TIME' || status?.status === 'COMPLETED_LATE';
          const missed = status?.status === 'MISSED';
          const points = status?.pointsAwarded || config.points;
          const isSubmitting = submittingSection === section;

          return (
            <article key={section} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 flex flex-col min-h-[210px]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">{config.icon}</div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400 font-bold">{config.label}</p>
                    <h4 className="text-base font-bold text-slate-100 mt-0.5">{topic.title}</h4>
                  </div>
                </div>
                <span className="text-sm font-black text-emerald-400 whitespace-nowrap">+{config.points} pts</span>
              </div>

              <p className="mt-3 text-xs text-slate-300 leading-relaxed flex-1">{topic.description}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-400">
                <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {topic.minutes} min</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">{topic.difficulty}</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">{task.priority} priority</span>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                {completed ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                      <CheckCircle className="w-4 h-4" /> Completed ✓ (+{points} pts)
                    </span>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setConfirmation({ section, action: 'undo' })}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 text-xs font-bold disabled:opacity-60"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Undo Completion
                    </button>
                  </div>
                ) : missed ? (
                  <span className="text-xs font-bold text-rose-300">Missed settlement (-5 pts)</span>
                ) : isNightLockdown ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-300"><Moon className="w-3.5 h-3.5" /> Locked until 04:00</span>
                ) : (
                  <button
                    type="button"
                    disabled={completed || isSubmitting}
                    onClick={() => setConfirmation({ section, action: 'complete' })}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-60"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Complete Section
                  </button>
                )}
                {!completed && !missed && <span className="text-[10px] text-slate-500">Points awarded by server</span>}
              </div>
              {sectionError === section && (
                <p className="mt-2 text-xs font-semibold text-rose-300">Unable to complete this section. Please try again.</p>
              )}
            </article>
          );
        })}
      </div>
      <ConfirmationModal
        isOpen={confirmation !== null}
        title={confirmation?.action === 'undo' ? `Undo ${confirmation.section} Section Completion?` : `Complete ${confirmation?.section || ''} Section?`}
        message={confirmation?.action === 'undo'
          ? 'Are you sure you want to mark this section as incomplete?'
          : 'Are you sure you have completed this section\'s task?'}
        warningNote={confirmation?.action === 'undo'
          ? 'The points awarded for this completion will also be reversed.'
          : 'You will receive the configured points for completing this section.'}
        confirmLabel={confirmation?.action === 'undo' ? 'Confirm Undo' : 'Confirm Completion'}
        cancelLabel={confirmation?.action === 'undo' ? 'Keep Completed' : 'Cancel'}
        isDestructive={confirmation?.action === 'undo'}
        isProcessing={submittingSection !== null}
        onConfirm={confirmAction}
        onCancel={() => setConfirmation(null)}
      />
    </section>
  );
};
