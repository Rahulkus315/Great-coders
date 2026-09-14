import { getRuntimePool, store } from './store';
import { PermissionRequest, PermissionActionType, AuditLogEntry } from '../src/types';
import { getDateForDay } from './curriculumData';
import { calculateDayInfo, getISTNow } from './timeUtils';
import { TaskCompletionError, undoTask } from './taskCompletionService';

const COOLDOWN_HOURS = 12;
const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;

export interface CooldownCheckResult {
  isBlocked: boolean;
  remainingMs: number;
  remainingText: string;
}

export class PermissionValidationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'PermissionValidationError';
    this.statusCode = statusCode;
  }
}

function getScheduleTargetEntity(req: PermissionRequest) {
  const state = store.getState();
  const entityType = req.entityType || 'TASK';

  if (entityType === 'DSA') {
    const problem = state.dsaProblems.find(item => item.id === req.entityId);
    if (!problem) {
      throw new PermissionValidationError('Target DSA item not found.', 404);
    }
    return problem;
  }

  const task = state.tasks.find(item => item.id === req.entityId);
  if (!task) {
    throw new PermissionValidationError('Target task not found.', 404);
  }
  return task;
}

export function checkPermissionCooldown(
  requesterId: string,
  actionType: PermissionActionType,
  entityId: string
): CooldownCheckResult {
  const state = store.getState();
  const now = getISTNow().getTime();

  // Find any DECLINED request by this user for the same action and entity
  const declinedRequests = state.permissions.filter(
    p =>
      p.requesterId === requesterId &&
      p.actionType === actionType &&
      p.entityId === entityId &&
      p.status === 'DECLINED' &&
      p.declinedCooldownUntil
  );

  if (declinedRequests.length === 0) {
    return { isBlocked: false, remainingMs: 0, remainingText: '' };
  }

  // Get latest declined
  declinedRequests.sort(
    (a, b) => new Date(b.declinedCooldownUntil!).getTime() - new Date(a.declinedCooldownUntil!).getTime()
  );
  const latest = declinedRequests[0];
  const cooldownUntil = new Date(latest.declinedCooldownUntil!).getTime();

  if (now < cooldownUntil) {
    const diffMs = cooldownUntil - now;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return {
      isBlocked: true,
      remainingMs: diffMs,
      remainingText: `You can request again in ${hours}h ${minutes}m.`,
    };
  }

  return { isBlocked: false, remainingMs: 0, remainingText: '' };
}

export function createPermissionRequest(
  requesterId: string,
  actionType: PermissionActionType,
  entityId: string,
  entityTitle: string,
  reason: string,
  options?: {
    entityType?: 'TASK' | 'DSA' | 'STUDY_SCHEDULE';
    oldValue?: string;
    proposedValue?: string;
  }
): PermissionRequest {
  const cooldown = checkPermissionCooldown(requesterId, actionType, entityId);
  if (cooldown.isBlocked) {
    throw new PermissionValidationError(`Action is blocked by 12-hour mutual cooldown. ${cooldown.remainingText}`, 429);
  }

  const state = store.getState();
  const requester = state.users.find(u => u.id === requesterId);
  if (!requester) throw new PermissionValidationError('Invalid requester', 400);

  const targetUser = state.users.find(u => u.id !== requesterId);
  if (!targetUser) throw new PermissionValidationError('Target partner not found', 404);

  let targetVersion: number | undefined;
  if (actionType === 'SCHEDULE_CHANGE') {
    const entity = getScheduleTargetEntity({
      id: `tmp-${entityId}`,
      requesterId,
      requesterName: requester.name,
      targetUserId: targetUser.id,
      targetUserName: targetUser.name,
      actionType,
      entityType: options?.entityType || 'TASK',
      entityId,
      entityTitle,
      reason,
      status: 'PENDING',
      createdAt: getISTNow().toISOString(),
    });
    targetVersion = (entity as any).version ?? 1;
  }

  const existingPending = state.permissions.find(
    p =>
      p.entityId === entityId &&
      p.actionType === actionType &&
      p.status === 'PENDING' &&
      (p.targetVersion === targetVersion || targetVersion === undefined || p.targetVersion === undefined)
  );
  if (existingPending) {
    throw new PermissionValidationError('A change request for this target is already awaiting approval.', 409);
  }

  const nowIso = getISTNow().toISOString();
  const request: PermissionRequest = {
    id: `perm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    requesterId: requester.id,
    requesterName: requester.name,
    targetUserId: targetUser.id,
    targetUserName: targetUser.name,
    actionType,
    entityType: options?.entityType,
    entityId,
    entityTitle,
    targetVersion,
    oldValue: options?.oldValue,
    proposedValue: options?.proposedValue,
    reason,
    status: 'PENDING',
    createdAt: nowIso,
  };

  state.permissions.unshift(request);

  // Send notification to target partner
  state.notifications.unshift({
    id: `notif-perm-${Date.now()}`,
    userId: targetUser.id,
    type: 'APPROVAL_REQUEST',
    title: `Approval Requested by ${requester.name}`,
    message: `${requester.name} requested approval to ${actionType.toLowerCase().replace('_', ' ')}: "${entityTitle}". Reason: ${reason}`,
    read: false,
    createdAt: nowIso,
  });

  // Add audit log
  state.auditLogs.unshift({
    id: `audit-${Date.now()}`,
    actorId: requester.id,
    actorName: requester.name,
    action: `REQUEST_${actionType}`,
    targetType: actionType,
    targetId: entityId,
    reason,
    timestamp: nowIso,
  });

  store.save();
  return request;
}

export async function handlePermissionResponse(
  responderId: string,
  requestId: string,
  decision: 'APPROVE' | 'DECLINE',
  responseReason?: string
): Promise<PermissionRequest> {
  const state = store.getState();
  const req = state.permissions.find(p => p.id === requestId);
  if (!req) {
    throw new PermissionValidationError('Permission request not found', 404);
  }

  if (req.requesterId === responderId) {
    throw new PermissionValidationError('You cannot approve or decline your own request.', 403);
  }

  if (req.targetUserId !== responderId) {
    throw new PermissionValidationError('You are not authorized to respond to this request.', 403);
  }

  if (req.status !== 'PENDING') {
    throw new PermissionValidationError(`This request has already been ${req.status.toLowerCase()}.`, 409);
  }

  const responder = state.users.find(u => u.id === responderId);
  const now = getISTNow();
  const nowIso = now.toISOString();

  if (decision === 'APPROVE') {
    const target = req.actionType === 'SCHEDULE_CHANGE' ? getScheduleTargetEntity(req) : null;
    const currentVersion = target ? ((target as any).version ?? 1) : undefined;

    if (typeof req.targetVersion === 'number' && typeof currentVersion === 'number' && req.targetVersion !== currentVersion) {
      req.status = 'EXPIRED';
      req.respondedAt = nowIso;
      req.processedAt = nowIso;
      store.save();
      throw new PermissionValidationError('This task has changed since the request was created. The request is stale and cannot be approved.', 409);
    }

    if (target && target.dayNumber <= calculateDayInfo().dayNumber) {
      req.status = 'EXPIRED';
      req.respondedAt = nowIso;
      req.processedAt = nowIso;
      store.save();
      throw new PermissionValidationError('This task is no longer editable because its execution window has started.', 409);
    }

    const reqSnapshot = { ...req };
    const targetSnapshot = target ? { ...target } : null;

    req.status = 'APPROVED';
    req.respondedAt = nowIso;
    req.processedAt = nowIso;

    try {
      await executeApprovedAction(req);
      req.appliedAt = req.appliedAt || nowIso;

      state.notifications.unshift({
        id: `notif-resp-${Date.now()}`,
        userId: req.requesterId,
        type: 'APPROVAL_RESPONSE',
        title: 'Approval Granted',
        message: `${responder?.name || 'Partner'} approved your request: "${req.entityTitle}". Action executed.`,
        read: false,
        createdAt: nowIso,
      });

      state.auditLogs.unshift({
        id: `audit-${Date.now()}`,
        actorId: responderId,
        actorName: responder?.name || 'Rahul',
        action: `APPROVE_${req.actionType}`,
        targetType: req.actionType,
        targetId: req.entityId,
        reason: responseReason || 'Approved by mutual consent',
        timestamp: nowIso,
      });
    } catch (error) {
      if (targetSnapshot && target) {
        Object.assign(target, targetSnapshot);
      }
      Object.assign(req, reqSnapshot);
      throw error;
    }
  } else {
    req.status = 'DECLINED';
    req.respondedAt = nowIso;
    req.processedAt = nowIso;
    const cooldownUntil = new Date(now.getTime() + COOLDOWN_MS).toISOString();
    req.declinedCooldownUntil = cooldownUntil;

    state.notifications.unshift({
      id: `notif-resp-${Date.now()}`,
      userId: req.requesterId,
      type: 'APPROVAL_RESPONSE',
      title: 'Request Declined',
      message: `${responder?.name || 'Partner'} declined your request: "${req.entityTitle}". 12-hour cooldown active.`,
      read: false,
      createdAt: nowIso,
    });

    state.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId: responderId,
      actorName: responder?.name || 'Rahul',
      action: `DECLINE_${req.actionType}`,
      targetType: req.actionType,
      targetId: req.entityId,
      reason: responseReason || 'Declined. 12-hour cooldown applied.',
      timestamp: nowIso,
    });
  }

  store.save();
  return req;
}

async function executeApprovedAction(req: PermissionRequest) {
  const state = store.getState();
  const nowIso = getISTNow().toISOString();

  if (req.actionType === 'SCHEDULE_CHANGE') {
    const proposedDayMatch = (req.proposedValue || '').match(/(\d+)/);
    const proposedDayNumber = proposedDayMatch ? Number(proposedDayMatch[1]) : null;

    if (!proposedDayNumber) {
      throw new PermissionValidationError('Invalid schedule change proposal.', 400);
    }

    const targetEntityType = req.entityType || 'TASK';
    const activeTarget = targetEntityType === 'DSA'
      ? state.dsaProblems.find(item => item.id === req.entityId)
      : state.tasks.find(item => item.id === req.entityId);

    if (!activeTarget) {
      throw new PermissionValidationError('Target schedule item no longer exists.', 404);
    }

    const currentVersion = (activeTarget as any).version ?? 1;
    if (typeof req.targetVersion === 'number' && req.targetVersion !== currentVersion) {
      throw new PermissionValidationError('This task has changed since the request was created. The request is stale.', 409);
    }

    if (activeTarget.dayNumber <= calculateDayInfo().dayNumber) {
      throw new PermissionValidationError('This task is no longer editable because its execution window has started.', 409);
    }

    const previousDay = activeTarget.dayNumber;
    const previousDate = activeTarget.date;

    activeTarget.dayNumber = proposedDayNumber;
    activeTarget.date = getDateForDay(proposedDayNumber);
    (activeTarget as any).version = (activeTarget as any).version ? (activeTarget as any).version + 1 : 2;

    req.oldValue = req.oldValue || `Day ${previousDay}`;
    req.proposedValue = req.proposedValue || `Day ${proposedDayNumber}`;
    req.appliedAt = nowIso;
    req.processedAt = nowIso;

    state.auditLogs.unshift({
      id: `audit-schedule-${Date.now()}`,
      actorId: req.requesterId,
      actorName: req.requesterName,
      action: 'APPLY_SCHEDULE_CHANGE',
      targetType: 'FUTURE_SCHEDULE',
      targetId: req.entityId,
      previousState: { dayNumber: previousDay, date: previousDate },
      newState: { dayNumber: proposedDayNumber, date: getDateForDay(proposedDayNumber), version: (activeTarget as any).version },
      reason: req.reason,
      timestamp: nowIso,
    });
    return;
  }

  if (req.actionType === 'TASK_REVERSAL') {
    try {
      await undoTask(getRuntimePool(), req.requesterId, req.entityId);
    } catch (error) {
      if (error instanceof TaskCompletionError) {
        throw new PermissionValidationError(error.message, error.statusCode);
      }
      throw error;
    }
  } else if (req.actionType === 'RETROACTIVE_COMPLETION') {
    let status = state.taskStatuses.find(
      ts => ts.userId === req.requesterId && ts.taskId === req.entityId
    );
    const task = state.tasks.find(t => t.id === req.entityId);

    if (!status) {
      status = {
        taskId: req.entityId,
        userId: req.requesterId,
        status: 'COMPLETED_LATE',
        completedAt: nowIso,
        pointsAwarded: 2,
      };
      state.taskStatuses.push(status);
    } else {
      status.status = 'COMPLETED_LATE';
      status.completedAt = nowIso;
      status.pointsAwarded = 2;
    }

    const userEntries = state.pointLedger.filter(e => e.userId === req.requesterId);
    const currentRunning = userEntries.reduce((sum, e) => sum + e.points, 0);

    state.pointLedger.push({
      id: `ledger-retro-${Date.now()}`,
      userId: req.requesterId,
      date: task?.date || req.createdAt.split('T')[0],
      timestamp: nowIso,
      eventType: 'MUTUAL_APPROVAL_ADJUSTMENT',
      points: 2,
      runningTotal: currentRunning + 2,
      sourceTaskId: req.entityId,
      sourceTaskTitle: req.entityTitle,
      reason: `Retroactive late completion approved by ${req.targetUserName}: ${req.reason}`,
      category: 'ADMIN',
    });
  }
}
