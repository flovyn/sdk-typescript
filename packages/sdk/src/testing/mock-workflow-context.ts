/**
 * Mock workflow context for unit testing workflows.
 *
 * @example
 * ```typescript
 * import { MockWorkflowContext } from '@flovyn/sdk/testing';
 *
 * const ctx = new MockWorkflowContext();
 * ctx.mockTaskResult(myTask, { result: 'mocked' });
 *
 * const result = await myWorkflow.run(ctx, input);
 * expect(result).toEqual({ ... });
 * ```
 */

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

/**
 * Tracked task execution.
 */
export interface TrackedTask {
  taskName: string;
  input: unknown;
  options?: TaskOptions | undefined;
  result: unknown;
}

/**
 * Tracked timer.
 */
export interface TrackedTimer {
  duration: Duration;
  firedAt: Date;
}

/**
 * Tracked promise.
 */
export interface TrackedPromise {
  name: string;
  options?: PromiseOptions | undefined;
  resolved: boolean;
  value?: unknown;
  error?: string | undefined;
}

/**
 * Tracked child workflow.
 */
export interface TrackedChildWorkflow {
  workflowName: string;
  input: unknown;
  options?: ChildWorkflowOptions | undefined;
  result: unknown;
}

/**
 * Tracked operation.
 */
export interface TrackedOperation {
  name: string;
  result: unknown;
}

/**
 * Mock workflow context for unit testing.
 */
export class MockWorkflowContext implements WorkflowContext {
  private _currentTime: Date;
  private _randomSeed: number = 0;
  private _state: Map<string, unknown> = new Map();
  private _cancellationRequested: boolean = false;

  // Mocked results
  private _taskResults: Map<string, unknown[]> = new Map();
  private _promiseResolutions: Map<string, { value?: unknown; error?: string }> = new Map();
  private _childWorkflowResults: Map<string, unknown[]> = new Map();
  private _operationResults: Map<string, unknown> = new Map();

  // Tracking
  readonly executedTasks: TrackedTask[] = [];
  readonly startedTimers: TrackedTimer[] = [];
  readonly createdPromises: TrackedPromise[] = [];
  readonly startedChildWorkflows: TrackedChildWorkflow[] = [];
  readonly executedOperations: TrackedOperation[] = [];

  readonly log: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  constructor(options?: { currentTime?: Date; randomSeed?: number }) {
    this._currentTime = options?.currentTime ?? new Date();
    this._randomSeed = options?.randomSeed ?? 12345;
  }

  /**
   * Mock the result for a task.
   * Call multiple times to queue multiple results for the same task.
   */
  mockTaskResult<I, O>(taskDef: TaskDefinition<I, O>, result: O): void {
    const existing = this._taskResults.get(taskDef.name) ?? [];
    existing.push(result);
    this._taskResults.set(taskDef.name, existing);
  }

  /**
   * Mock the resolution of a promise.
   */
  mockPromiseResolution<T>(name: string, value: T): void {
    this._promiseResolutions.set(name, { value });
  }

  /**
   * Mock the rejection of a promise.
   */
  mockPromiseRejection(name: string, error: string): void {
    this._promiseResolutions.set(name, { error });
  }

  /**
   * Mock the result for a child workflow.
   */
  mockChildWorkflowResult<I, O>(workflowDef: WorkflowDefinition<I, O>, result: O): void {
    const existing = this._childWorkflowResults.get(workflowDef.name) ?? [];
    existing.push(result);
    this._childWorkflowResults.set(workflowDef.name, existing);
  }

  /**
   * Mock the result for an operation.
   */
  mockOperationResult<T>(name: string, result: T): void {
    this._operationResults.set(name, result);
  }

  /**
   * Advance the mock time.
   */
  advanceTime(duration: Duration): void {
    this._currentTime = new Date(this._currentTime.getTime() + duration.toMilliseconds());
  }

  /**
   * Request cancellation.
   */
  requestCancellation(_reason?: string): void {
    this._cancellationRequested = true;
  }

  // WorkflowContext implementation

  async schedule<I, O>(taskDef: TaskDefinition<I, O>, input: I, options?: TaskOptions): Promise<O> {
    const results = this._taskResults.get(taskDef.name);
    if (!results || results.length === 0) {
      throw new Error(`No mocked result for task "${taskDef.name}". Call mockTaskResult() first.`);
    }

    const result = results.shift() as O;
    this.executedTasks.push({ taskName: taskDef.name, input, options, result });
    return result;
  }

  async scheduleByName<O = unknown>(
    taskName: string,
    input: unknown,
    options?: TaskOptions
  ): Promise<O> {
    const results = this._taskResults.get(taskName);
    if (!results || results.length === 0) {
      throw new Error(
        `No mocked result for task "${taskName}". Call mockTaskResultByName() first.`
      );
    }

    const result = results.shift() as O;
    this.executedTasks.push({ taskName, input, options, result });
    return result;
  }

  /**
   * Mock the result for a task by name (for untyped task execution).
   */
  mockTaskResultByName<O>(taskName: string, result: O): void {
    const existing = this._taskResults.get(taskName) ?? [];
    existing.push(result);
    this._taskResults.set(taskName, existing);
  }

  scheduleAsync<I, O>(
    taskDef: TaskDefinition<I, O>,
    input: I,
    options?: TaskOptions
  ): TaskHandle<O> {
    const results = this._taskResults.get(taskDef.name);
    if (!results || results.length === 0) {
      throw new Error(`No mocked result for task "${taskDef.name}". Call mockTaskResult() first.`);
    }

    const result = results.shift() as O;
    this.executedTasks.push({ taskName: taskDef.name, input, options, result });

    return {
      taskExecutionId: `mock-task-${Date.now()}`,
      result: () => Promise.resolve(result),
    };
  }

  async scheduleWorkflow<I, O>(
    workflowDef: WorkflowDefinition<I, O>,
    input: I,
    options?: ChildWorkflowOptions
  ): Promise<O> {
    const results = this._childWorkflowResults.get(workflowDef.name);
    if (!results || results.length === 0) {
      throw new Error(
        `No mocked result for child workflow "${workflowDef.name}". Call mockChildWorkflowResult() first.`
      );
    }

    const result = results.shift() as O;
    this.startedChildWorkflows.push({ workflowName: workflowDef.name, input, options, result });
    return result;
  }

  scheduleWorkflowAsync<I, O>(
    workflowDef: WorkflowDefinition<I, O>,
    input: I,
    options?: ChildWorkflowOptions
  ): WorkflowHandle<O> {
    const results = this._childWorkflowResults.get(workflowDef.name);
    if (!results || results.length === 0) {
      throw new Error(
        `No mocked result for child workflow "${workflowDef.name}". Call mockChildWorkflowResult() first.`
      );
    }

    const result = results.shift() as O;
    this.startedChildWorkflows.push({ workflowName: workflowDef.name, input, options, result });

    return {
      workflowId: `mock-workflow-${Date.now()}`,
      result: () => Promise.resolve(result),
      query: () => Promise.reject(new Error('Query not supported in mock')),
      signal: () => Promise.reject(new Error('Signal not supported in mock')),
      cancel: () => Promise.reject(new Error('Cancel not supported in mock')),
    };
  }

  async sleep(duration: Duration): Promise<void> {
    const firedAt = new Date(this._currentTime.getTime() + duration.toMilliseconds());
    this.startedTimers.push({ duration, firedAt });
    this._currentTime = firedAt;
  }

  async sleepUntil(timestamp: Date): Promise<void> {
    const durationMs = Math.max(0, timestamp.getTime() - this._currentTime.getTime());
    await this.sleep(Duration.milliseconds(durationMs));
  }

  async promise<T>(name: string, options?: PromiseOptions): Promise<T> {
    const resolution = this._promiseResolutions.get(name);
    if (!resolution) {
      throw new Error(
        `No mocked resolution for promise "${name}". Call mockPromiseResolution() first.`
      );
    }

    this.createdPromises.push({
      name,
      options,
      resolved: resolution.error === undefined,
      value: resolution.value,
      error: resolution.error,
    });

    if (resolution.error) {
      throw new Error(resolution.error);
    }

    return resolution.value as T;
  }

  async run<T>(operationName: string, fn: () => T | Promise<T>): Promise<T> {
    // Check for mocked result first
    if (this._operationResults.has(operationName)) {
      const result = this._operationResults.get(operationName) as T;
      this.executedOperations.push({ name: operationName, result });
      return result;
    }

    // Execute the function
    const result = await fn();
    this.executedOperations.push({ name: operationName, result });
    return result;
  }

  get<T>(key: string): T | null {
    return (this._state.get(key) as T) ?? null;
  }

  set<T>(key: string, value: T): void {
    this._state.set(key, value);
  }

  clear(key: string): void {
    this._state.delete(key);
  }

  clearAll(): void {
    this._state.clear();
  }

  stateKeys(): string[] {
    return Array.from(this._state.keys());
  }

  currentTime(): Date {
    return new Date(this._currentTime);
  }

  currentTimeMillis(): number {
    return this._currentTime.getTime();
  }

  randomUUID(): string {
    this._randomSeed = (this._randomSeed * 1103515245 + 12345) & 0x7fffffff;
    const hex = this._randomSeed.toString(16).padStart(8, '0');
    return `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-8${hex.slice(1, 4)}-${hex.slice(0, 12).padEnd(12, '0')}`;
  }

  random(): number {
    this._randomSeed = (this._randomSeed * 1103515245 + 12345) & 0x7fffffff;
    return this._randomSeed / 0x7fffffff;
  }

  checkCancellation(): void {
    if (this._cancellationRequested) {
      throw new Error('Workflow cancelled');
    }
  }

  get isCancellationRequested(): boolean {
    return this._cancellationRequested;
  }
}
