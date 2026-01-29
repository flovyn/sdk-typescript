/**
 * Workflow and task handle implementations.
 *
 * Handles provide a way to interact with running workflows and tasks
 * from outside the execution context.
 */

import type { NapiClientInstance } from '@flovyn/native';
import type { WorkflowHandle } from './types';
import { deserialize } from './serde';

/**
 * Response from the workflow events REST API.
 */
interface WorkflowEvent {
  sequence: number;
  eventType: string;
  timestamp: string;
  data: {
    output?: unknown;
    error?: string;
    reason?: string;
    [key: string]: unknown;
  };
}

interface WorkflowEventsResponse {
  events: WorkflowEvent[];
}

/**
 * Workflow handle implementation for client-side workflow interaction.
 *
 * Note: Some operations (signal, cancel, get status) require server-side
 * APIs that may not be fully implemented in the native bindings yet.
 */
export class WorkflowHandleImpl<O> implements WorkflowHandle<O> {
  private _result: Promise<O> | null = null;

  constructor(
    private readonly client: NapiClientInstance,
    readonly workflowId: string,
    private readonly httpBaseUrl: string,
    private readonly orgSlug: string,
    private readonly apiKey?: string
  ) {}

  /**
   * Implement PromiseLike to allow direct awaiting.
   */
  then<TResult1 = O, TResult2 = never>(
    onfulfilled?: ((value: O) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.result().then(onfulfilled, onrejected);
  }

  /**
   * Get the workflow result by polling the events REST API.
   * This matches the Rust SDK approach of polling for completion events.
   */
  async result(): Promise<O> {
    if (this._result) {
      return this._result;
    }

    // Poll for completion events using REST API
    const pollIntervalMs = 500;
    const maxWaitMs = 60 * 60 * 1000; // 1 hour max
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const url = `${this.httpBaseUrl}/api/orgs/${this.orgSlug}/workflow-executions/${this.workflowId}/events`;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (this.apiKey) {
          headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        const response = await fetch(url, { headers });

        if (response.ok) {
          const data = (await response.json()) as WorkflowEventsResponse;

          // Check for completion events (matching Rust SDK approach)
          for (const event of data.events) {
            if (event.eventType === 'WORKFLOW_COMPLETED') {
              const output = event.data?.output ?? null;
              this._result = Promise.resolve(output as O);
              return this._result;
            }

            if (
              event.eventType === 'WORKFLOW_EXECUTION_FAILED' ||
              event.eventType === 'WORKFLOW_FAILED'
            ) {
              const error = event.data?.error ?? 'Workflow failed';
              throw new Error(error);
            }

            if (event.eventType === 'WORKFLOW_CANCELLED') {
              const reason = event.data?.reason ?? 'Workflow was cancelled';
              throw new Error(reason);
            }
          }

          // No completion event yet, continue polling
        }
      } catch (e) {
        // If it's a workflow error, rethrow
        if (e instanceof Error && !e.message.includes('fetch')) {
          throw e;
        }
        // Network errors, continue polling
      }

      // Wait before next poll
      await sleep(pollIntervalMs);
    }

    throw new Error('Timed out waiting for workflow result');
  }

  /**
   * Query the workflow state.
   */
  async query<T>(queryName: string, args?: unknown): Promise<T> {
    const result = await this.client.queryWorkflow(
      this.workflowId,
      queryName,
      JSON.stringify(args ?? null)
    );
    return deserialize<T>(result);
  }

  /**
   * Send a signal to the workflow.
   *
   * Note: Signal support requires server-side API that may not be
   * available in the current native bindings.
   */
  async signal(_signalName: string, _payload?: unknown): Promise<void> {
    // Signal would require a dedicated server endpoint
    // For now, this is not implemented in the native bindings
    throw new Error('Signal is not yet implemented in the native bindings');
  }

  /**
   * Request cancellation of the workflow.
   *
   * Note: Cancel support requires server-side API that may not be
   * available in the current native bindings.
   */
  async cancel(_reason?: string): Promise<void> {
    // Cancel would require a dedicated server endpoint
    // For now, this is not implemented in the native bindings
    throw new Error('Cancel is not yet implemented in the native bindings');
  }
}

/**
 * Sleep utility.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
