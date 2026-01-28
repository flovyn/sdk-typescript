/**
 * E2E tests for timer/sleep functionality.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FlovynTestEnvironment, Duration } from '@flovyn/sdk/testing';
import { allWorkflows, sleepWorkflow } from './fixtures/workflows';
import { allTasks } from './fixtures/tasks';

describe('Timer E2E Tests', () => {
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

  it('should handle short timer (100ms)', async () => {
    /**
     * Test timer with very short duration (100ms).
     * This tests that even short timers work correctly through suspend/resume.
     */
    const startTime = Date.now();

    const { handle } = await env.startWorkflow(sleepWorkflow, {
      durationMs: 100,
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));
    const wallElapsedMs = Date.now() - startTime;

    expect(result.sleptDurationMs).toBe(100);

    // Wall-clock time should be at least 100ms
    expect(wallElapsedMs).toBeGreaterThanOrEqual(100);
  });

  it('should handle durable timer with longer duration', async () => {
    /**
     * Test durable timer with longer duration.
     * The workflow sleeps for 1 second and returns timing information.
     */
    const startTime = Date.now();

    const { handle } = await env.startWorkflow(sleepWorkflow, {
      durationMs: 1000, // 1 second
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));
    const wallElapsedMs = Date.now() - startTime;

    expect(result.sleptDurationMs).toBe(1000);

    // Wall-clock time should be at least 1000ms
    expect(wallElapsedMs).toBeGreaterThanOrEqual(1000);
    // And not too much more (allow 5 seconds for overhead)
    expect(wallElapsedMs).toBeLessThan(6000);
  });
});
