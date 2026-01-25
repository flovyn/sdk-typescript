/**
 * Type definitions for the Flovyn SDK.
 */

import { Duration } from './duration';

/**
 * Workflow definition returned by the workflow() factory.
 */
export interface WorkflowDefinition<I = unknown, O = unknown> {
  /** Unique name identifying this workflow type. */
  readonly name: string;
  /** Optional description of what this workflow does. */
  readonly description?: string;
  /** Optional version string. */
  readonly version?: string;
  /** The workflow execution function. */
  readonly run: (ctx: WorkflowContext, input: I) => Promise<O>;
  /** Optional signal handlers. */
  readonly handlers?: WorkflowHandlers<I, O>;
}

/**
 * Task definition returned by the task() factory.
 */
export interface TaskDefinition<I = unknown, O = unknown> {
  /** Unique name identifying this task type. */
  readonly name: string;
  /** Optional description of what this task does. */
  readonly description?: string;
  /** The task execution function. */
  readonly run: (ctx: TaskContext, input: I) => Promise<O>;
  /** Optional lifecycle hooks. */
  readonly hooks?: TaskHooks<I, O>;
}

/**
 * Signal and query handlers for a workflow.
 */
export interface WorkflowHandlers<_I = unknown, _O = unknown> {
  /** Signal handlers keyed by signal name. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signals?: Record<string, (ctx: WorkflowContext, payload: any) => void>;
  /** Query handlers keyed by query name. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queries?: Record<string, (ctx: WorkflowContext, args: any) => any>;
}

/**
 * Lifecycle hooks for a task.
 */
export interface TaskHooks<I = unknown, O = unknown> {
  /** Called before task execution starts. */
  onStart?: (ctx: TaskContext, input: I) => void | Promise<void>;
  /** Called after successful task completion. */
  onSuccess?: (ctx: TaskContext, input: I, output: O) => void | Promise<void>;
  /** Called after task failure. */
  onFailure?: (ctx: TaskContext, input: I, error: Error) => void | Promise<void>;
}

/**
 * Workflow context available during workflow execution.
 *
 * All operations on this context are replay-safe and deterministic.
 */
export interface WorkflowContext {
  /** Execute a task and wait for its result. */
  task<I, O>(taskDef: TaskDefinition<I, O>, input: I, options?: TaskOptions): Promise<O>;

  /** Execute a task by name and wait for its result (untyped). */
  taskByName<O = unknown>(taskName: string, input: unknown, options?: TaskOptions): Promise<O>;

  /** Schedule a task for execution and return a handle. */
  scheduleTask<I, O>(
    taskDef: TaskDefinition<I, O>,
    input: I,
    options?: TaskOptions
  ): TaskHandle<O>;

  /** Start a child workflow and wait for its result. */
  workflow<I, O>(
    workflowDef: WorkflowDefinition<I, O>,
    input: I,
    options?: ChildWorkflowOptions
  ): Promise<O>;

  /** Schedule a child workflow and return a handle. */
  scheduleWorkflow<I, O>(
    workflowDef: WorkflowDefinition<I, O>,
    input: I,
    options?: ChildWorkflowOptions
  ): WorkflowHandle<O>;

  /** Sleep for a duration (durable timer). */
  sleep(duration: Duration): Promise<void>;

  /** Sleep until a specific timestamp. */
  sleepUntil(timestamp: Date): Promise<void>;

  /** Create an external promise that can be resolved from outside. */
  promise<T>(name: string, options?: PromiseOptions): Promise<T>;

  /** Execute a side effect operation (memoized). */
  run<T>(operationName: string, fn: () => T | Promise<T>): Promise<T>;

  /** Get a value from workflow state. */
  getState<T>(key: string): T | null;

  /** Set a value in workflow state. */
  setState<T>(key: string, value: T): void;

  /** Clear a value from workflow state. */
  clearState(key: string): void;

  /** Get the current workflow time (deterministic). */
  currentTime(): Date;

  /** Get the current workflow time in milliseconds (deterministic). */
  currentTimeMillis(): number;

  /** Generate a deterministic UUID. */
  randomUUID(): string;

  /** Generate a deterministic random number between 0 and 1. */
  random(): number;

  /** Check if cancellation has been requested. */
  checkCancellation(): void;

  /** Request cancellation of this workflow. */
  requestCancellation(reason?: string): void;

  /** Whether cancellation has been requested. */
  readonly isCancellationRequested: boolean;

  /** Logger for this workflow. */
  readonly log: Logger;
}

/**
 * Task context available during task execution.
 */
export interface TaskContext {
  /** Report progress (0.0 to 1.0). */
  reportProgress(progress: number): void;

  /** Send a heartbeat to keep the task alive. */
  heartbeat(): void;

  /** Check if the task has been cancelled. */
  checkCancellation(): void;

  /** Get a cancellation error to throw. */
  cancellationError(): Error;

  /** Stream a token (for LLM-style streaming). */
  streamToken(token: string): void;

  /** Stream progress update. */
  streamProgress(progress: number): void;

  /** Stream arbitrary data. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  streamData(data: any): void;

  /** Stream an error (non-fatal). */
  streamError(error: string): void;

  /** Whether the task has been cancelled. */
  readonly isCancelled: boolean;

  /** The task execution ID. */
  readonly taskExecutionId: string;

  /** The task kind/type. */
  readonly taskKind: string;

  /** Current execution attempt (1-based). */
  readonly attempt: number;

  /** Logger for this task. */
  readonly log: Logger;
}

/**
 * Options for task execution.
 */
export interface TaskOptions {
  /** Queue to run the task on. */
  queue?: string;
  /** Timeout for task execution. */
  timeout?: Duration;
  /** Retry policy for failed tasks. */
  retry?: RetryPolicy;
}

/**
 * Options for child workflow execution.
 */
export interface ChildWorkflowOptions {
  /** Queue to run the workflow on. */
  queue?: string;
  /** Priority in seconds. */
  prioritySeconds?: number;
}

/**
 * Options for external promises.
 */
export interface PromiseOptions {
  /** Timeout for the promise. */
  timeout?: Duration;
  /** Idempotency key for the promise. */
  idempotencyKey?: string;
}

/**
 * Retry policy for tasks.
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts. */
  maxRetries?: number;
  /** Initial delay between retries. */
  initialDelay?: Duration;
  /** Maximum delay between retries. */
  maxDelay?: Duration;
  /** Backoff multiplier (e.g., 2 for exponential). */
  backoffMultiplier?: number;
}

/**
 * Handle to a running task.
 */
export interface TaskHandle<O> {
  /** Wait for the task result. */
  result(): Promise<O>;
  /** The task execution ID. */
  readonly taskExecutionId: string;
}

/**
 * Handle to a running workflow.
 */
export interface WorkflowHandle<O> {
  /** Wait for the workflow result. */
  result(): Promise<O>;
  /** Query the workflow state. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<T = any>(queryName: string, args?: any): Promise<T>;
  /** Send a signal to the workflow. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signal(signalName: string, payload?: any): Promise<void>;
  /** Cancel the workflow. */
  cancel(reason?: string): Promise<void>;
  /** The workflow execution ID. */
  readonly workflowId: string;
}

/**
 * Hook for workflow lifecycle events.
 */
export interface WorkflowHook {
  /** Called when a workflow starts. */
  onStarted?: (workflowId: string, workflowKind: string) => void;
  /** Called when a workflow completes successfully. */
  onCompleted?: (workflowId: string, workflowKind: string) => void;
  /** Called when a workflow fails. */
  onFailed?: (workflowId: string, workflowKind: string, error: Error) => void;
}

/**
 * Simple logger interface.
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
