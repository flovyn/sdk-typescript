/**
 * Internal workflow worker implementation.
 *
 * Polls for workflow activations and executes registered workflows.
 */

import type {
  NapiWorkerInstance,
  WorkflowActivationData,
  WorkflowCompletionStatus,
} from '@flovyn/native';
import type { WorkflowDefinition, Logger } from '../types';
import { WorkflowContextImpl } from '../context/workflow-context';
import { WorkflowSuspended, WorkflowCancelled, DeterminismViolation } from '../errors';
import { serialize, deserialize } from '../serde';

/**
 * Workflow worker options.
 */
export interface WorkflowWorkerOptions {
  /**
   * How often to poll for activations (ms).
   * @default 100
   */
  pollIntervalMs?: number;

  /**
   * Maximum concurrent workflow executions.
   * @default 10
   */
  maxConcurrent?: number;

  /**
   * Logger instance.
   */
  logger?: Logger;
}

/**
 * Internal workflow worker that polls for and executes workflows.
 */
export class WorkflowWorker {
  private readonly workflows: Map<string, WorkflowDefinition<unknown, unknown>> = new Map();
  private readonly pollIntervalMs: number;
  private readonly maxConcurrent: number;
  private readonly logger: Logger;
  private running: boolean = false;
  private activeExecutions: number = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly nativeWorker: NapiWorkerInstance,
    options: WorkflowWorkerOptions = {}
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
    this.maxConcurrent = options.maxConcurrent ?? 10;
    this.logger = options.logger ?? createDefaultLogger('workflow-worker');
  }

  /**
   * Register a workflow definition.
   */
  registerWorkflow<I, O>(workflow: WorkflowDefinition<I, O>): void {
    if (this.workflows.has(workflow.name)) {
      throw new Error(`Workflow "${workflow.name}" is already registered`);
    }
    this.workflows.set(workflow.name, workflow as WorkflowDefinition<unknown, unknown>);
    this.logger.info(`Registered workflow: ${workflow.name}`);
  }

  /**
   * Start the worker polling loop.
   */
  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.logger.info('Starting workflow worker');
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
    this.logger.info('Stopped workflow worker');
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
   * Poll for workflow activations.
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
      const activation = await this.nativeWorker.pollWorkflowActivation();

      if (activation) {
        this.activeExecutions++;
        // Handle activation asynchronously
        this.handleActivation(activation).finally(() => {
          this.activeExecutions--;
        });
      }
    } catch (error) {
      this.logger.error('Error polling for workflow activation', error);
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
   * Handle a workflow activation.
   */
  private async handleActivation(activation: WorkflowActivationData): Promise<void> {
    const { workflowExecutionId, workflowKind, input } = activation;

    this.logger.debug(`Handling activation for workflow ${workflowKind}:${workflowExecutionId}`);

    // Find the registered workflow
    const workflowDef = this.workflows.get(workflowKind);
    if (!workflowDef) {
      await this.completeWithFailure(
        workflowExecutionId,
        `Unknown workflow type: ${workflowKind}`,
        false
      );
      return;
    }

    try {
      // Create the workflow context
      const ctx = new WorkflowContextImpl(activation);

      // Deserialize input
      const inputData = input ? deserialize(input) : undefined;

      // Execute the workflow
      const result = await workflowDef.run(ctx, inputData);

      // Workflow completed successfully
      await this.completeWithSuccess(workflowExecutionId, result);
    } catch (error) {
      if (error instanceof WorkflowSuspended) {
        // Workflow is waiting for something - send commands and continue later
        await this.completeWithCommands(workflowExecutionId, error.commands);
      } else if (error instanceof WorkflowCancelled) {
        // Workflow was cancelled
        await this.completeWithCancellation(workflowExecutionId, error.message);
      } else if (error instanceof DeterminismViolation) {
        // Determinism violation - fail permanently
        await this.completeWithFailure(
          workflowExecutionId,
          `Determinism violation: ${error.message}`,
          false
        );
      } else {
        // Other error - may be retryable
        const message = error instanceof Error ? error.message : String(error);
        await this.completeWithFailure(workflowExecutionId, message, true);
      }
    }
  }

  /**
   * Complete workflow with success.
   */
  private async completeWithSuccess(workflowExecutionId: string, result: unknown): Promise<void> {
    const completionStatus: WorkflowCompletionStatus = {
      status: 'Completed',
      output: serialize(result),
    };
    await this.nativeWorker.completeWorkflowActivation(workflowExecutionId, completionStatus);
    this.logger.debug(`Workflow ${workflowExecutionId} completed successfully`);
  }

  /**
   * Complete workflow with commands (suspended).
   */
  private async completeWithCommands(workflowExecutionId: string, commands: string): Promise<void> {
    const completionStatus: WorkflowCompletionStatus = {
      status: 'Suspended',
      commands,
    };
    await this.nativeWorker.completeWorkflowActivation(workflowExecutionId, completionStatus);
    this.logger.debug(`Workflow ${workflowExecutionId} suspended with commands`);
  }

  /**
   * Complete workflow with failure.
   */
  private async completeWithFailure(
    workflowExecutionId: string,
    error: string,
    _retryable: boolean
  ): Promise<void> {
    const completionStatus: WorkflowCompletionStatus = {
      status: 'Failed',
      error,
    };
    await this.nativeWorker.completeWorkflowActivation(workflowExecutionId, completionStatus);
    this.logger.error(`Workflow ${workflowExecutionId} failed: ${error}`);
  }

  /**
   * Complete workflow with cancellation.
   */
  private async completeWithCancellation(
    workflowExecutionId: string,
    reason?: string
  ): Promise<void> {
    const completionStatus: WorkflowCompletionStatus = {
      status: 'Cancelled',
    };
    if (reason !== undefined) {
      completionStatus.reason = reason;
    }
    await this.nativeWorker.completeWorkflowActivation(workflowExecutionId, completionStatus);
    this.logger.info(`Workflow ${workflowExecutionId} cancelled: ${reason ?? 'No reason'}`);
  }
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
