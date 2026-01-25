/**
 * E2E tests for task streaming functionality.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FlovynTestEnvironment, Duration } from '@flovyn/sdk/testing';
import { allWorkflows, taskSchedulerWorkflow } from './fixtures/workflows';
import { allTasks } from './fixtures/tasks';

describe('Streaming E2E Tests', () => {
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

  it('should stream tokens from task', async () => {
    /**
     * Test that a task can stream tokens to connected clients.
     *
     * Verifies:
     * - Task can call stream_token()
     * - Task completes successfully after streaming
     * - Correct number of tokens were processed
     */
    const tokens = ['Hello', ' ', 'world', '!'];

    const handle = await env.startWorkflow(taskSchedulerWorkflow, {
      taskName: 'streaming-token-task',
      taskInput: { tokens },
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    // The task should have completed successfully
    expect(result.taskCompleted).toBe(true);
    // Verify token count from the task result
    expect(result.taskResult?.tokenCount).toBe(tokens.length);
  });

  it('should stream progress updates from task', async () => {
    /**
     * Test that a task can stream progress updates.
     *
     * Verifies:
     * - Task can call stream_progress()
     * - Progress values are valid (0.0 to 1.0)
     * - Task completes after streaming all progress
     */
    const steps = 5;

    const handle = await env.startWorkflow(taskSchedulerWorkflow, {
      taskName: 'streaming-progress-task',
      taskInput: { steps },
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    expect(result.taskCompleted).toBe(true);
    expect(result.taskResult?.finalProgress).toBe(1.0);
  });

  it('should stream data from task', async () => {
    /**
     * Test that a task can stream arbitrary data.
     *
     * Verifies:
     * - Task can call stream_data()
     * - Data is serialized correctly
     * - Task completes after streaming all data
     */
    const items = [
      { id: 1, name: 'item1' },
      { id: 2, name: 'item2' },
      { id: 3, name: 'item3' },
    ];

    const handle = await env.startWorkflow(taskSchedulerWorkflow, {
      taskName: 'streaming-data-task',
      taskInput: { items },
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    expect(result.taskCompleted).toBe(true);
    expect(result.taskResult?.itemsStreamed).toBe(items.length);
  });

  it('should stream error notifications from task', async () => {
    /**
     * Test that a task can stream error notifications.
     *
     * Verifies:
     * - Task can call stream_error()
     * - Task continues after streaming error (non-fatal)
     * - Task completes successfully
     */
    const handle = await env.startWorkflow(taskSchedulerWorkflow, {
      taskName: 'streaming-error-task',
      taskInput: {
        errorMessage: 'Recoverable warning',
        errorCode: 'WARN_001',
      },
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    expect(result.taskCompleted).toBe(true);
    expect(result.taskResult?.errorSent).toBe(true);
  });

  it('should stream all event types from task', async () => {
    /**
     * Test that a task can stream all event types in sequence.
     *
     * Verifies:
     * - Task can mix token, progress, data, and error streaming
     * - All stream calls succeed
     * - Task completes successfully
     */
    const handle = await env.startWorkflow(taskSchedulerWorkflow, {
      taskName: 'streaming-all-types-task',
      taskInput: {
        token: 'Generated token',
        progress: 0.75,
        data: { key: 'value', count: 42 },
        errorMessage: 'Warning: operation slow',
      },
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    expect(result.taskCompleted).toBe(true);
    expect(result.taskResult?.allTypesSent).toBe(true);
  });

  it('should stream custom/complex tokens', async () => {
    /**
     * Test streaming custom/complex tokens.
     *
     * Verifies:
     * - Tokens with special characters work
     * - Unicode tokens work
     * - Empty tokens work
     */
    // Include various token types
    const tokens = [
      'normal',
      '', // empty token
      'with spaces and\ttabs',
      'unicode: \u4e2d\u6587', // Chinese characters
      '{"json": true}', // JSON-like
      'emoji: \ud83d\ude80', // rocket emoji
    ];

    const handle = await env.startWorkflow(taskSchedulerWorkflow, {
      taskName: 'streaming-token-task',
      taskInput: { tokens },
    });

    const result = await env.awaitCompletion(handle, Duration.seconds(30));

    expect(result.taskCompleted).toBe(true);
    expect(result.taskResult?.tokenCount).toBe(tokens.length);
  });
});
