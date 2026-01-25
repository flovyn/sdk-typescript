/**
 * Internal task worker implementation.
 *
 * Polls for task activations and executes registered tasks.
 */

import type {
  NapiWorkerInstance,
  TaskActivationData,
  TaskCompletion,
} from '@flovyn/native';
import type { TaskDefinition, Logger } from '../types';
import { TaskContextImpl } from '../context/task-context';
import { TaskCancelled, TaskFailed } from '../errors';
import { serialize, deserialize } from '../serde';

/**
 * Task worker options.
 */
export interface TaskWorkerOptions {
  /**
   * How often to poll for activations (ms).
   * @default 100
   */
  pollIntervalMs?: number;

  /**
   * Maximum concurrent task executions.
   * @default 20
   */
  maxConcurrent?: number;

  /**
   * Logger instance.
   */
  logger?: Logger;
}

/**
 * Internal task worker that polls for and executes tasks.
 */
export class TaskWorker {
  private readonly tasks: Map<string, TaskDefinition<unknown, unknown>> = new Map();
  private readonly pollIntervalMs: number;
  private readonly maxConcurrent: number;
  private readonly logger: Logger;
  private running: boolean = false;
  private activeExecutions: number = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly nativeWorker: NapiWorkerInstance,
    options: TaskWorkerOptions = {}
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
    this.maxConcurrent = options.maxConcurrent ?? 20;
    this.logger = options.logger ?? createDefaultLogger('task-worker');
  }

  /**
   * Register a task definition.
   */
  registerTask<I, O>(task: TaskDefinition<I, O>): void {
    if (this.tasks.has(task.name)) {
      throw new Error(`Task "${task.name}" is already registered`);
    }
    this.tasks.set(task.name, task as TaskDefinition<unknown, unknown>);
    this.logger.info(`Registered task: ${task.name}`);
  }

  /**
   * Start the worker polling loop.
   */
  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.logger.info('Starting task worker');
    this.poll();
  }

  /**
   * Stop the worker.
   */
  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.logger.info('Stopped task worker');
  }

  /**
   * Check if the worker is running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the number of active executions.
   */
  getActiveExecutions(): number {
    return this.activeExecutions;
  }

  /**
   * Poll for task activations.
   */
  private async poll(): Promise<void> {
    if (!this.running) {
      return;
    }

    // Check if we can accept more work
    if (this.activeExecutions >= this.maxConcurrent) {
      this.schedulePoll();
      return;
    }

    try {
      const activation = await this.nativeWorker.pollTaskActivation();

      if (activation) {
        this.activeExecutions++;
        // Handle activation asynchronously
        this.handleActivation(activation).finally(() => {
          this.activeExecutions--;
        });
      }
    } catch (error) {
      this.logger.error('Error polling for task activation', error);
    }

    this.schedulePoll();
  }

  /**
   * Schedule the next poll.
   */
  private schedulePoll(): void {
    if (this.running) {
      this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
    }
  }

  /**
   * Handle a task activation.
   */
  private async handleActivation(activation: TaskActivationData): Promise<void> {
    const { taskExecutionId, taskKind, input } = activation;

    this.logger.debug(`Handling activation for task ${taskKind}:${taskExecutionId}`);

    // Find the registered task
    const taskDef = this.tasks.get(taskKind);
    if (!taskDef) {
      await this.completeWithFailure(
        taskExecutionId,
        `Unknown task type: ${taskKind}`,
        false
      );
      return;
    }

    // Create the task context
    const ctx = new TaskContextImpl(
      activation,
      (progress) => this.onProgress(taskExecutionId, progress),
      () => this.onHeartbeat(taskExecutionId)
    );

    // Deserialize input
    const inputData = input ? deserialize(input) : undefined;

    try {
      // Call onStart hook if present
      if (taskDef.hooks?.onStart) {
        await taskDef.hooks.onStart(ctx, inputData);
      }

      // Execute the task
      const result = await taskDef.run(ctx, inputData);

      // Call onSuccess hook if present
      if (taskDef.hooks?.onSuccess) {
        await taskDef.hooks.onSuccess(ctx, inputData, result);
      }

      // Task completed successfully
      await this.completeWithSuccess(taskExecutionId, result);
    } catch (error) {
      // Call onFailure hook if present
      if (taskDef.hooks?.onFailure && error instanceof Error) {
        await taskDef.hooks.onFailure(ctx, inputData, error);
      }

      if (error instanceof TaskCancelled) {
        // Task was cancelled
        await this.completeWithCancellation(taskExecutionId);
      } else if (error instanceof TaskFailed) {
        // Explicit task failure
        await this.completeWithFailure(taskExecutionId, error.message, error.retryable);
      } else {
        // Other error - treat as retryable by default
        const message = error instanceof Error ? error.message : String(error);
        const retryable = shouldRetry(error);
        await this.completeWithFailure(taskExecutionId, message, retryable);
      }
    }
  }

  /**
   * Handle progress update from task.
   */
  private onProgress(_taskExecutionId: string, _progress: number): void {
    // Progress reporting would be sent to the server here
    // For now, just log it
    this.logger.debug(`Task progress: ${_progress}`);
  }

  /**
   * Handle heartbeat from task.
   */
  private onHeartbeat(_taskExecutionId: string): void {
    // Heartbeat would be sent to the server here
    // For now, just log it
    this.logger.debug('Task heartbeat');
  }

  /**
   * Complete task with success.
   */
  private async completeWithSuccess(taskExecutionId: string, result: unknown): Promise<void> {
    const completion: TaskCompletion = {
      taskExecutionId,
      status: 'Completed',
      output: serialize(result),
    };
    await this.nativeWorker.completeTask(completion);
    this.logger.debug(`Task ${taskExecutionId} completed successfully`);
  }

  /**
   * Complete task with failure.
   */
  private async completeWithFailure(
    taskExecutionId: string,
    error: string,
    retryable: boolean
  ): Promise<void> {
    const completion: TaskCompletion = {
      taskExecutionId,
      status: 'Failed',
      error,
      retryable,
    };
    await this.nativeWorker.completeTask(completion);
    this.logger.error(`Task ${taskExecutionId} failed: ${error}`);
  }

  /**
   * Complete task with cancellation.
   */
  private async completeWithCancellation(taskExecutionId: string): Promise<void> {
    const completion: TaskCompletion = {
      taskExecutionId,
      status: 'Cancelled',
    };
    await this.nativeWorker.completeTask(completion);
    this.logger.info(`Task ${taskExecutionId} cancelled`);
  }
}

/**
 * Determine if an error should be retried.
 */
function shouldRetry(error: unknown): boolean {
  // Network errors are typically retryable
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('econnreset')
    ) {
      return true;
    }
  }

  // Default to retryable
  return true;
}

/**
 * Create a default console logger.
 */
function createDefaultLogger(name: string): Logger {
  const prefix = `[${name}]`;
  return {
    debug(message: string, ...args: unknown[]) {
      console.debug(prefix, message, ...args);
    },
    info(message: string, ...args: unknown[]) {
      console.info(prefix, message, ...args);
    },
    warn(message: string, ...args: unknown[]) {
      console.warn(prefix, message, ...args);
    },
    error(message: string, ...args: unknown[]) {
      console.error(prefix, message, ...args);
    },
  };
}
