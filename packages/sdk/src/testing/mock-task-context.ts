/**
 * Mock task context for unit testing tasks.
 *
 * @example
 * ```typescript
 * import { MockTaskContext } from '@flovyn/sdk/testing';
 *
 * const ctx = new MockTaskContext();
 * const result = await myTask.run(ctx, input);
 *
 * expect(ctx.progressUpdates).toContain(0.5);
 * expect(ctx.heartbeatCount).toBeGreaterThan(0);
 * ```
 */

import type { TaskContext, Logger } from '../types';

/**
 * Tracked stream event.
 */
export interface TrackedStreamEvent {
  type: 'token' | 'progress' | 'data' | 'error';
  value: unknown;
  timestamp: number;
}

/**
 * Mock task context for unit testing.
 */
export class MockTaskContext implements TaskContext {
  private _cancelled: boolean = false;
  private _progress: number = 0;

  // Tracking
  readonly progressUpdates: number[] = [];
  readonly heartbeats: number[] = [];
  readonly streamEvents: TrackedStreamEvent[] = [];

  readonly log: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  constructor(
    readonly taskExecutionId: string = 'mock-task-123',
    readonly taskKind: string = 'mock-task',
    readonly attempt: number = 1
  ) {}

  /**
   * Mark the task as cancelled.
   */
  markCancelled(): void {
    this._cancelled = true;
  }

  /**
   * Get the number of heartbeats sent.
   */
  get heartbeatCount(): number {
    return this.heartbeats.length;
  }

  /**
   * Get the current progress value.
   */
  get progress(): number {
    return this._progress;
  }

  /**
   * Get streamed tokens.
   */
  get streamedTokens(): string[] {
    return this.streamEvents.filter((e) => e.type === 'token').map((e) => e.value as string);
  }

  /**
   * Get streamed progress values.
   */
  get streamedProgress(): number[] {
    return this.streamEvents.filter((e) => e.type === 'progress').map((e) => e.value as number);
  }

  /**
   * Get streamed data.
   */
  get streamedData(): unknown[] {
    return this.streamEvents.filter((e) => e.type === 'data').map((e) => e.value);
  }

  /**
   * Get streamed errors.
   */
  get streamedErrors(): string[] {
    return this.streamEvents.filter((e) => e.type === 'error').map((e) => e.value as string);
  }

  // TaskContext implementation

  reportProgress(progress: number): void {
    if (progress < 0 || progress > 1) {
      throw new Error('Progress must be between 0 and 1');
    }
    this._progress = progress;
    this.progressUpdates.push(progress);
  }

  heartbeat(): void {
    this.heartbeats.push(Date.now());
  }

  checkCancellation(): void {
    if (this._cancelled) {
      throw this.cancellationError();
    }
  }

  cancellationError(): Error {
    return new Error(`Task ${this.taskExecutionId} was cancelled`);
  }

  streamToken(token: string): void {
    this.streamEvents.push({
      type: 'token',
      value: token,
      timestamp: Date.now(),
    });
  }

  streamProgress(progress: number): void {
    this.streamEvents.push({
      type: 'progress',
      value: progress,
      timestamp: Date.now(),
    });
  }

  streamData(data: unknown): void {
    this.streamEvents.push({
      type: 'data',
      value: data,
      timestamp: Date.now(),
    });
  }

  streamError(error: string): void {
    this.streamEvents.push({
      type: 'error',
      value: error,
      timestamp: Date.now(),
    });
  }

  get isCancelled(): boolean {
    return this._cancelled;
  }
}
