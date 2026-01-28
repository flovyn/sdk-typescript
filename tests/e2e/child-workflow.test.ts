/**
 * E2E tests for child workflow functionality.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FlovynTestEnvironment, Duration } from '@flovyn/sdk/testing';
import {
  allWorkflows,
  childWorkflowWorkflow,
  childFailureWorkflow,
  nestedChildWorkflow,
} from './fixtures/workflows';
import { allTasks } from './fixtures/tasks';

describe('Child Workflow E2E Tests', () => {
  let env: FlovynTestEnvironment;

  beforeAll(async () => {
    env = new FlovynTestEnvironment();

    // Register all workflows and tasks
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

  it('should execute child workflow successfully', async () => {
    /**
     * Test successful child workflow execution.
     *
     * Flow:
     * 1. Parent workflow calls child workflow
     * 2. Child workflow completes successfully
     * 3. Parent workflow receives child result
     */
    const { handle } = await env.startWorkflow(childWorkflowWorkflow, {
      childInput: 'hello from parent',
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    // Child result should contain the echo message
    // echoWorkflow returns { message, timestamp }, so childResult is { message: "hello from parent", timestamp: ... }
    expect((result.childResult as { message: string }).message).toBe('hello from parent');
  });

  it('should handle child workflow failure', async () => {
    /**
     * Test child workflow failure handling.
     *
     * Flow:
     * 1. Parent workflow calls child workflow that fails
     * 2. Parent workflow catches the ChildWorkflowFailed exception
     * 3. Parent workflow handles the error gracefully
     */
    const { handle } = await env.startWorkflow(childFailureWorkflow, {
      errorMessage: 'intentional child failure',
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    // The parent should have caught the child failure
    expect(result.caughtError).not.toBe('');
    // Error message should contain the original error
    expect(
      result.caughtError.toLowerCase().includes('intentional child failure') ||
        result.caughtError.toLowerCase().includes('child')
    ).toBe(true);
  });

  it('should handle nested child workflows', async () => {
    /**
     * Test multi-level nested child workflows.
     *
     * Flow:
     * 1. Parent workflow calls child workflow
     * 2. Child workflow calls grandchild workflow
     * 3. All levels complete and return results
     */
    const { handle } = await env.startWorkflow(nestedChildWorkflow, {
      depth: 3,
      value: 'nested',
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(60));

    // Result should show all nesting levels
    expect(result.result).toContain('leaf:nested');
    expect(result.levels).toBe(3);
  });
});
