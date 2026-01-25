/**
 * Workflow definition factory.
 *
 * Use the `workflow()` function to define workflows that can be
 * registered with a FlovynClient and executed durably.
 *
 * @example
 * ```typescript
 * import { workflow } from '@flovyn/sdk';
 *
 * interface OrderInput {
 *   orderId: string;
 *   items: string[];
 * }
 *
 * interface OrderOutput {
 *   status: 'completed' | 'cancelled';
 *   total: number;
 * }
 *
 * const processOrder = workflow<OrderInput, OrderOutput>({
 *   name: 'process-order',
 *   description: 'Process a customer order',
 *   async run(ctx, input) {
 *     // Schedule tasks, use timers, etc.
 *     const result = await ctx.task(calculateTotal, { items: input.items });
 *     return { status: 'completed', total: result.total };
 *   },
 * });
 * ```
 */

import type { WorkflowContext, WorkflowDefinition, WorkflowHandlers, Logger } from './types';
import { Duration } from './duration';

/**
 * Configuration for defining a workflow.
 */
export interface WorkflowConfig<I = unknown, O = unknown> {
  /** Unique name identifying this workflow type. */
  name: string;

  /** Optional description of what this workflow does. */
  description?: string;

  /** Optional version string for workflow versioning. */
  version?: string;

  /** Optional timeout for the entire workflow execution. */
  timeout?: Duration;

  /**
   * The workflow execution function.
   *
   * This function is called when the workflow is started or replayed.
   * All operations should use the context methods to ensure determinism.
   *
   * @param ctx - The workflow context providing deterministic operations
   * @param input - The input data passed when starting the workflow
   * @returns The workflow output
   */
  run: (ctx: WorkflowContext, input: I) => Promise<O>;

  /**
   * Optional signal and query handlers.
   */
  handlers?: WorkflowHandlers<I, O>;
}

/**
 * Internal workflow definition implementation.
 */
class WorkflowDefinitionImpl<I, O> implements WorkflowDefinition<I, O> {
  readonly name: string;
  readonly description?: string;
  readonly version?: string;
  readonly timeout?: Duration;
  readonly run: (ctx: WorkflowContext, input: I) => Promise<O>;
  readonly handlers?: WorkflowHandlers<I, O>;

  constructor(config: WorkflowConfig<I, O>) {
    this.name = config.name;
    this.run = config.run;
    // Only assign optional properties if they are defined
    if (config.description !== undefined) {
      this.description = config.description;
    }
    if (config.version !== undefined) {
      this.version = config.version;
    }
    if (config.timeout !== undefined) {
      this.timeout = config.timeout;
    }
    if (config.handlers !== undefined) {
      this.handlers = config.handlers;
    }
  }
}

/**
 * Define a workflow.
 *
 * Creates a workflow definition that can be registered with a FlovynClient
 * and executed durably. The workflow function receives a context that provides
 * deterministic operations for tasks, timers, promises, and state management.
 *
 * @param config - The workflow configuration
 * @returns A workflow definition that can be registered and executed
 *
 * @example
 * ```typescript
 * const myWorkflow = workflow({
 *   name: 'my-workflow',
 *   async run(ctx, input: { value: number }) {
 *     // Use context for all operations
 *     const doubled = await ctx.task(doubleTask, { value: input.value });
 *     await ctx.sleep(Duration.seconds(5));
 *     return { result: doubled.value };
 *   },
 * });
 * ```
 */
export function workflow<I = unknown, O = unknown>(
  config: WorkflowConfig<I, O>
): WorkflowDefinition<I, O> {
  if (!config.name) {
    throw new Error('Workflow name is required');
  }

  if (!config.run) {
    throw new Error('Workflow run function is required');
  }

  return new WorkflowDefinitionImpl(config);
}

/**
 * Create a console-based logger for workflows.
 */
export function createWorkflowLogger(workflowId: string, workflowKind: string): Logger {
  const prefix = `[workflow:${workflowKind}:${workflowId.slice(0, 8)}]`;

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
