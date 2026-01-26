/**
 * Task context implementation.
 *
 * The task context provides APIs for:
 * - Progress reporting
 * - Heartbeat for long-running tasks
 * - Cancellation checking
 * - Streaming (tokens, progress, data, errors)
 */

import type { TaskActivationData } from '@flovyn/native';
import type { TaskContext, Logger, StreamEvent as PublicStreamEvent } from '../types';
import { TaskCancelled } from '../errors';
import { createTaskLogger } from '../task';

/**
 * Internal stream event for storage.
 */
export interface InternalStreamEvent {
  type: 'token' | 'progress' | 'data' | 'error';
  data: unknown;
  timestamp: number;
}

/**
 * Task context implementation.
 */
export class TaskContextImpl implements TaskContext {
  private readonly _log: Logger;
  private _cancelled: boolean = false;
  private _progress: number = 0;
  private _lastHeartbeat: number;
  private readonly _streamEvents: InternalStreamEvent[] = [];

  constructor(
    private readonly activationData: TaskActivationData,
    private readonly onProgress?: (progress: number) => void,
    private readonly onHeartbeat?: () => void,
    private readonly onStream?: (event: InternalStreamEvent) => void
  ) {
    this._log = createTaskLogger(activationData.taskExecutionId, activationData.taskKind);
    this._lastHeartbeat = Date.now();
  }

  /**
   * Report progress (0.0 to 1.0).
   */
  reportProgress(progress: number): void {
    if (progress < 0 || progress > 1) {
      throw new Error('Progress must be between 0 and 1');
    }

    this._progress = progress;
    this.onProgress?.(progress);
    this._log.debug('Progress reported', { progress });
  }

  /**
   * Send a heartbeat to keep the task alive.
   */
  heartbeat(): void {
    this._lastHeartbeat = Date.now();
    this.onHeartbeat?.();
    this._log.debug('Heartbeat sent');
  }

  /**
   * Check if the task has been cancelled and throw if so.
   */
  checkCancellation(): void {
    if (this._cancelled) {
      throw this.cancellationError();
    }
  }

  /**
   * Get a cancellation error to throw.
   */
  cancellationError(): Error {
    return new TaskCancelled(this.activationData.taskExecutionId);
  }

  /**
   * Stream an event to connected clients (consolidated API).
   */
  stream(event: PublicStreamEvent): void {
    switch (event.type) {
      case 'token':
        this.streamToken(event.text);
        break;
      case 'progress':
        this.streamProgress(event.progress);
        break;
      case 'data':
        this.streamData(event.data);
        break;
      case 'error':
        this.streamError(event.message);
        break;
    }
  }

  /**
   * Stream a token (for LLM-style streaming).
   */
  streamToken(token: string): void {
    const event: InternalStreamEvent = {
      type: 'token',
      data: token,
      timestamp: Date.now(),
    };
    this._streamEvents.push(event);
    this.onStream?.(event);
    this._log.debug('Token streamed', { token });
  }

  /**
   * Stream progress update.
   */
  streamProgress(progress: number): void {
    const event: InternalStreamEvent = {
      type: 'progress',
      data: progress,
      timestamp: Date.now(),
    };
    this._streamEvents.push(event);
    this.onStream?.(event);
    this._log.debug('Progress streamed', { progress });
  }

  /**
   * Stream arbitrary data.
   */
  streamData(data: unknown): void {
    const event: InternalStreamEvent = {
      type: 'data',
      data,
      timestamp: Date.now(),
    };
    this._streamEvents.push(event);
    this.onStream?.(event);
    this._log.debug('Data streamed');
  }

  /**
   * Stream an error (non-fatal).
   */
  streamError(error: string): void {
    const event: InternalStreamEvent = {
      type: 'error',
      data: error,
      timestamp: Date.now(),
    };
    this._streamEvents.push(event);
    this.onStream?.(event);
    this._log.debug('Error streamed', { error });
  }

  /**
   * Whether the task has been cancelled.
   */
  get isCancelled(): boolean {
    return this._cancelled;
  }

  /**
   * The task execution ID.
   */
  get taskExecutionId(): string {
    return this.activationData.taskExecutionId;
  }

  /**
   * The task kind/type.
   */
  get taskKind(): string {
    return this.activationData.taskKind;
  }

  /**
   * Current execution attempt (1-based).
   */
  get attempt(): number {
    return this.activationData.attempt;
  }

  /**
   * Logger for this task.
   */
  get log(): Logger {
    return this._log;
  }

  /**
   * Get the current progress value.
   */
  get progress(): number {
    return this._progress;
  }

  /**
   * Get the last heartbeat timestamp.
   */
  get lastHeartbeat(): number {
    return this._lastHeartbeat;
  }

  /**
   * Get all stream events.
   */
  get streamEvents(): readonly InternalStreamEvent[] {
    return this._streamEvents;
  }

  /**
   * Mark the task as cancelled (called by worker).
   */
  _markCancelled(): void {
    this._cancelled = true;
  }
}
