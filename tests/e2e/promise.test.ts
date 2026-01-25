/**
 * E2E tests for promise functionality.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FlovynTestEnvironment, Duration } from '@flovyn/sdk/testing';
import { allWorkflows, awaitPromiseWorkflow } from './fixtures/workflows';
import { allTasks } from './fixtures/tasks';

describe('Promise E2E Tests', () => {
  let env: FlovynTestEnvironment;

  beforeAll(async () => {
    env = new FlovynTestEnvironment();

    for (const workflow of allWorkflows) {
      env.registerWorkflow(workflow);
    }
    for (const task of allTasks) {
      env.registerTask(task);
    }

    await env.start();
  }, 60000);

  afterAll(async () => {
    await env.stop();
  });

  it('should resolve external promise', async () => {
    /**
     * Test external promise resolution.
     *
     * Flow:
     * 1. Start workflow that waits for a promise
     * 2. Workflow suspends waiting for promise
     * 3. Resolve the promise externally (lookup promise ID from events)
     * 4. Workflow resumes and completes with the promise value
     */
    const handle = await env.startWorkflow(awaitPromiseWorkflow, {
      promiseName: 'approval',
      timeoutMs: 30000,
    });

    // Wait for workflow to suspend and create the promise
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Resolve the promise externally using handle + promise name
    // (test environment looks up the promise UUID from events automatically)
    await env.resolvePromise(handle, 'approval', { approved: true, approver: 'admin@example.com' });

    // Wait for workflow to complete
    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    // Verify the promise value was received
    expect(result.resolvedValue).toEqual({ approved: true, approver: 'admin@example.com' });
  });

  it('should reject external promise', async () => {
    /**
     * Test external promise rejection.
     *
     * Flow:
     * 1. Start workflow that waits for a promise
     * 2. Workflow suspends waiting for promise
     * 3. Reject the promise externally
     * 4. Workflow receives PromiseRejected error
     */
    const handle = await env.startWorkflow(awaitPromiseWorkflow, {
      promiseName: 'approval',
      timeoutMs: 30000,
    });

    // Wait for workflow to suspend and create the promise
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Reject the promise externally using handle + promise name
    await env.rejectPromise(handle, 'approval', 'Request denied by admin');

    // Workflow should fail with PromiseRejected
    await expect(env.awaitCompletion(handle, Duration.seconds(30))).rejects.toThrow(/denied|rejected/i);
  });

  it('should timeout promise when not resolved', async () => {
    /**
     * Test promise with timeout.
     *
     * Flow:
     * 1. Start workflow that waits for a promise with short timeout
     * 2. Don't resolve the promise
     * 3. Workflow should timeout with PromiseTimeout error
     */
    const handle = await env.startWorkflow(awaitPromiseWorkflow, {
      promiseName: 'approval',
      timeoutMs: 2000, // 2 second timeout
    });

    // Don't resolve the promise - let it timeout
    // The workflow should fail due to promise timeout
    await expect(env.awaitCompletion(handle, Duration.seconds(30))).rejects.toThrow(/timeout|timed out|failed/i);
  });
});
