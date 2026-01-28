/**
 * E2E tests for error handling.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FlovynTestEnvironment, Duration } from '@flovyn/sdk/testing';
import { allWorkflows, failingWorkflow } from './fixtures/workflows';
import { allTasks } from './fixtures/tasks';

describe('Error E2E Tests', () => {
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

  it('should preserve specific error messages in workflow failures', async () => {
    /**
     * Test that specific error messages are preserved in workflow failures.
     *
     * This verifies that:
     * 1. Custom error messages are preserved through the failure
     * 2. Unique identifiers in error messages can be retrieved
     */
    const specificError = 'Custom error message with specific details XYZ-123';

    const { handle } = await env.startWorkflow(failingWorkflow, {
      errorMessage: specificError,
    });

    try {
      await env.awaitCompletion(handle, Duration.seconds(30));
      expect.fail('Expected workflow to fail');
    } catch (e) {
      const errorStr = String(e);
      // Verify the specific error identifier is preserved
      expect(errorStr).toContain('XYZ-123');
    }
  });
});
