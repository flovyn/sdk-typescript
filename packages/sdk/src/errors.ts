/**
 * Error types for the Flovyn SDK.
 *
 * These errors represent various failure conditions that can occur
 * during workflow and task execution.
 */

/**
 * Base error class for all Flovyn SDK errors.
 */
export class FlovynError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'FlovynError';

    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when a workflow is suspended (internal control flow).
 * This error is used internally for replay control and should not
 * be caught by user code.
 */
export class WorkflowSuspended extends FlovynError {
  constructor(
    message: string = 'Workflow suspended',
    public readonly commands: string
  ) {
    super(message);
    this.name = 'WorkflowSuspended';
  }
}

/**
 * Thrown when a workflow is cancelled.
 */
export class WorkflowCancelled extends FlovynError {
  constructor(
    message: string = 'Workflow was cancelled',
    public readonly reason?: string
  ) {
    super(message);
    this.name = 'WorkflowCancelled';
  }
}

/**
 * Thrown when a workflow fails.
 */
export class WorkflowFailed extends FlovynError {
  constructor(
    public readonly workflowId: string,
    message: string,
    cause?: Error
  ) {
    super(`Workflow ${workflowId} failed: ${message}`, cause);
    this.name = 'WorkflowFailed';
  }
}

/**
 * Thrown when a workflow violates determinism requirements.
 *
 * This typically occurs when:
 * - Using non-deterministic APIs (Date.now, Math.random) instead of context methods
 * - Executing operations in a different order during replay
 * - Using conditional logic based on external state
 */
export class DeterminismViolation extends FlovynError {
  constructor(
    message: string,
    public readonly details?: string
  ) {
    super(`Determinism violation: ${message}`);
    this.name = 'DeterminismViolation';
  }
}

/**
 * Thrown when a task fails.
 */
export class TaskFailed extends FlovynError {
  constructor(
    message: string,
    public readonly taskExecutionId: string,
    public readonly retryable: boolean = true,
    cause?: Error
  ) {
    super(message, cause);
    this.name = 'TaskFailed';
  }
}

/**
 * Thrown when a task is cancelled.
 */
export class TaskCancelled extends FlovynError {
  constructor(
    public readonly taskExecutionId: string,
    message: string = 'Task cancelled'
  ) {
    super(message);
    this.name = 'TaskCancelled';
  }
}

/**
 * Thrown when a task times out.
 */
export class TaskTimeout extends FlovynError {
  constructor(
    public readonly taskExecutionId: string,
    public readonly timeoutMs: number
  ) {
    super(`Task ${taskExecutionId} timed out after ${timeoutMs}ms`);
    this.name = 'TaskTimeout';
  }
}

/**
 * Thrown when a promise times out.
 */
export class PromiseTimeout extends FlovynError {
  constructor(
    public readonly promiseId: string,
    public readonly timeoutMs?: number
  ) {
    const msg = timeoutMs
      ? `Promise ${promiseId} timed out after ${timeoutMs}ms`
      : `Promise ${promiseId} timed out`;
    super(msg);
    this.name = 'PromiseTimeout';
  }
}

/**
 * Thrown when a promise is rejected.
 */
export class PromiseRejected extends FlovynError {
  constructor(
    public readonly promiseId: string,
    public readonly reason: string
  ) {
    super(`Promise ${promiseId} rejected: ${reason}`);
    this.name = 'PromiseRejected';
  }
}

/**
 * Thrown when a child workflow fails.
 */
export class ChildWorkflowFailed extends FlovynError {
  constructor(
    public readonly childExecutionId: string,
    message: string,
    cause?: Error
  ) {
    super(`Child workflow ${childExecutionId} failed: ${message}`, cause);
    this.name = 'ChildWorkflowFailed';
  }
}

/**
 * Thrown when there's a connection error to the Flovyn server.
 */
export class ConnectionError extends FlovynError {
  constructor(
    message: string,
    public readonly serverUrl: string,
    cause?: Error
  ) {
    super(message, cause);
    this.name = 'ConnectionError';
  }
}

/**
 * Thrown when there's an authentication error.
 */
export class AuthenticationError extends FlovynError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'AuthenticationError';
  }
}

/**
 * Thrown when a workflow or task is not found.
 */
export class NotFoundError extends FlovynError {
  constructor(
    public readonly resourceType: 'workflow' | 'task' | 'promise',
    public readonly resourceId: string
  ) {
    super(`${resourceType} not found: ${resourceId}`);
    this.name = 'NotFoundError';
  }
}

/**
 * Thrown when there's a configuration error.
 */
export class ConfigurationError extends FlovynError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
