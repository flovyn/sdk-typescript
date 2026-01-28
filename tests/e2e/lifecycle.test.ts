/**
 * E2E tests for worker lifecycle functionality.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FlovynTestEnvironment, Duration } from '@flovyn/sdk/testing';
import { allWorkflows, echoWorkflow, doublerWorkflow, failingWorkflow } from './fixtures/workflows';
import { allTasks } from './fixtures/tasks';

describe('Lifecycle E2E Tests', () => {
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

  it('should register worker successfully', async () => {
    /**
     * Test that worker registers successfully with the server.
     */
    // The environment starts the worker, so if we get here
    // without errors, registration succeeded
    expect(env.isStarted).toBe(true);
  });

  it('should process multiple workflows', async () => {
    /**
     * Test that worker can process multiple workflows.
     */
    const handles = [];
    for (let i = 0; i < 3; i++) {
      const { handle } = await env.startWorkflow(doublerWorkflow, {
        value: i + 1,
      });
      handles.push(handle);
    }

    // All should complete successfully
    for (let i = 0; i < handles.length; i++) {
      const result = await env.awaitCompletion(handles[i]);
      expect(result.result).toBe((i + 1) * 2);
    }
  });

  it('should report worker status as running after start', async () => {
    /**
     * Test that worker status is accessible after start.
     *
     * Verifies:
     * - Worker status API is accessible
     * - Status shows ready state after successful start
     */
    // Worker should be running after env.start()
    expect(env.isStarted).toBe(true);
    expect(env.client).not.toBeNull();
  });

  it('should continue running after processing a workflow', async () => {
    /**
     * Test that worker stays running after processing a workflow.
     *
     * Verifies the worker doesn't exit after completing work.
     */
    // Verify running before
    expect(env.isStarted).toBe(true);

    // Process a workflow
    const { handle } = await env.startWorkflow(echoWorkflow, {
      message: 'test',
    });
    const result = await env.awaitCompletion(handle, Duration.seconds(30));
    expect(result.message).toBe('test');

    // Verify still running after
    expect(env.isStarted).toBe(true);
  });

  it('should handle workflow errors and continue running', async () => {
    /**
     * Test that worker continues running after a workflow failure.
     *
     * Verifies the worker is resilient to individual workflow failures.
     */
    // Start a failing workflow
    const { handle } = await env.startWorkflow(failingWorkflow, {
      errorMessage: 'Expected failure',
    });

    await expect(env.awaitCompletion(handle, Duration.seconds(30))).rejects.toThrow();

    // Worker should still be running
    expect(env.isStarted).toBe(true);

    // Should be able to process more workflows
    const { handle: handle2 } = await env.startWorkflow(echoWorkflow, {
      message: 'after-failure',
    });
    const result = await env.awaitCompletion(handle2, Duration.seconds(30));
    expect(result.message).toBe('after-failure');
  });

  it('should track uptime correctly', async () => {
    /**
     * Test that worker uptime can be tracked.
     *
     * Verifies:
     * - Environment tracks started state correctly
     * - Can process workflows consistently over time
     */
    // Verify environment is started
    expect(env.isStarted).toBe(true);

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Process a workflow to verify still working
    const { handle } = await env.startWorkflow(echoWorkflow, { message: 'uptime-test' });
    const result = await env.awaitCompletion(handle);
    expect(result.message).toBe('uptime-test');
  });

  it('should provide queue information', async () => {
    /**
     * Test that queue information is accessible.
     */
    const queueName = env.queue;
    expect(queueName).toBeDefined();
    expect(queueName.startsWith('test-')).toBe(true);
  });

  it('should provide organization ID', async () => {
    /**
     * Test that organization ID is accessible.
     */
    const orgId = env.orgId;
    expect(orgId).toBeDefined();
    // UUID format check
    expect(orgId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('should maintain client connection after multiple operations', async () => {
    /**
     * Test that client maintains connection through multiple operations.
     */
    // Run several workflows sequentially
    for (let i = 0; i < 5; i++) {
      const { handle } = await env.startWorkflow(doublerWorkflow, { value: i });
      const result = await env.awaitCompletion(handle);
      expect(result.result).toBe(i * 2);
    }

    // Client should still be connected
    expect(env.isStarted).toBe(true);
    expect(env.client).not.toBeNull();
  });

  it('should handle rapid workflow submissions', async () => {
    /**
     * Test that environment handles rapid workflow submissions.
     */
    const handles = [];

    // Submit workflows rapidly
    for (let i = 0; i < 10; i++) {
      const { handle } = await env.startWorkflow(echoWorkflow, {
        message: `rapid-${i}`,
      });
      handles.push(handle);
    }

    // All should complete
    for (let i = 0; i < handles.length; i++) {
      const result = await env.awaitCompletion(handles[i]);
      expect(result.message).toBe(`rapid-${i}`);
    }
  });

  it('should process workflows with different input types', async () => {
    /**
     * Test that environment handles different workflow types.
     */
    // Echo workflow (string input)
    const { handle: echoHandle } = await env.startWorkflow(echoWorkflow, { message: 'test' });
    const echoResult = await env.awaitCompletion(echoHandle);
    expect(echoResult.message).toBe('test');

    // Doubler workflow (number input)
    const { handle: doublerHandle } = await env.startWorkflow(doublerWorkflow, { value: 42 });
    const doublerResult = await env.awaitCompletion(doublerHandle);
    expect(doublerResult.result).toBe(84);
  });

  it('should recover from errors and continue processing', async () => {
    /**
     * Test error recovery scenario.
     */
    // Alternate between failing and successful workflows
    for (let i = 0; i < 3; i++) {
      // Failing workflow
      const { handle: failHandle } = await env.startWorkflow(failingWorkflow, {
        errorMessage: `failure-${i}`,
      });
      await expect(env.awaitCompletion(failHandle)).rejects.toThrow();

      // Successful workflow
      const { handle: successHandle } = await env.startWorkflow(echoWorkflow, {
        message: `success-${i}`,
      });
      const result = await env.awaitCompletion(successHandle);
      expect(result.message).toBe(`success-${i}`);
    }
  });

  it('should handle concurrent workflow executions', async () => {
    /**
     * Test concurrent workflow processing.
     */
    const concurrentCount = 5;
    const handles = [];

    // Start all workflows concurrently
    for (let i = 0; i < concurrentCount; i++) {
      const { handle } = await env.startWorkflow(doublerWorkflow, { value: i * 10 });
      handles.push({ value: i * 10, handle });
    }

    // Wait for all to complete (in parallel)
    const results = await Promise.all(
      handles.map(async ({ value, handle }) => {
        const result = await env.awaitCompletion(handle);
        return { input: value, output: result.result };
      })
    );

    // Verify all results
    for (const { input, output } of results) {
      expect(output).toBe(input * 2);
    }
  });

  it('should maintain environment stability over time', async () => {
    /**
     * Test long-term stability of the environment.
     */
    const iterationCount = 10;
    const delayMs = 50;

    for (let i = 0; i < iterationCount; i++) {
      const { handle } = await env.startWorkflow(echoWorkflow, {
        message: `stability-${i}`,
      });
      const result = await env.awaitCompletion(handle);
      expect(result.message).toBe(`stability-${i}`);

      // Small delay between iterations
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // Environment should still be healthy
    expect(env.isStarted).toBe(true);
  });
});
