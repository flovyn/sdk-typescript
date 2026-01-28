/**
 * Test environment for E2E testing with Testcontainers.
 *
 * @example
 * ```typescript
 * import { FlovynTestEnvironment } from '@flovyn/sdk/testing';
 *
 * const env = new FlovynTestEnvironment();
 * env.registerWorkflow(myWorkflow);
 * env.registerTask(myTask);
 *
 * await env.start();
 * const handle = await env.startWorkflow(myWorkflow, { input: 'value' });
 * const result = await env.awaitCompletion(handle);
 * await env.stop();
 * ```
 */

import { randomUUID } from 'crypto';
import type { WorkflowDefinition, TaskDefinition, WorkflowHandle } from '../types';
import { Duration } from '../duration';
import { getTestHarness, type TestHarness, type HarnessConfig } from './test-harness';

/**
 * Try to get harness config from vitest's inject().
 * Returns null if not running in vitest or inject is not available.
 */
async function tryGetInjectedConfig(): Promise<HarnessConfig | null> {
  try {
    // Dynamic import to avoid requiring vitest at runtime
    const { inject } = await import('vitest');
    const config = inject('harnessConfig');
    if (config) {
      return config;
    }
  } catch {
    // Not running in vitest or inject not available
  }
  return null;
}

/**
 * Options for the test environment.
 */
export interface TestEnvironmentOptions {
  /**
   * Organization ID (defaults to harness orgId).
   */
  orgId?: string;

  /**
   * Queue name (auto-generated if not provided).
   */
  queue?: string;

  /**
   * Worker authentication token (defaults to harness workerToken).
   */
  workerToken?: string;

  /**
   * API key for client operations (defaults to harness apiKey).
   */
  apiKey?: string;
}

/**
 * Test environment that manages Flovyn server via Testcontainers.
 *
 * This provides a complete test environment with PostgreSQL, NATS, and
 * Flovyn server containers for E2E testing.
 *
 * @example
 * ```typescript
 * describe('my workflow', () => {
 *   let env: FlovynTestEnvironment;
 *
 *   beforeAll(async () => {
 *     env = new FlovynTestEnvironment();
 *     env.registerWorkflow(myWorkflow);
 *     env.registerTask(myTask);
 *     await env.start();
 *   });
 *
 *   afterAll(async () => {
 *     await env.stop();
 *   });
 *
 *   it('should complete successfully', async () => {
 *     const handle = await env.startWorkflow(myWorkflow, { value: 42 });
 *     const result = await env.awaitCompletion(handle);
 *     expect(result.status).toBe('completed');
 *   });
 * });
 * ```
 */
export class FlovynTestEnvironment {
  /** Test timeout in milliseconds. */
  static readonly TEST_TIMEOUT = 60000;
  /** Default await timeout in milliseconds. */
  static readonly DEFAULT_AWAIT_TIMEOUT = 30000;
  /** Worker registration delay in milliseconds. */
  static readonly WORKER_REGISTRATION_DELAY = 500;

  private readonly _orgId?: string;
  private readonly _queue: string;
  private readonly _workerToken?: string;
  private readonly _apiKey?: string;
  private readonly _workflows: Map<string, WorkflowDefinition<unknown, unknown>> = new Map();
  private readonly _tasks: Map<string, TaskDefinition<unknown, unknown>> = new Map();
  private _harness: TestHarness | null = null;
  private _started = false;

  // Client and worker instances (to be set when FlovynClient is connected)
  private _clientModule: typeof import('../client') | null = null;
  private _client: InstanceType<typeof import('../client').FlovynClient> | null = null;

  constructor(options: TestEnvironmentOptions = {}) {
    if (options.orgId !== undefined) {
      this._orgId = options.orgId;
    }
    this._queue = options.queue ?? `test-${randomUUID().slice(0, 8)}`;
    if (options.workerToken !== undefined) {
      this._workerToken = options.workerToken;
    }
    if (options.apiKey !== undefined) {
      this._apiKey = options.apiKey;
    }
  }

  /**
   * Register a workflow for testing.
   */
  registerWorkflow<I, O>(workflow: WorkflowDefinition<I, O>): this {
    this._workflows.set(workflow.name, workflow as WorkflowDefinition<unknown, unknown>);
    return this;
  }

  /**
   * Register a task for testing.
   */
  registerTask<I, O>(task: TaskDefinition<I, O>): this {
    this._tasks.set(task.name, task as TaskDefinition<unknown, unknown>);
    return this;
  }

  /**
   * Start the test environment and worker.
   */
  async start(): Promise<void> {
    if (this._started) {
      return;
    }

    // Try to get injected config from vitest's globalSetup
    const injectedConfig = await tryGetInjectedConfig();

    // Get or create the test harness (pass config if available)
    this._harness = await getTestHarness(injectedConfig ?? undefined);

    // Use harness credentials if not explicitly set
    const orgId = this._orgId || this._harness.orgId;
    const workerToken = this._workerToken || this._harness.workerToken;
    const apiKey = this._apiKey || this._harness.apiKey;

    // Import FlovynClient dynamically
    this._clientModule = await import('../client');
    const { FlovynClient } = this._clientModule;

    // Build the client
    this._client = new FlovynClient({
      serverUrl: `http://${this._harness.grpcHost}:${this._harness.grpcPort}`,
      httpUrl: `http://${this._harness.httpHost}:${this._harness.httpPort}`,
      orgId,
      orgSlug: this._harness.orgSlug,
      queue: this._queue,
      workerToken,
      apiKey,
    });

    // Register all workflows
    for (const workflow of this._workflows.values()) {
      this._client.registerWorkflow(workflow);
    }

    // Register all tasks
    for (const task of this._tasks.values()) {
      this._client.registerTask(task);
    }

    // Start the client
    await this._client.start();

    // Wait for worker to be ready
    await this._awaitWorkerReady();

    this._started = true;
    console.log(`[FlovynTestEnvironment] Started with queue: ${this._queue}`);
  }

  /**
   * Wait for worker to be registered and ready.
   */
  private async _awaitWorkerReady(timeout = 10000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check if client is ready (has worker registered)
      // For now we just wait a bit since we don't have a status API yet
      if (this._client) {
        break;
      }
    }

    // Small delay for server-side processing
    await new Promise((resolve) =>
      setTimeout(resolve, FlovynTestEnvironment.WORKER_REGISTRATION_DELAY)
    );
  }

  /**
   * Stop the test environment.
   */
  async stop(): Promise<void> {
    if (this._client) {
      await this._client.stop();
    }

    this._started = false;
    console.log('[FlovynTestEnvironment] Stopped');
  }

  /**
   * Start a workflow for testing.
   *
   * @param workflow The workflow definition or workflow name.
   * @param input The workflow input.
   * @param options Start options (idempotencyKey for deduplication).
   * @returns An object containing the workflow handle.
   */
  async startWorkflow<I, O>(
    workflow: WorkflowDefinition<I, O> | string,
    input: I,
    options?: { idempotencyKey?: string }
  ): Promise<{ handle: WorkflowHandle<O> }> {
    if (!this._started || !this._client) {
      throw new Error('Test environment not started. Call start() first.');
    }

    const workflowDef =
      typeof workflow === 'string'
        ? (this._workflows.get(workflow) as WorkflowDefinition<I, O> | undefined)
        : workflow;

    if (!workflowDef) {
      throw new Error(`Unknown workflow: ${workflow}`);
    }

    const startOptions: import('../client').StartWorkflowOptions = {};
    if (options?.idempotencyKey !== undefined) {
      startOptions.idempotencyKey = options.idempotencyKey;
    }

    return this._client.startWorkflow(workflowDef, input, startOptions);
  }

  /**
   * Wait for a workflow to complete.
   *
   * @param handle The workflow handle.
   * @param timeout Maximum time to wait.
   * @returns The workflow result.
   */
  async awaitCompletion<O>(
    handle: WorkflowHandle<O>,
    timeout: Duration = Duration.milliseconds(FlovynTestEnvironment.DEFAULT_AWAIT_TIMEOUT)
  ): Promise<O> {
    // Use a timeout promise race
    const timeoutMs = timeout.toMilliseconds();

    return Promise.race([
      handle.result(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Workflow did not complete within ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  }

  /**
   * Start a workflow and wait for it to complete.
   *
   * @param workflow The workflow definition or workflow name.
   * @param input The workflow input.
   * @param options Options including idempotencyKey and timeout.
   * @returns The workflow result.
   */
  async startAndAwait<I, O>(
    workflow: WorkflowDefinition<I, O> | string,
    input: I,
    options?: { idempotencyKey?: string; timeout?: Duration }
  ): Promise<O> {
    const startOptions: { idempotencyKey?: string } = {};
    if (options?.idempotencyKey !== undefined) {
      startOptions.idempotencyKey = options.idempotencyKey;
    }
    const { handle } = await this.startWorkflow(workflow, input, startOptions);
    return this.awaitCompletion(handle, options?.timeout);
  }

  /**
   * Look up the promise UUID from workflow events.
   * This matches the Python SDK pattern of finding PROMISE_CREATED events.
   */
  private async _getPromiseId(workflowId: string, promiseName: string): Promise<string> {
    if (!this._harness) {
      throw new Error('Test harness not initialized');
    }

    const url = `http://${this._harness.httpHost}:${this._harness.httpPort}/api/orgs/${this._harness.orgSlug}/workflow-executions/${workflowId}/events`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this._harness.apiKey}`,
    };

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Failed to get workflow events: ${response.status}`);
    }

    const data = (await response.json()) as { events: Array<{ eventType: string; data: unknown }> };

    for (const event of data.events) {
      if (event.eventType === 'PROMISE_CREATED') {
        const eventData = event.data as { promiseName?: string; promiseId?: string };
        if (eventData.promiseName === promiseName && eventData.promiseId) {
          return eventData.promiseId;
        }
      }
    }

    throw new Error(`Promise '${promiseName}' not found in workflow events`);
  }

  /**
   * Resolve a promise by workflow handle and promise name.
   * Automatically looks up the promise UUID from workflow events.
   *
   * @param handle The workflow handle.
   * @param promiseName The promise name used in ctx.promise().
   * @param value The value to resolve the promise with.
   */
  async resolvePromise<T>(
    handle: WorkflowHandle<unknown>,
    promiseName: string,
    value: T
  ): Promise<void> {
    if (!this._started || !this._client) {
      throw new Error('Test environment not started. Call start() first.');
    }

    const promiseId = await this._getPromiseId(handle.workflowId, promiseName);
    await this._client.resolvePromise(promiseId, value);
  }

  /**
   * Reject a promise by workflow handle and promise name.
   * Automatically looks up the promise UUID from workflow events.
   *
   * @param handle The workflow handle.
   * @param promiseName The promise name used in ctx.promise().
   * @param error The error message.
   */
  async rejectPromise(
    handle: WorkflowHandle<unknown>,
    promiseName: string,
    error: string
  ): Promise<void> {
    if (!this._started || !this._client) {
      throw new Error('Test environment not started. Call start() first.');
    }

    const promiseId = await this._getPromiseId(handle.workflowId, promiseName);
    await this._client.rejectPromise(promiseId, error);
  }

  /**
   * Get the underlying FlovynClient.
   */
  get client(): InstanceType<typeof import('../client').FlovynClient> | null {
    return this._client;
  }

  /**
   * Get the queue name.
   */
  get queue(): string {
    return this._queue;
  }

  /**
   * Get the organization ID.
   */
  get orgId(): string | undefined {
    return this._orgId || this._harness?.orgId;
  }

  /**
   * Check if the environment is started.
   */
  get isStarted(): boolean {
    return this._started;
  }
}
