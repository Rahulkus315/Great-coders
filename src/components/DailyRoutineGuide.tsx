import React, { useState } from 'react';
import {
  Clock,
  Code2,
  Dumbbell,
  BookOpen,
  Server,
  FileCheck,
  Moon,
  ChevronDown,
  ChevronUp,
  Sun,
} from 'lucide-react';

export const DailyRoutineGuide: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  const schedule = [
    {
      time: 'Day 1–7',
      title: 'Java Foundations',
      desc: 'Core Java: JVM, OOP, classes, methods, collections, and the first revision checkpoint.',
      icon: <Sun className="w-4 h-4 text-amber-400" />,
      tag: 'Foundation',
    },
    {
      time: 'Day 8–21',
      title: 'OOP, Collections & Java Deep Dives',
      desc: 'Inheritance, interfaces, generics, exceptions, HashMap internals, and practical DSA review.',
      icon: <Code2 className="w-4 h-4 text-cyan-400" />,
      tag: 'Core Java',
    },
    {
      time: 'Day 22–28',
      title: 'Modern Java & Recap Sprint',
      desc: 'Streams, lambdas, recursion, backtracking, and a first-major revision cycle before backend work.',
      icon: <BookOpen className="w-4 h-4 text-indigo-400" />,
      tag: 'Modern Java',
    },
    {
      time: 'Day 29–56',
      title: 'Spring Boot, SQL & Data Layer',
      desc: 'Spring fundamentals, JDBC, SQL, transactions, JPA, and backend architecture essentials.',
      icon: <Server className="w-4 h-4 text-purple-400" />,
      tag: 'Backend',
    },
    {
      time: 'Day 57–70',
      title: 'Security, JWT & React Foundations',
      desc: 'Spring Security, JWT auth, protected routes, React basics, hooks, and full-stack integration.',
      icon: <FileCheck className="w-4 h-4 text-amber-400" />,
      tag: 'Full Stack',
    },
    {
      time: 'Day 71–84',
      title: 'Full-Stack Project Sprint',
      desc: 'Production patterns, testing, Docker, deployment, dashboards, and end-to-end app building.',
      icon: <Dumbbell className="w-4 h-4 text-emerald-400" />,
      tag: 'Build',
    },
    {
      time: 'Day 85–100',
      title: 'System Design, Mocks & Final Assessment',
      desc: 'Scaling, async systems, mock interviews, final reviews, and the 100-day capstone challenge.',
      icon: <Moon className="w-4 h-4 text-slate-300" />,
      tag: 'Final Sprint',
    },
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl transition-all">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              100-Day Challenge Day Roadmap
              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Day-Aligned Plan
              </span>
            </h4>
            <p className="text-xs text-slate-400">
              Structured by challenge phases, not a generic personal routine, to align with the actual day-by-day curriculum.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
          <span>{isExpanded ? 'Collapse' : 'Expand Schedule'}</span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {isExpanded && (
        <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-3 animate-in fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {schedule.map((item, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-start gap-3"
              >
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 mt-0.5">
                  {item.icon}
                </div>
                <div className="space-y-0.5 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-indigo-400 font-semibold">
                      {item.time}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                      {item.tag}
                    </span>
                  </div>
                  <h5 className="text-xs font-bold text-slate-200">{item.title}</h5>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
