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

export async function createPermissionRequest(
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
): Promise<PermissionRequest> {
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

  // Business state is authoritative in PostgreSQL only. Compatibility runtime_state
  // snapshots are refreshed from the database, not mutated during request creation.

  await getRuntimePool().query(
    `INSERT INTO change_requests (id, external_id, requester_participant_id, target_participant_id, target_type, external_target_id, old_value, proposed_value, reason, status, created_at)
     SELECT gen_random_uuid(), $1, requester.id, target.id, $2, $3, $4::jsonb, $5::jsonb, $6, 'PENDING', $7
     FROM participants requester, participants target WHERE requester.legacy_id=$8 AND target.legacy_id=$9`,
    [request.id, request.actionType, request.entityId, JSON.stringify(request.oldValue || null), JSON.stringify(request.proposedValue || null), request.reason, nowIso, requester.id, targetUser.id]
  );
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
      throw new PermissionValidationError('This task has changed since the request was created. The request is stale and cannot be approved.', 409);
    }

    if (target && target.dayNumber <= calculateDayInfo().dayNumber) {
      req.status = 'EXPIRED';
      req.respondedAt = nowIso;
      req.processedAt = nowIso;
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
    } catch (error) {
      if (targetSnapshot && target) {
        for (const key of Object.keys(targetSnapshot) as Array<keyof typeof targetSnapshot>) {
          (target as any)[key] = (targetSnapshot as any)[key];
        }
      }
      for (const key of Object.keys(reqSnapshot) as Array<keyof typeof reqSnapshot>) {
        (req as any)[key] = (reqSnapshot as any)[key];
      }
      throw error;
    }
  } else {
    req.status = 'DECLINED';
    req.respondedAt = nowIso;
    req.processedAt = nowIso;
    const cooldownUntil = new Date(now.getTime() + COOLDOWN_MS).toISOString();
    req.declinedCooldownUntil = cooldownUntil;
  }

  await getRuntimePool().query(
    `UPDATE change_requests SET status=$2, responded_at=$3, applied_at=$4, reason=COALESCE(reason, $5) WHERE external_id=$1`,
    [req.id, req.status, req.respondedAt || null, req.appliedAt || null, responseReason || null]
  );
  return req;
}

async function executeApprovedAction(req: PermissionRequest) {
  const pool = getRuntimePool();
  const nowIso = getISTNow().toISOString();

  if (req.actionType === 'SCHEDULE_CHANGE') {
    const proposedDayMatch = (req.proposedValue || '').match(/(\d+)/);
    const proposedDayNumber = proposedDayMatch ? Number(proposedDayMatch[1]) : null;

    if (!proposedDayNumber) {
      throw new PermissionValidationError('Invalid schedule change proposal.', 400);
    }

    const targetEntityType = req.entityType || 'TASK';
    const targetChallengeDay = await pool.query(
      `SELECT id, curriculum_day_number, calendar_date::text AS date
       FROM challenge_days
       WHERE curriculum_day_number = $1
       ORDER BY calendar_date ASC
       LIMIT 1
       FOR UPDATE`,
      [proposedDayNumber]
    );

    if (!targetChallengeDay.rowCount) {
      throw new PermissionValidationError('Requested day is not available in the challenge schedule.', 404);
    }

    const targetDayId = targetChallengeDay.rows[0].id as string;
    const targetDayDate = targetChallengeDay.rows[0].date as string;
    const targetDayNumber = Number(targetChallengeDay.rows[0].curriculum_day_number);

    if (targetEntityType === 'DSA') {
      const result = await pool.query(
        `UPDATE dsa_problems
         SET challenge_day_id = $1
         WHERE legacy_id = $2
         RETURNING id, legacy_id, challenge_day_id`,
        [targetDayId, req.entityId]
      );

      if (!result.rowCount) {
        throw new PermissionValidationError('Target DSA item no longer exists.', 404);
      }

      await pool.query(
        `INSERT INTO audit_logs (actor_participant_id, action, entity_type, entity_id, reason, created_at)
         VALUES ((SELECT id FROM participants WHERE legacy_id = $1), 'APPLY_SCHEDULE_CHANGE', 'DSA_PROBLEM', $2, $3, $4)`,
        [req.requesterId, result.rows[0].id, req.reason, nowIso]
      );
    } else {
      const result = await pool.query(
        `UPDATE curriculum_tasks
         SET challenge_day_id = $1
         WHERE legacy_id LIKE $2
         RETURNING id, legacy_id, challenge_day_id`,
        [`${targetDayId}`, `${req.entityId}-%`]
      );

      if (!result.rowCount) {
        throw new PermissionValidationError('Target task no longer exists.', 404);
      }

      await pool.query(
        `INSERT INTO audit_logs (actor_participant_id, action, entity_type, entity_id, reason, created_at)
         VALUES ((SELECT id FROM participants WHERE legacy_id = $1), 'APPLY_SCHEDULE_CHANGE', 'CURRICULUM_TASK', $2, $3, $4)`,
        [req.requesterId, result.rows[0].id, req.reason, nowIso]
      );
    }

    req.oldValue = req.oldValue || `Day ${targetDayNumber}`;
    req.proposedValue = req.proposedValue || `Day ${proposedDayNumber}`;
    req.appliedAt = nowIso;
    req.processedAt = nowIso;

    if (req.oldValue.startsWith('Day ')) {
      req.oldValue = req.oldValue.replace(/^Day\s+/, 'Day ');
    }
    if (req.proposedValue.startsWith('Day ')) {
      req.proposedValue = req.proposedValue.replace(/^Day\s+/, 'Day ');
    }

    return;
  }

  if (req.actionType === 'TASK_REVERSAL') {
    try {
      await undoTask(pool, req.requesterId, req.entityId);
    } catch (error) {
      if (error instanceof TaskCompletionError) {
        throw new PermissionValidationError(error.message, error.statusCode);
      }
      throw error;
    }
  } else if (req.actionType === 'RETROACTIVE_COMPLETION') {
    const participant = await pool.query(
      `SELECT id FROM participants WHERE legacy_id = $1 AND status = 'ACTIVE' FOR UPDATE`,
      [req.requesterId]
    );

    if (!participant.rowCount) {
      throw new PermissionValidationError('Authenticated participant is not present in PostgreSQL.', 404);
    }

    const taskRow = await pool.query(
      `SELECT ct.id, ct.challenge_id, ct.challenge_day_id, ct.legacy_id, cd.calendar_date::text AS date
       FROM curriculum_tasks ct
       JOIN challenge_days cd ON cd.id = ct.challenge_day_id
       WHERE ct.legacy_id LIKE $1
       ORDER BY ct.created_at ASC
       LIMIT 1
       FOR UPDATE`,
      [`${req.entityId}-%`]
    );

    if (!taskRow.rowCount) {
      throw new PermissionValidationError('Target task no longer exists in PostgreSQL.', 404);
    }

    const task = taskRow.rows[0];

    await pool.query(
      `INSERT INTO points_ledger
         (participant_id, challenge_id, challenge_day_id, curriculum_task_id, amount, event_type, reason, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, 'MUTUAL_APPROVAL_ADJUSTMENT', $6, $7::jsonb, $8)`,
      [
        participant.rows[0].id,
        task.challenge_id,
        task.challenge_day_id,
        task.id,
        2,
        `Retroactive late completion approved by ${req.targetUserName}: ${req.reason}`,
        JSON.stringify({ sourceTaskId: req.entityId, sourceTaskTitle: req.entityTitle, category: 'ADMIN' }),
        nowIso,
      ]
    );

    await pool.query(
      `INSERT INTO audit_logs (actor_participant_id, action, entity_type, entity_id, reason, created_at)
       VALUES ((SELECT id FROM participants WHERE legacy_id = $1), 'APPLY_RETROACTIVE_COMPLETION', 'CURRICULUM_TASK', $2, $3, $4)`,
      [req.requesterId, task.id, req.reason, nowIso]
    );

    req.appliedAt = nowIso;
    req.processedAt = nowIso;
  }
}
