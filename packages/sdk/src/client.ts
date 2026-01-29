/**
 * Flovyn client implementation.
 *
 * The FlovynClient is the main entry point for:
 * - Registering workflows and tasks
 * - Starting and managing workers
 * - Starting workflows from the application
 */

import {
  NapiClient,
  NapiWorker,
  type NapiClientInstance,
  type NapiWorkerInstance,
} from '@flovyn/native';
import type { WorkflowDefinition, TaskDefinition, WorkflowHandle, Logger } from './types';
import { WorkflowWorker, type WorkflowWorkerOptions } from './worker/workflow-worker';
import { TaskWorker, type TaskWorkerOptions } from './worker/task-worker';
import { WorkflowHandleImpl } from './handles';
import { serialize } from './serde';

/**
 * Client configuration options.
 */
export interface FlovynClientOptions {
  /**
   * Flovyn server URL.
   */
  serverUrl: string;

  /**
   * Organization ID.
   */
  orgId: string;

  /**
   * Queue name for this client.
   * @default 'default'
   */
  queue?: string;

  /**
   * Worker authentication token.
   */
  workerToken?: string;

  /**
   * API key for client operations (starting workflows, etc.).
   */
  apiKey?: string;

  /**
   * HTTP base URL for REST API operations.
   * If not provided, defaults to serverUrl (assuming same host).
   */
  httpUrl?: string;

  /**
   * Organization slug for REST API paths.
   * Defaults to orgId if not provided.
   */
  orgSlug?: string;

  /**
   * Logger instance.
   */
  logger?: Logger;

  /**
   * Workflow worker options.
   */
  workflowWorkerOptions?: WorkflowWorkerOptions;

  /**
   * Task worker options.
   */
  taskWorkerOptions?: TaskWorkerOptions;
}

/**
 * Options for starting a workflow.
 */
export interface StartWorkflowOptions {
  /**
   * Queue to run the workflow on.
   * Defaults to the client's queue.
   */
  queue?: string;

  /**
   * Workflow version.
   */
  workflowVersion?: string;

  /**
   * Idempotency key for deduplication.
   */
  idempotencyKey?: string;
}

/**
 * The main Flovyn client.
 *
 * Use this to register workflows and tasks, start workers, and
 * interact with the Flovyn platform.
 *
 * @example
 * ```typescript
 * const client = new FlovynClient({
 *   serverUrl: 'http://localhost:9090',
 *   orgId: 'my-org',
 * });
 *
 * client.registerWorkflow(orderWorkflow);
 * client.registerTask(sendEmailTask);
 *
 * await client.start();
 *
 * const handle = await client.startWorkflow(orderWorkflow, { orderId: '123' });
 * const result = await handle.result();
 * ```
 */
export class FlovynClient {
  private readonly options: Required<Pick<FlovynClientOptions, 'serverUrl' | 'orgId' | 'queue'>> &
    FlovynClientOptions;
  private readonly logger: Logger;
  private nativeClient: NapiClientInstance | null = null;
  private nativeWorker: NapiWorkerInstance | null = null;
  private workflowWorker: WorkflowWorker | null = null;
  private taskWorker: TaskWorker | null = null;
  private readonly registeredWorkflows: Map<string, WorkflowDefinition<unknown, unknown>> =
    new Map();
  private readonly registeredTasks: Map<string, TaskDefinition<unknown, unknown>> = new Map();
  private started: boolean = false;

  constructor(options: FlovynClientOptions) {
    this.options = {
      queue: 'default',
      ...options,
    };
    this.logger = options.logger ?? createDefaultLogger('flovyn-client');
  }

  /**
   * Register a workflow definition.
   *
   * The workflow will be available for execution after the client starts.
   */
  registerWorkflow<I, O>(workflow: WorkflowDefinition<I, O>): void {
    if (this.started) {
      throw new Error('Cannot register workflows after client has started');
    }
    if (this.registeredWorkflows.has(workflow.name)) {
      throw new Error(`Workflow "${workflow.name}" is already registered`);
    }
    this.registeredWorkflows.set(workflow.name, workflow as WorkflowDefinition<unknown, unknown>);
    this.logger.info(`Registered workflow: ${workflow.name}`);
  }

  /**
   * Register a task definition.
   *
   * The task will be available for execution after the client starts.
   */
  registerTask<I, O>(task: TaskDefinition<I, O>): void {
    if (this.started) {
      throw new Error('Cannot register tasks after client has started');
    }
    if (this.registeredTasks.has(task.name)) {
      throw new Error(`Task "${task.name}" is already registered`);
    }
    this.registeredTasks.set(task.name, task as TaskDefinition<unknown, unknown>);
    this.logger.info(`Registered task: ${task.name}`);
  }

  /**
   * Start the client and workers.
   *
   * This connects to the Flovyn server and begins processing
   * workflows and tasks.
   */
  async start(): Promise<void> {
    if (this.started) {
      throw new Error('Client is already started');
    }

    this.logger.info('Starting Flovyn client', {
      serverUrl: this.options.serverUrl,
      orgId: this.options.orgId,
      queue: this.options.queue,
    });

    // Create native client
    const clientConfig: import('@flovyn/native').ClientConfig = {
      serverUrl: this.options.serverUrl,
      orgId: this.options.orgId,
    };
    if (this.options.apiKey) {
      clientConfig.clientToken = this.options.apiKey;
    }
    this.nativeClient = new NapiClient(clientConfig);

    // Build workflow metadata from registered workflows
    const workflowMetadata: import('@flovyn/native').WorkflowMetadata[] = [];
    for (const workflow of this.registeredWorkflows.values()) {
      const meta: import('@flovyn/native').WorkflowMetadata = {
        kind: workflow.name,
        name: workflow.name,
        tags: [],
        cancellable: true,
      };
      if (workflow.description) {
        meta.description = workflow.description;
      }
      if (workflow.version) {
        meta.version = workflow.version;
      }
      workflowMetadata.push(meta);
    }

    // Build task metadata from registered tasks
    const taskMetadata: import('@flovyn/native').TaskMetadata[] = [];
    for (const task of this.registeredTasks.values()) {
      const meta: import('@flovyn/native').TaskMetadata = {
        kind: task.name,
        name: task.name,
        tags: [],
        cancellable: true,
      };
      if (task.description) {
        meta.description = task.description;
      }
      taskMetadata.push(meta);
    }

    // Create native worker
    const workerConfig: import('@flovyn/native').WorkerConfig = {
      serverUrl: this.options.serverUrl,
      orgId: this.options.orgId,
      queue: this.options.queue,
      workflowMetadata,
      taskMetadata,
    };
    if (this.options.workerToken !== undefined) {
      workerConfig.workerToken = this.options.workerToken;
    }
    this.nativeWorker = new NapiWorker(workerConfig);

    // Create workflow worker
    this.workflowWorker = new WorkflowWorker(this.nativeWorker, {
      logger: this.logger,
      ...this.options.workflowWorkerOptions,
    });

    // Register workflows
    for (const workflow of this.registeredWorkflows.values()) {
      this.workflowWorker.registerWorkflow(workflow);
    }

    // Create task worker
    this.taskWorker = new TaskWorker(this.nativeWorker, {
      logger: this.logger,
      ...this.options.taskWorkerOptions,
    });

    // Register tasks
    for (const task of this.registeredTasks.values()) {
      this.taskWorker.registerTask(task);
    }

    // Register the worker with the server
    this.logger.info('Registering worker with server');
    await this.nativeWorker.register();

    // Start workers
    this.workflowWorker.start();
    this.taskWorker.start();

    this.started = true;
    this.logger.info('Flovyn client started');
  }

  /**
   * Stop the client and workers.
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    this.logger.info('Stopping Flovyn client');

    // Stop workers
    this.workflowWorker?.stop();
    this.taskWorker?.stop();

    // Wait for active work to complete (with timeout)
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const workflowActive = this.workflowWorker?.getActiveExecutions() ?? 0;
      const taskActive = this.taskWorker?.getActiveExecutions() ?? 0;
      if (workflowActive === 0 && taskActive === 0) {
        break;
      }
      await sleep(100);
    }

    this.nativeClient = null;
    this.nativeWorker = null;
    this.workflowWorker = null;
    this.taskWorker = null;
    this.started = false;

    this.logger.info('Flovyn client stopped');
  }

  /**
   * Start a workflow and return a handle.
   *
   * The handle is wrapped in an object to avoid TypeScript's Awaited<T> unwrapping
   * the PromiseLike interface on WorkflowHandle. Use destructuring to get the handle:
   *
   * ```typescript
   * const { handle } = await client.startWorkflow(myWorkflow, input);
   * console.log(handle.workflowId);
   * const result = await handle;  // or await handle.result()
   * ```
   *
   * @param workflow - The workflow definition to start
   * @param input - The input to pass to the workflow
   * @param options - Optional configuration
   * @returns An object containing the workflow handle
   */
  async startWorkflow<I, O>(
    workflow: WorkflowDefinition<I, O>,
    input: I,
    options?: StartWorkflowOptions
  ): Promise<{ handle: WorkflowHandle<O> }> {
    if (!this.nativeClient) {
      throw new Error('Client is not started');
    }

    const inputJson = serialize(input);

    // Build options object, only including defined values
    const startOptions: import('@flovyn/native').StartWorkflowOptions = {
      queue: options?.queue ?? this.options.queue,
    };
    const version = options?.workflowVersion ?? workflow.version;
    if (version !== undefined) {
      startOptions.workflowVersion = version;
    }
    if (options?.idempotencyKey !== undefined) {
      startOptions.idempotencyKey = options.idempotencyKey;
    }

    const result = await this.nativeClient.startWorkflow(workflow.name, inputJson, startOptions);

    this.logger.info(`Started workflow ${workflow.name}`, {
      workflowId: result.workflowExecutionId,
    });

    const httpUrl = this.options.httpUrl ?? this.options.serverUrl;
    const orgSlug = this.options.orgSlug ?? this.options.orgId;

    return {
      handle: new WorkflowHandleImpl<O>(
        this.nativeClient,
        result.workflowExecutionId,
        httpUrl,
        orgSlug,
        this.options.apiKey
      ),
    };
  }

  /**
   * Start a workflow and wait for its result.
   *
   * This is a convenience method that combines startWorkflow and awaiting the result.
   *
   * ```typescript
   * const result = await client.executeWorkflow(myWorkflow, input);
   * ```
   *
   * @param workflow - The workflow definition to start
   * @param input - The input to pass to the workflow
   * @param options - Optional configuration
   * @returns The workflow result
   */
  async executeWorkflow<I, O>(
    workflow: WorkflowDefinition<I, O>,
    input: I,
    options?: StartWorkflowOptions
  ): Promise<O> {
    const { handle } = await this.startWorkflow(workflow, input, options);
    return handle.result();
  }

  /**
   * Get a handle to an existing workflow.
   *
   * @param workflowId - The workflow execution ID
   * @returns A handle to interact with the workflow
   */
  getWorkflowHandle<O>(workflowId: string): WorkflowHandle<O> {
    if (!this.nativeClient) {
      throw new Error('Client is not started');
    }

    const httpUrl = this.options.httpUrl ?? this.options.serverUrl;
    const orgSlug = this.options.orgSlug ?? this.options.orgId;

    return new WorkflowHandleImpl<O>(
      this.nativeClient,
      workflowId,
      httpUrl,
      orgSlug,
      this.options.apiKey
    );
  }

  /**
   * Resolve an external promise.
   *
   * @param promiseId - The promise ID
   * @param value - The value to resolve with
   */
  async resolvePromise<T>(promiseId: string, value: T): Promise<void> {
    if (!this.nativeClient) {
      throw new Error('Client is not started');
    }

    await this.nativeClient.resolvePromise(promiseId, serialize(value));
  }

  /**
   * Reject an external promise.
   *
   * @param promiseId - The promise ID
   * @param error - The error message
   */
  async rejectPromise(promiseId: string, error: string): Promise<void> {
    if (!this.nativeClient) {
      throw new Error('Client is not started');
    }

    await this.nativeClient.rejectPromise(promiseId, error);
  }

  /**
   * Send a signal to an existing workflow.
   *
   * @param workflowExecutionId - The workflow execution ID
   * @param signalName - The name of the signal
   * @param value - The signal payload
   * @returns The sequence number of the signal event
   */
  async signalWorkflow<T>(
    workflowExecutionId: string,
    signalName: string,
    value: T
  ): Promise<number> {
    if (!this.nativeClient) {
      throw new Error('Client is not started');
    }

    const result = await this.nativeClient.signalWorkflow(
      workflowExecutionId,
      signalName,
      serialize(value)
    );
    return result.signalEventSequence;
  }

  /**
   * Send a signal to an existing workflow, or create a new workflow and send the signal.
   *
   * This is an atomic operation - either the workflow exists and receives the signal,
   * or a new workflow is created with the signal.
   *
   * @param workflow - The workflow definition
   * @param workflowId - The workflow ID (used as idempotency key)
   * @param input - The workflow input
   * @param signalName - The name of the signal
   * @param signalValue - The signal payload
   * @param options - Optional configuration
   * @returns The result with workflow execution ID and creation status
   */
  async signalWithStartWorkflow<I, O, S>(
    workflow: WorkflowDefinition<I, O>,
    workflowId: string,
    input: I,
    signalName: string,
    signalValue: S,
    options?: StartWorkflowOptions
  ): Promise<{ workflowHandle: WorkflowHandle<O>; workflowCreated: boolean }> {
    if (!this.nativeClient) {
      throw new Error('Client is not started');
    }

    const result = await this.nativeClient.signalWithStartWorkflow(
      workflowId,
      workflow.name,
      serialize(input),
      options?.queue ?? this.options.queue,
      signalName,
      serialize(signalValue)
    );

    const httpUrl = this.options.httpUrl ?? this.options.serverUrl;
    const orgSlug = this.options.orgSlug ?? this.options.orgId;

    return {
      workflowHandle: new WorkflowHandleImpl<O>(
        this.nativeClient,
        result.workflowExecutionId,
        httpUrl,
        orgSlug,
        this.options.apiKey
      ),
      workflowCreated: result.workflowCreated,
    };
  }

  /**
   * Check if the client is started.
   */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * Get the number of active workflow executions.
   */
  getActiveWorkflowExecutions(): number {
    return this.workflowWorker?.getActiveExecutions() ?? 0;
  }

  /**
   * Get the number of active task executions.
   */
  getActiveTaskExecutions(): number {
    return this.taskWorker?.getActiveExecutions() ?? 0;
  }
}

/**
 * Sleep utility.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
