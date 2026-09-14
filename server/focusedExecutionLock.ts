export interface FinalizeFocusedExecutionResult {
  ok: boolean;
  code: number;
  message?: string;
  finalizedMinutes?: number;
  finalizedAt?: string;
}

export function finalizeFocusedExecution(
  journal: any,
  candidateMinutes: number | string | undefined,
  finalizedAt: string,
): FinalizeFocusedExecutionResult {
  if (candidateMinutes === null || candidateMinutes === undefined || candidateMinutes === '') {
    return {
      ok: false,
      code: 400,
      message: 'Focused Execution Hours must be a valid non-negative number of minutes.',
    };
  }

  const normalized = typeof candidateMinutes === 'string'
    ? Number(candidateMinutes.trim())
    : Number(candidateMinutes);

  if (!Number.isFinite(normalized) || normalized < 0) {
    return {
      ok: false,
      code: 400,
      message: 'Focused Execution Hours must be a valid non-negative number of minutes.',
    };
  }

  if (journal?.focusedExecutionFinalized || journal?.focusedExecutionFinalizedAt || journal?.focusedExecutionMinutes !== undefined) {
    return {
      ok: false,
      code: 409,
      message: 'Focused Execution Hours have already been permanently recorded for this day. They cannot be changed.',
    };
  }

  journal.focusedExecutionMinutes = normalized;
  journal.focusedExecutionFinalized = true;
  journal.focusedExecutionFinalizedAt = finalizedAt;

  return {
    ok: true,
    code: 200,
    message: 'Focused execution permanently recorded.',
    finalizedMinutes: normalized,
    finalizedAt,
  };
}
