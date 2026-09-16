import React, { useState } from 'react';
import {
  ShieldCheck,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  RotateCcw,
  Send,
  Lock,
} from 'lucide-react';
import { PermissionRequest } from '../types';

interface ApprovalsViewProps {
  pendingForMe: PermissionRequest[];
  myRequests: PermissionRequest[];
  allRequests: PermissionRequest[];
  currentUserName: string;
  onApprove: (id: string, reason?: string) => Promise<void>;
  onDecline: (id: string, reason?: string) => Promise<void>;
}

export const ApprovalsView: React.FC<ApprovalsViewProps> = ({
  pendingForMe,
  myRequests,
  allRequests,
  currentUserName,
  onApprove,
  onDecline,
}) => {
  const [responseReason, setResponseReason] = useState<{ [id: string]: string }>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const processRequest = async (id: string, action: () => Promise<void>) => {
    setProcessingId(id);
    setErrorMessage(null);
    try {
      await action();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to process approval request.');
    } finally {
      setProcessingId(null);
    }
  };

  const formatRemainingTime = (cooldownUntilStr?: string) => {
    if (!cooldownUntilStr) return '';
    const diff = new Date(cooldownUntilStr).getTime() - Date.now();
    if (diff <= 0) return 'Cooldown expired';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `You can request again in ${hours}h ${minutes}m`;
  };

  return (
    <div className="space-y-6">
      {/* Header & Two-Person Admin Model Notice */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100">Mutual Approvals & Admin Governance</h3>
            <p className="text-xs text-slate-400">
              Rahul and Dileep operate as co-administrators. Reversals and sensitive adjustments require mutual consent.
            </p>
          </div>
        </div>
      </div>

      {errorMessage && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-300">{errorMessage}</div>}

      {/* 1. Pending Approvals Awaiting YOUR Decision */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" /> Pending Requests Awaiting Your Decision ({pendingForMe.length})
          </h4>
        </div>

        {pendingForMe.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No pending approval requests for you at this time.
          </div>
        ) : (
          <div className="space-y-4">
            {pendingForMe.map(req => (
              <div
                key={req.id}
                className="p-4 bg-slate-950/70 border border-amber-500/30 rounded-xl space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold text-slate-400">
                      Request from <strong className="text-indigo-300">{req.requesterName}</strong>:
                    </span>
                    <h5 className="text-sm font-bold text-slate-100 mt-0.5">
                      {req.actionType.replace('_', ' ')}: "{req.entityTitle}"
                    </h5>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Submitted: {new Date(req.createdAt).toLocaleString()}
                  </span>
                </div>

                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300">
                  <span className="font-semibold text-slate-400 block mb-0.5">Requester's Reason:</span>
                  <p className="italic">"{req.reason}"</p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <input
                    type="text"
                    placeholder="Optional notes or condition..."
                    value={responseReason[req.id] || ''}
                    onChange={e => setResponseReason({ ...responseReason, [req.id]: e.target.value })}
                    className="flex-1 min-w-[200px] px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200"
                  />

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={processingId !== null}
                      onClick={() => void processRequest(req.id, () => onDecline(req.id, responseReason[req.id]))}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5 text-rose-400" /> Decline (12h Cooldown)
                    </button>
                    <button
                      type="button"
                      disabled={processingId !== null}
                      onClick={() => void processRequest(req.id, () => onApprove(req.id, responseReason[req.id]))}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Approve & Execute
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Your Submitted Requests & Cooldown Status */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="border-b border-slate-800 pb-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
            Your Sent Approval Requests ({myRequests.length})
          </h4>
        </div>

        {myRequests.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            You haven't submitted any approval requests.
          </div>
        ) : (
          <div className="space-y-3">
            {myRequests.map(req => {
              const isCooldownActive =
                req.status === 'DECLINED' &&
                req.declinedCooldownUntil &&
                new Date(req.declinedCooldownUntil).getTime() > Date.now();

              return (
                <div
                  key={req.id}
                  className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-200">
                      {req.actionType.replace('_', ' ')}: {req.entityTitle}
                    </span>
                    <span className="text-slate-400 block mt-0.5">Reason: {req.reason}</span>
                  </div>

                  <div>
                    {req.status === 'PENDING' && (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        AWAITING PARTNER
                      </span>
                    )}
                    {req.status === 'APPROVED' && (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        APPROVED & EXECUTED
                      </span>
                    )}
                    {req.status === 'DECLINED' && (
                      <div className="text-right">
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 inline-block mb-1">
                          DECLINED
                        </span>
                        {isCooldownActive && (
                          <div className="text-[10px] text-amber-400 flex items-center gap-1 font-mono">
                            <Lock className="w-3 h-3" />
                            {formatRemainingTime(req.declinedCooldownUntil)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
