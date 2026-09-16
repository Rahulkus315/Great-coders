import { getRuntimePool, store } from './store';
import { PermissionRequest, PermissionActionType, AuditLogEntry } from '../src/types';
import { getDateForDay } from './curriculumData';
import { calculateDayInfo, getISTNow } from './timeUtils';
import { TaskCompletionError, undoTask } from './taskCompletionService';
import { createNotification } from './notificationService';

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
  if (existingPending && actionType !== 'RETROACTIVE_COMPLETION') {
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

  const targetEntityType = options?.entityType || 'TASK';
  const pool = getRuntimePool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const lookupEntityId = actionType === 'RETROACTIVE_COMPLETION' ? entityId.split('::')[0] : entityId;
    const requestedSection = actionType === 'RETROACTIVE_COMPLETION' ? entityId.split('::')[1] : undefined;
    const targetEntity = targetEntityType === 'DSA'
    ? await client.query(
      'SELECT id FROM dsa_problems WHERE legacy_id = $1 LIMIT 1',
      [lookupEntityId]
    )
    : targetEntityType === 'STUDY_SCHEDULE'
      ? await client.query(
        'SELECT id FROM todays_live WHERE id = $1 LIMIT 1',
        [entityId]
      )
      : await client.query(
      requestedSection
        ? 'SELECT id FROM curriculum_tasks WHERE legacy_id = $1 LIMIT 1'
        : 'SELECT id FROM curriculum_tasks WHERE legacy_id LIKE $1 ORDER BY created_at ASC LIMIT 1',
      [requestedSection ? `${lookupEntityId}-${requestedSection}` : `${lookupEntityId}-%`]
    );

  if (targetEntity.rowCount !== 1) {
    throw new PermissionValidationError('Target item was not found in PostgreSQL.', 404);
  }
    request.targetRecordId = targetEntity.rows[0].id;
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2 || ':' || $3 || ':' || $4))`,
      [requester.id, targetUser.id, request.actionType, request.targetRecordId],
    );

    const existingForTarget = await client.query(
      `SELECT cr.external_id AS id, cr.status, cr.reason, cr.created_at AS "createdAt",
              cr.responded_at AS "respondedAt", cr.applied_at AS "appliedAt"
       FROM change_requests cr
       WHERE cr.requester_participant_id = (SELECT id FROM participants WHERE legacy_id = $1)
         AND cr.target_participant_id = (SELECT id FROM participants WHERE legacy_id = $2)
         AND cr.target_type = $3
         AND cr.target_id = $4
         AND cr.status IN ('PENDING', 'APPROVED', 'APPLIED')
       ORDER BY cr.created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [requester.id, targetUser.id, request.actionType, targetEntity.rows[0].id],
    );
    if (existingForTarget.rowCount) {
      const existingRow = existingForTarget.rows[0];
      if (actionType !== 'RETROACTIVE_COMPLETION') {
        throw new PermissionValidationError('A request for this target is already pending.', 409);
      }
      if (existingRow.status === 'APPLIED') {
        throw new PermissionValidationError('This task has already been completed.', 409);
      }
      const existingRequest: PermissionRequest = {
        ...request,
        id: existingRow.id,
        targetRecordId: targetEntity.rows[0].id,
        status: existingRow.status,
        reason: existingRow.reason,
        createdAt: existingRow.createdAt,
        respondedAt: existingRow.respondedAt,
        appliedAt: existingRow.appliedAt,
      };
      await client.query('COMMIT');
      return existingRequest;
    }

    const existing = await client.query(
      `SELECT external_id FROM change_requests
       WHERE requester_participant_id = (SELECT id FROM participants WHERE legacy_id = $1)
         AND target_participant_id = (SELECT id FROM participants WHERE legacy_id = $2)
         AND target_type = $3 AND external_target_id = $4 AND status = 'PENDING'
       FOR UPDATE`,
      [requester.id, targetUser.id, request.actionType, request.entityId]
    );
    if (existing.rowCount) {
      throw new PermissionValidationError('A request for this target is already pending.', 409);
    }

    await client.query(
      `INSERT INTO change_requests (id, external_id, requester_participant_id, target_participant_id, target_type, target_id, external_target_id, old_value, proposed_value, reason, status, created_at)
       SELECT gen_random_uuid(), $1, requester.id, target.id, $2, $3, $4, $5::jsonb, $6::jsonb, $7, 'PENDING', $8
       FROM participants requester, participants target WHERE requester.legacy_id=$9 AND target.legacy_id=$10`,
      [request.id, request.actionType, targetEntity.rows[0].id, request.entityId, JSON.stringify(request.oldValue || null), JSON.stringify(request.proposedValue || null), request.reason, nowIso, requester.id, targetUser.id]
    );
    await createNotification(
      client,
      targetUser.id,
      'APPROVAL_REQUEST',
      'Approval request received',
      `${requester.name} requested your approval for ${request.entityTitle}.`,
      { requestId: request.id, actionType: request.actionType, entityId: request.entityId },
    );
    await client.query('COMMIT');
    return request;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function handlePermissionResponse(
  responderId: string,
  requestId: string,
  decision: 'APPROVE' | 'DECLINE',
  responseReason?: string
): Promise<PermissionRequest> {
  const pool = getRuntimePool();
  const stored = await pool.query(
    `SELECT cr.external_id AS id,
            requester.legacy_id AS "requesterId", requester.display_name AS "requesterName",
            target.legacy_id AS "targetUserId", target.display_name AS "targetUserName",
            cr.target_type AS "actionType", cr.external_target_id AS "entityId",
            cr.target_id AS "targetRecordId", cr.reason, cr.status,
            cr.created_at AS "createdAt", cr.responded_at AS "respondedAt",
            cr.applied_at AS "appliedAt", cr.old_value AS "oldValue", cr.proposed_value AS "proposedValue"
     FROM change_requests cr
     JOIN participants requester ON requester.id = cr.requester_participant_id
     JOIN participants target ON target.id = cr.target_participant_id
     WHERE cr.external_id = $1
     LIMIT 1`,
    [requestId]
  );
  const req = stored.rows[0] as PermissionRequest | undefined;
  if (!req) throw new PermissionValidationError('Permission request not found', 404);

  if (req.requesterId === responderId) {
    throw new PermissionValidationError('You cannot approve or decline your own request.', 403);
  }

  if (req.targetUserId !== responderId) {
    throw new PermissionValidationError('You are not authorized to respond to this request.', 403);
  }

  if (req.status !== 'PENDING') {
    throw new PermissionValidationError(`This request has already been ${req.status.toLowerCase()}.`, 409);
  }

  if (req.actionType === 'RESET_ENTRY') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(
        `SELECT cr.external_id AS id, cr.status, cr.requester_participant_id AS "requesterParticipantId",
                cr.target_participant_id AS "targetParticipantId", cr.external_target_id AS "entityId"
         FROM change_requests cr WHERE cr.external_id = $1 FOR UPDATE`,
        [requestId]
      );
      const row = locked.rows[0];
      if (!row || row.status !== 'PENDING') throw new PermissionValidationError('Request is no longer pending.', 409);
      if (row.targetParticipantId !== (await client.query('SELECT id FROM participants WHERE legacy_id = $1', [responderId])).rows[0]?.id) {
        throw new PermissionValidationError('You are not authorized to respond to this request.', 403);
      }

      const nowIso = getISTNow().toISOString();
      if (decision === 'APPROVE') {
        const unlocked = await client.query(
          `UPDATE todays_live SET status = 'OPEN', focused_execution_finalized = false,
             focused_execution_finalized_at = NULL, version = version + 1, updated_at = $2
           WHERE id = $1 AND participant_id = (SELECT requester_participant_id FROM change_requests WHERE external_id = $3)
           RETURNING id`,
          [row.entityId, nowIso, requestId]
        );
        if (!unlocked.rowCount) throw new PermissionValidationError('The requested daily entry is no longer available.', 404);
      }

      const nextStatus = decision === 'APPROVE' ? 'APPROVED' : 'DECLINED';
      const updated = await client.query(
        `UPDATE change_requests SET status = $2, responded_at = $3, applied_at = CASE WHEN $2 = 'APPROVED' THEN $3 ELSE applied_at END,
           reason = CASE WHEN $4::text IS NULL OR $4::text = '' THEN reason ELSE reason || E'\nResponse: ' || $4 END
         WHERE external_id = $1 AND status = 'PENDING' RETURNING external_id AS id, status, responded_at AS "respondedAt", applied_at AS "appliedAt"`,
        [requestId, nextStatus, nowIso, responseReason || null]
      );
      if (updated.rowCount !== 1) throw new PermissionValidationError('Request is no longer pending.', 409);
      await createNotification(
        client,
        req.requesterId,
        'APPROVAL_RESPONSE',
        decision === 'APPROVE' ? 'Approval granted' : 'Approval request declined',
        `${req.targetUserName} ${decision === 'APPROVE' ? 'approved' : 'declined'} your request for ${req.entityId}.`,
        { requestId, decision, actionType: req.actionType, entityId: req.entityId },
      );
      await client.query('COMMIT');
      return { ...req, status: nextStatus, respondedAt: nowIso, appliedAt: decision === 'APPROVE' ? nowIso : undefined };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const state = store.getState();
  const stateRequest = state.permissions.find(p => p.id === requestId);
  const effectiveRequest = stateRequest ? { ...req, ...stateRequest } : req;

  const responder = state.users.find(u => u.id === responderId);
  const now = getISTNow();
  const nowIso = now.toISOString();

  if (decision === 'APPROVE') {
    const target = effectiveRequest.actionType === 'SCHEDULE_CHANGE' ? getScheduleTargetEntity(effectiveRequest) : null;
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

    const reqSnapshot = { ...effectiveRequest };
    const targetSnapshot = target ? { ...target } : null;

    effectiveRequest.status = 'APPROVED';
    effectiveRequest.respondedAt = nowIso;
    effectiveRequest.processedAt = nowIso;

    try {
      await executeApprovedAction(effectiveRequest);
      effectiveRequest.appliedAt = effectiveRequest.appliedAt || nowIso;
    } catch (error) {
      if (targetSnapshot && target) {
        for (const key of Object.keys(targetSnapshot) as Array<keyof typeof targetSnapshot>) {
          (target as any)[key] = (targetSnapshot as any)[key];
        }
      }
      for (const key of Object.keys(reqSnapshot) as Array<keyof typeof reqSnapshot>) {
        (effectiveRequest as any)[key] = (reqSnapshot as any)[key];
      }
      throw error;
    }
  } else {
    effectiveRequest.status = 'DECLINED';
    effectiveRequest.respondedAt = nowIso;
    effectiveRequest.processedAt = nowIso;
    const cooldownUntil = new Date(now.getTime() + COOLDOWN_MS).toISOString();
    effectiveRequest.declinedCooldownUntil = cooldownUntil;
  }

  await getRuntimePool().query(
    `UPDATE change_requests SET status=$2, responded_at=$3, applied_at=$4,
       external_target_id = CASE WHEN $6 = 'RETROACTIVE_COMPLETION' THEN $7 ELSE external_target_id END,
       reason = CASE WHEN $5::text IS NULL OR $5::text = '' THEN reason ELSE reason || E'\nResponse: ' || $5 END
     WHERE external_id=$1 AND status='PENDING'`,
    [effectiveRequest.id, effectiveRequest.status, effectiveRequest.respondedAt || null, effectiveRequest.appliedAt || null, responseReason || null, effectiveRequest.actionType, effectiveRequest.entityId]
  );
  await createNotification(
    getRuntimePool(),
    effectiveRequest.requesterId,
    'APPROVAL_RESPONSE',
    effectiveRequest.status === 'APPROVED' ? 'Approval granted' : 'Approval request declined',
    `${effectiveRequest.targetUserName} ${effectiveRequest.status === 'APPROVED' ? 'approved' : 'declined'} your request for ${effectiveRequest.entityId}.`,
    { requestId: effectiveRequest.id, decision, actionType: effectiveRequest.actionType, entityId: effectiveRequest.entityId },
  );
  return effectiveRequest;
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

  if (req.actionType === 'RESET_ENTRY') {
    const result = await pool.query(
      `UPDATE todays_live
       SET status = 'OPEN', focused_execution_finalized = false,
           focused_execution_finalized_at = NULL, version = version + 1, updated_at = $2
       WHERE id = $1 AND participant_id = (SELECT id FROM participants WHERE legacy_id = $3)
       RETURNING id`,
      [req.entityId, nowIso, req.requesterId]
    );
    if (!result.rowCount) {
      throw new PermissionValidationError('The requested daily entry is no longer available.', 404);
    }
    req.appliedAt = nowIso;
    req.processedAt = nowIso;
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
    let [taskId, section] = req.entityId.split('::');
    const validSections = ['DSA', 'JAVA', 'OS', 'DBMS'];

    // Older day-level requests did not include a subject. Recover the subject
    // from the curriculum row they were created against before applying them.
    if (taskId && !section && req.targetRecordId) {
      const target = await pool.query(
        `SELECT ct.legacy_id, s.code AS section
         FROM curriculum_tasks ct
         JOIN subjects s ON s.id = ct.subject_id
         WHERE ct.id = $1
         LIMIT 1`,
        [req.targetRecordId],
      );
      const targetRow = target.rows[0];
      if (targetRow) {
        taskId = String(targetRow.legacy_id).replace(/-(DSA|JAVA|OS|DBMS)$/, '');
        section = targetRow.section;
        req.entityId = `${taskId}::${section}`;
      }
    }

    if (!taskId || !validSections.includes(section)) {
      throw new PermissionValidationError('This late-completion request is not tied to a valid subject.', 400);
    }
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
      WHERE ct.id = $1
        AND ct.legacy_id = $2
       FOR UPDATE`,
      [req.targetRecordId, `${taskId}-${section}`]
    );

    if (!taskRow.rowCount) {
      throw new PermissionValidationError('Target task no longer exists in PostgreSQL.', 404);
    }

    const task = taskRow.rows[0];

    await pool.query(
      `INSERT INTO audit_logs (actor_participant_id, action, entity_type, entity_id, reason, created_at)
       VALUES ((SELECT id FROM participants WHERE legacy_id = $1), 'APPLY_RETROACTIVE_COMPLETION', 'CURRICULUM_TASK', $2, $3, $4)`,
      [req.requesterId, task.id, `${section} late-completion permission approved`, nowIso]
    );

    req.appliedAt = nowIso;
    req.processedAt = nowIso;
  }
}
