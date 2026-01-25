/**
 * Task definition factory.
 *
 * Use the `task()` function to define tasks that can be scheduled
 * from workflows and executed by workers.
 *
 * @example
 * ```typescript
 * import { task } from '@flovyn/sdk';
 *
 * interface EmailInput {
 *   to: string;
 *   subject: string;
 *   body: string;
 * }
 *
 * interface EmailOutput {
 *   messageId: string;
 *   sent: boolean;
 * }
 *
 * const sendEmail = task<EmailInput, EmailOutput>({
 *   name: 'send-email',
 *   description: 'Send an email to a recipient',
 *   async run(ctx, input) {
 *     // Perform the actual email sending
 *     const result = await emailService.send(input);
 *     return { messageId: result.id, sent: true };
 *   },
 * });
 * ```
 */

import type { TaskContext, TaskDefinition, TaskHooks, RetryPolicy, Logger } from './types';
import { Duration } from './duration';

/**
 * Configuration for defining a task.
 */
export interface TaskConfig<I = unknown, O = unknown> {
  /** Unique name identifying this task type. */
  name: string;

  /** Optional description of what this task does. */
  description?: string;

  /** Optional timeout for task execution. */
  timeout?: Duration;

  /** Optional retry policy for failed tasks. */
  retry?: RetryPolicy;

  /**
   * The task execution function.
   *
   * This function performs the actual work. Unlike workflows, tasks
   * can perform non-deterministic operations like API calls, database
   * queries, etc.
   *
   * @param ctx - The task context for progress reporting and cancellation
   * @param input - The input data passed when scheduling the task
   * @returns The task output
   */
  run: (ctx: TaskContext, input: I) => Promise<O>;

  /**
   * Optional lifecycle hooks.
   */
  hooks?: TaskHooks<I, O>;
}

/**
 * Internal task definition implementation.
 */
class TaskDefinitionImpl<I, O> implements TaskDefinition<I, O> {
  readonly name: string;
  readonly description?: string;
  readonly timeout?: Duration;
  readonly retry?: RetryPolicy;
  readonly run: (ctx: TaskContext, input: I) => Promise<O>;
  readonly hooks?: TaskHooks<I, O>;

  constructor(config: TaskConfig<I, O>) {
    this.name = config.name;
    this.run = config.run;
    // Only assign optional properties if they are defined
    if (config.description !== undefined) {
      this.description = config.description;
    }
    if (config.timeout !== undefined) {
      this.timeout = config.timeout;
    }
    if (config.retry !== undefined) {
      this.retry = config.retry;
    }
    if (config.hooks !== undefined) {
      this.hooks = config.hooks;
    }
  }
}

/**
 * Define a task.
 *
 * Creates a task definition that can be registered with a FlovynClient
 * and scheduled from workflows. Tasks perform the actual work and can
 * include non-deterministic operations.
 *
 * @param config - The task configuration
 * @returns A task definition that can be registered and scheduled
 *
 * @example
 * ```typescript
 * const processImage = task({
 *   name: 'process-image',
 *   timeout: Duration.minutes(5),
 *   retry: { maxRetries: 3 },
 *   async run(ctx, input: { imageUrl: string }) {
 *     ctx.reportProgress(0);
 *
 *     const image = await downloadImage(input.imageUrl);
 *     ctx.reportProgress(0.3);
 *
 *     const processed = await applyFilters(image);
 *     ctx.reportProgress(0.7);
 *
 *     const result = await uploadImage(processed);
 *     ctx.reportProgress(1.0);
 *
 *     return { resultUrl: result.url };
 *   },
 * });
 * ```
 */
export function task<I = unknown, O = unknown>(
  config: TaskConfig<I, O>
): TaskDefinition<I, O> {
  if (!config.name) {
    throw new Error('Task name is required');
  }

  if (!config.run) {
    throw new Error('Task run function is required');
  }

  return new TaskDefinitionImpl(config);
}

/**
 * Create a console-based logger for tasks.
 */
export function createTaskLogger(taskExecutionId: string, taskKind: string): Logger {
  const prefix = `[task:${taskKind}:${taskExecutionId.slice(0, 8)}]`;

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
