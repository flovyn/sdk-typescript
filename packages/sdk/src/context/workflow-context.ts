/**
 * Workflow context implementation.
 *
 * The workflow context provides deterministic operations for:
 * - Scheduling and awaiting tasks
 * - Starting child workflows
 * - Using durable timers
 * - Creating and awaiting external promises
 * - Managing workflow state
 * - Deterministic randomness and time
 */

import type { NapiWorkflowContextInstance, WorkflowActivationData } from '@flovyn/native';
import { NapiWorkflowContext } from '@flovyn/native';
import type {
  WorkflowContext,
  TaskDefinition,
  WorkflowDefinition,
  TaskOptions,
  ChildWorkflowOptions,
  PromiseOptions,
  TaskHandle,
  WorkflowHandle,
  Logger,
} from '../types';
import { Duration } from '../duration';
import {
  WorkflowSuspended,
  WorkflowCancelled,
  TaskFailed,
  PromiseTimeout,
  PromiseRejected,
  ChildWorkflowFailed,
  DeterminismViolation,
} from '../errors';
import { serialize, deserialize } from '../serde';
import { createWorkflowLogger } from '../workflow';

/**
 * Internal task handle implementation.
 */
class TaskHandleImpl<O> implements TaskHandle<O> {
  private _result: Promise<O> | null = null;

  constructor(
    private readonly ctx: WorkflowContextImpl,
    readonly taskExecutionId: string,
    private readonly getResult: () => O | null,
    private readonly isPending: () => boolean
  ) {}

  result(): Promise<O> {
    if (this._result) {
      return this._result;
    }

    // Check if already completed
    const result = this.getResult();
    if (result !== null) {
      this._result = Promise.resolve(result);
      return this._result;
    }

    // If still pending, throw suspended to wait for completion
    if (this.isPending()) {
      throw new WorkflowSuspended('Waiting for task result', this.ctx.takeCommands());
    }

    // Should not reach here
    throw new Error('Task in unexpected state');
  }
}

/**
 * Internal workflow handle implementation for child workflows.
 */
class ChildWorkflowHandleImpl<O> implements WorkflowHandle<O> {
  private _result: Promise<O> | null = null;

  constructor(
    private readonly ctx: WorkflowContextImpl,
    readonly workflowId: string,
    private readonly getResult: () => O | null,
    private readonly getError: () => string | null,
    private readonly isPending: () => boolean
  ) {}

  result(): Promise<O> {
    if (this._result) {
      return this._result;
    }

    const result = this.getResult();
    if (result !== null) {
      this._result = Promise.resolve(result);
      return this._result;
    }

    const error = this.getError();
    if (error) {
      this._result = Promise.reject(new ChildWorkflowFailed(this.workflowId, error));
      return this._result;
    }

    if (this.isPending()) {
      throw new WorkflowSuspended('Waiting for child workflow result', this.ctx.takeCommands());
    }

    throw new Error('Child workflow in unexpected state');
  }

  async query<T>(_queryName: string, _args?: unknown): Promise<T> {
    // Query is not supported for child workflows in this context
    throw new Error('Query not supported for child workflows scheduled from within a workflow');
  }

  async signal(_signalName: string, _payload?: unknown): Promise<void> {
    // Signal would need to be implemented via commands
    throw new Error('Signal not yet implemented for child workflows');
  }

  async cancel(_reason?: string): Promise<void> {
    // Cancel would need to be implemented via commands
    throw new Error('Cancel not yet implemented for child workflows');
  }
}

/**
 * Workflow context implementation wrapping NapiWorkflowContext.
 */
export class WorkflowContextImpl implements WorkflowContext {
  private readonly nativeCtx: NapiWorkflowContextInstance;
  private readonly _log: Logger;
  private _cancellationRequested: boolean;
  // Sequence counters for generating unique names per workflow type
  private readonly _childWorkflowSeq: Map<string, number> = new Map();

  constructor(activationData: WorkflowActivationData) {
    this.nativeCtx = new NapiWorkflowContext(
      activationData.workflowExecutionId,
      activationData.orgId,
      activationData.timestampMs,
      activationData.randomSeed,
      activationData.replayEvents,
      activationData.stateEntries,
      activationData.cancellationRequested
    );
    this._log = createWorkflowLogger(
      activationData.workflowExecutionId,
      activationData.workflowKind
    );
    this._cancellationRequested = activationData.cancellationRequested;
  }

  /**
   * Get the next sequence number for a child workflow type.
   */
  private _nextChildWorkflowSeq(kind: string): number {
    const current = this._childWorkflowSeq.get(kind) ?? 0;
    this._childWorkflowSeq.set(kind, current + 1);
    return current + 1;
  }

  /**
   * Schedule a task and wait for its result.
   */
  async schedule<I, O>(taskDef: TaskDefinition<I, O>, input: I, options?: TaskOptions): Promise<O> {
    const handle = this.scheduleAsync(taskDef, input, options);
    return handle.result();
  }

  /**
   * Schedule a task by name and wait for its result (untyped).
   */
  async scheduleByName<O = unknown>(
    taskName: string,
    input: unknown,
    options?: TaskOptions
  ): Promise<O> {
    const inputJson = serialize(input);
    const result = this.nativeCtx.scheduleTask(
      taskName,
      inputJson,
      options?.queue,
      options?.timeout?.toMilliseconds()
    );

    const taskExecutionId = result.taskExecutionId ?? '';

    // Check if completed
    if (result.status === 'completed' && result.output) {
      return deserialize<O>(result.output);
    }

    // Check if failed
    if (result.status === 'failed') {
      throw new TaskFailed(
        result.error ?? 'Task failed',
        taskExecutionId,
        result.retryable ?? false
      );
    }

    // Still pending
    if (result.status === 'pending') {
      throw new WorkflowSuspended('Waiting for task result', this.takeCommands());
    }

    throw new Error(`Unexpected task status: ${result.status}`);
  }

  /**
   * Schedule a task for execution and return a handle.
   */
  scheduleAsync<I, O>(
    taskDef: TaskDefinition<I, O>,
    input: I,
    options?: TaskOptions
  ): TaskHandle<O> {
    const inputJson = serialize(input);
    const result = this.nativeCtx.scheduleTask(
      taskDef.name,
      inputJson,
      options?.queue,
      options?.timeout?.toMilliseconds()
    );

    const taskExecutionId = result.taskExecutionId ?? '';

    return new TaskHandleImpl<O>(
      this,
      taskExecutionId,
      () => {
        if (result.status === 'completed' && result.output) {
          return deserialize<O>(result.output);
        }
        if (result.status === 'failed') {
          throw new TaskFailed(
            result.error ?? 'Task failed',
            taskExecutionId,
            result.retryable ?? false
          );
        }
        return null;
      },
      () => result.status === 'pending'
    );
  }

  /**
   * Start a child workflow and wait for its result.
   */
  async scheduleWorkflow<I, O>(
    workflowDef: WorkflowDefinition<I, O>,
    input: I,
    options?: ChildWorkflowOptions
  ): Promise<O> {
    const handle = this.scheduleWorkflowAsync(workflowDef, input, options);
    return handle.result();
  }

  /**
   * Schedule a child workflow and return a handle.
   */
  scheduleWorkflowAsync<I, O>(
    workflowDef: WorkflowDefinition<I, O>,
    input: I,
    options?: ChildWorkflowOptions
  ): WorkflowHandle<O> {
    const inputJson = serialize(input);
    // Generate unique name for this child workflow invocation
    // This is required for per-type sequence matching during replay
    const seq = this._nextChildWorkflowSeq(workflowDef.name);
    const childName = `${workflowDef.name}-${seq}`;
    const result = this.nativeCtx.scheduleChildWorkflow(
      childName,
      workflowDef.name, // kind
      inputJson,
      options?.queue,
      options?.prioritySeconds
    );

    const childExecutionId = result.childExecutionId ?? '';

    return new ChildWorkflowHandleImpl<O>(
      this,
      childExecutionId,
      () => {
        if (result.status === 'completed' && result.output) {
          return deserialize<O>(result.output);
        }
        return null;
      },
      () => result.error ?? null,
      () => result.status === 'pending'
    );
  }

  /**
   * Sleep for a duration (durable timer).
   */
  async sleep(duration: Duration): Promise<void> {
    const result = this.nativeCtx.startTimer(duration.toMilliseconds());

    if (result.status === 'fired') {
      return;
    }

    if (result.status === 'pending') {
      throw new WorkflowSuspended('Waiting for timer', this.takeCommands());
    }

    // Timer cancelled or other status
    throw new WorkflowCancelled('Timer was cancelled');
  }

  /**
   * Sleep until a specific timestamp.
   */
  async sleepUntil(timestamp: Date): Promise<void> {
    const now = this.currentTimeMillis();
    const targetMs = timestamp.getTime();
    const durationMs = Math.max(0, targetMs - now);
    return this.sleep(Duration.milliseconds(durationMs));
  }

  /**
   * Create an external promise that can be resolved from outside.
   */
  async promise<T>(name: string, options?: PromiseOptions): Promise<T> {
    const result = this.nativeCtx.createPromise(name, options?.timeout?.toMilliseconds());

    if (result.status === 'resolved' && result.value) {
      return deserialize<T>(result.value);
    }

    if (result.status === 'rejected') {
      throw new PromiseRejected(result.promiseId, result.error ?? 'Promise rejected');
    }

    if (result.status === 'timed_out') {
      throw new PromiseTimeout(result.promiseId, options?.timeout?.toMilliseconds());
    }

    if (result.status === 'pending') {
      throw new WorkflowSuspended('Waiting for promise', this.takeCommands());
    }

    throw new Error(`Unexpected promise status: ${result.status}`);
  }

  /**
   * Execute a side effect operation (memoized).
   */
  async run<T>(operationName: string, fn: () => T | Promise<T>): Promise<T> {
    const result = this.nativeCtx.runOperation(operationName);

    if (result.status === 'cached' && result.value) {
      return deserialize<T>(result.value);
    }

    if (result.status === 'execute') {
      // Execute the operation
      const value = await fn();
      // Record the result
      this.nativeCtx.recordOperationResult(operationName, serialize(value));
      return value;
    }

    throw new DeterminismViolation(`Unexpected operation status: ${result.status}`);
  }

  /**
   * Get a value from workflow state.
   */
  get<T>(key: string): T | null {
    const value = this.nativeCtx.getState(key);
    if (value === null) {
      return null;
    }
    return deserialize<T>(value);
  }

  /**
   * Set a value in workflow state.
   */
  set<T>(key: string, value: T): void {
    this.nativeCtx.setState(key, serialize(value));
  }

  /**
   * Clear a value from workflow state.
   */
  clear(key: string): void {
    this.nativeCtx.clearState(key);
  }

  /**
   * Clear all workflow state.
   */
  clearAll(): void {
    this.nativeCtx.clearAll();
  }

  /**
   * Get all state keys.
   */
  stateKeys(): string[] {
    return this.nativeCtx.stateKeys();
  }

  /**
   * Get the current workflow time (deterministic).
   */
  currentTime(): Date {
    return new Date(this.currentTimeMillis());
  }

  /**
   * Get the current workflow time in milliseconds (deterministic).
   */
  currentTimeMillis(): number {
    return this.nativeCtx.currentTimeMillis();
  }

  /**
   * Generate a deterministic UUID.
   */
  randomUUID(): string {
    return this.nativeCtx.randomUuid();
  }

  /**
   * Generate a deterministic random number between 0 and 1.
   */
  random(): number {
    return this.nativeCtx.random();
  }

  /**
   * Check if cancellation has been requested and throw if so.
   */
  checkCancellation(): void {
    if (this._cancellationRequested || this.nativeCtx.isCancellationRequested()) {
      throw new WorkflowCancelled('Cancellation requested');
    }
  }

  /**
   * Request cancellation of this workflow.
   */
  requestCancellation(reason?: string): void {
    this._cancellationRequested = true;
    // The actual cancellation is handled by the worker
    this._log.info('Cancellation requested', { reason });
  }

  /**
   * Whether cancellation has been requested.
   */
  get isCancellationRequested(): boolean {
    return this._cancellationRequested || this.nativeCtx.isCancellationRequested();
  }

  /**
   * Logger for this workflow.
   */
  get log(): Logger {
    return this._log;
  }

  /**
   * Get the workflow execution ID.
   */
  get workflowExecutionId(): string {
    return this.nativeCtx.workflowExecutionId;
  }

  /**
   * Get the commands JSON and clear the command buffer.
   */
  takeCommands(): string {
    return this.nativeCtx.takeCommands();
  }

  /**
   * Get the commands JSON without clearing.
   */
  getCommandsJson(): string {
    return this.nativeCtx.getCommandsJson();
  }
}
